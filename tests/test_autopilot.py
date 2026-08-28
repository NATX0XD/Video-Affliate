"""autopilot — _post_one decision priority, _device_lock ต่อ serial, restore() จาก DB."""
import threading

import pytest

from services import autopilot as ap_mod
from services.autopilot import AutoPilot
from services.db import GENERATED, POSTED, ERROR


# ── _device_lock ─────────────────────────────────────────────────────────────

def test_device_lock_same_serial_same_lock():
    ap = AutoPilot(db=None, adb=None)
    a1 = ap._device_lock("serialA")
    a2 = ap._device_lock("serialA")
    b1 = ap._device_lock("serialB")
    assert a1 is a2                # เครื่องเดียวกัน = lock เดียวกัน (กันโพสต์ชน)
    assert a1 is not b1            # คนละเครื่อง = คนละ lock (ยังโพสต์ขนานได้)
    assert isinstance(a1, type(threading.Lock()))


# ── restore() persistence ────────────────────────────────────────────────────

def test_restore_defaults_off(store):
    ap = AutoPilot(store, adb=None)
    ap.log = lambda *a, **k: None
    ap.restore()
    assert ap.enabled is False      # ครั้งแรก default ปิดเพื่อความปลอดภัย


def test_restore_reads_persisted_on(store):
    ap1 = AutoPilot(store, adb=None)
    ap1.log = lambda *a, **k: None
    ap1.set_enabled(True)           # เขียน autopilot_on=1 ลง DB

    # สร้าง instance ใหม่ (จำลองรีสตาร์ตโปรแกรม) → ต้องคืนสถานะเปิดจาก DB
    ap2 = AutoPilot(store, adb=None)
    ap2.log = lambda *a, **k: None
    ap2.restore()
    assert ap2.enabled is True
    assert store.get_config("autopilot_on") == "1"


def test_restore_reads_persisted_off(store):
    ap1 = AutoPilot(store, adb=None)
    ap1.log = lambda *a, **k: None
    ap1.set_enabled(True)
    ap1.set_enabled(False)          # เขียน 0

    ap2 = AutoPilot(store, adb=None)
    ap2.log = lambda *a, **k: None
    ap2.restore()
    assert ap2.enabled is False


# ── _post_one decision priority: fail > unverified > done ─────────────────────

class _FakePoster:
    def __init__(self, result):
        self.result = result

    def process(self, serial, video_path, product, dry_run=False, coords_override=None):
        return self.result


def _run_post_one(store, monkeypatch, tmp_path, results, max_attempts=1):
    """เตรียม job (generated) + video จริง แล้วรัน _post_one โดย monkeypatch make_poster
    ให้คืนผลตาม `results` (ทีละแพลตฟอร์ม). คืน job dict หลังตัดสินผล."""
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"FAKEVIDEO")

    product = {
        "product_id": "p-decide",
        "basic_info": {"name": "สินค้า", "price": 100},
        "commission": {"rate": 5},
    }
    jid = store.import_clip(product, GENERATED, str(video), None)
    # บังคับ max_attempts เพื่อคุมพฤติกรรม retry (ค่า default 3)
    store.update(jid, max_attempts=max_attempts)
    job = store.get(jid)

    platforms = ["shopee", "tiktok"][:len(results)]
    settings = {"platforms": platforms}

    it = iter(results)
    monkeypatch.setattr(ap_mod, "make_poster",
                        lambda key, adb, log, s: _FakePoster(next(it)))

    ap = AutoPilot(store, adb=None)   # adb=None → ข้าม dev.posting flag
    ap.log = lambda *a, **k: None
    ap._post_one(job, "SER1", settings, platforms)
    return store.get(jid), ap


def test_post_one_all_success_marks_done(store, monkeypatch, tmp_path):
    job, ap = _run_post_one(store, monkeypatch, tmp_path, [True, True])
    assert job["status"] == POSTED
    assert ap.done_count == 1


def test_post_one_unverified_beats_success(store, monkeypatch, tmp_path):
    """สำเร็จ 1 + ยืนยันไม่ได้ 1 → ต้องไม่เข้า DONE เงียบ (unverified ชนะ done)."""
    job, ap = _run_post_one(store, monkeypatch, tmp_path, ["unverified", True])
    assert job["status"] == ERROR
    assert "ยืนยันผลไม่ได้" in job["error"]
    assert ap.done_count == 0
    assert ap.err_count == 1


def test_post_one_failure_beats_unverified(store, monkeypatch, tmp_path):
    """ล้มจริง 1 + ยืนยันไม่ได้ 1 → fail ชนะ (record_failure, ไม่ใช่ข้อความ unverified)."""
    job, ap = _run_post_one(store, monkeypatch, tmp_path, ["unverified", False],
                            max_attempts=1)
    assert job["status"] == ERROR
    # fail branch ใช้ข้อความ record_failure "โพสต์ไม่สำเร็จ" ไม่ใช่ข้อความ unverified
    assert "ยืนยันผลไม่ได้" not in job["error"]
    assert ap.err_count == 1


def test_post_one_failure_retries_when_attempts_left(store, monkeypatch, tmp_path):
    """ล้มจริงแต่ยังเหลือ attempt → กลับไป generated (retry) ไม่ใช่ error."""
    job, ap = _run_post_one(store, monkeypatch, tmp_path, [False], max_attempts=3)
    assert job["status"] == GENERATED   # retry_status
    assert ap.err_count == 0


# ── post_jobs_now: เลือกหลายคลิป → เลือกเครื่อง → โพสต์ทีเดียว ────────────────

class _FakeDev:
    def __init__(self, serial, status="device"):
        self.serial, self.status, self.posting = serial, status, False


class _FakeAdb:
    def __init__(self, *serials):
        self.devices = {s: _FakeDev(s) for s in serials}


def _bulk_ready(monkeypatch, ap):
    """ผ่านด่าน 'เลือกแพลตฟอร์มแล้ว' + ดักการโพสต์จริง คืนลิสต์ที่ถูกโพสต์ (jid, serial)"""
    monkeypatch.setattr(ap_mod, "ready_enabled", lambda s: ["shopee"])
    done = []
    monkeypatch.setattr(ap, "_post_one", lambda job, serial, s, dev_plats=None: done.append((job["id"], serial)))
    return done


def _mk_job(store, tmp_path, name="p"):
    v = tmp_path / f"{name}.mp4"
    v.write_bytes(b"V")
    return store.import_clip({"product_id": name, "basic_info": {"name": name}}, GENERATED, str(v), None)


def test_post_jobs_now_uses_chosen_device_for_every_clip(store, monkeypatch, tmp_path):
    ap = AutoPilot(store, adb=_FakeAdb("SER1", "SER2"))
    ap.log = lambda *a, **k: None
    done = _bulk_ready(monkeypatch, ap)
    ids = [_mk_job(store, tmp_path, f"p{i}") for i in range(3)]

    r = ap.post_jobs_now(ids, "SER2")
    assert r["ok"] is True and r["queued"] == 3
    for t in [t for t in threading.enumerate() if t.name.startswith("PostBatch-")]:
        t.join(timeout=5)
    assert sorted(done) == sorted((i, "SER2") for i in ids)   # เครื่องที่เลือกทับ assignment เดิม


def test_post_jobs_now_falls_back_to_assignment(store, monkeypatch, tmp_path):
    """ไม่ได้เลือกเครื่องในแถบคำสั่ง → คลิปไหน assign ไว้ก็ไปเครื่องนั้น"""
    ap = AutoPilot(store, adb=_FakeAdb("SER1", "SER2"))
    ap.log = lambda *a, **k: None
    done = _bulk_ready(monkeypatch, ap)
    a, b = _mk_job(store, tmp_path, "pa"), _mk_job(store, tmp_path, "pb")
    store.set_job_assignment(a, "SER2")
    store.set_job_assignment(b, "SER1")

    assert ap.post_jobs_now([a, b], "")["ok"] is True
    for t in [t for t in threading.enumerate() if t.name.startswith("PostBatch-")]:
        t.join(timeout=5)
    assert sorted(done) == sorted([(a, "SER2"), (b, "SER1")])


def test_post_jobs_now_marks_queued_clips_posting(store, monkeypatch, tmp_path):
    """ตั้งสถานะทันทีที่รับงาน — ไม่งั้นผู้ใช้กดซ้ำเพราะไม่เห็นอะไรเปลี่ยน"""
    from services.db import POSTING
    ap = AutoPilot(store, adb=_FakeAdb("SER1"))
    ap.log = lambda *a, **k: None
    seen = []
    monkeypatch.setattr(ap_mod, "ready_enabled", lambda s: ["shopee"])
    monkeypatch.setattr(ap, "_post_one", lambda job, serial, s, dev_plats=None: seen.append(store.get(job["id"])["status"]))
    ids = [_mk_job(store, tmp_path, f"q{i}") for i in range(2)]
    ap.post_jobs_now(ids, "SER1")
    for t in [t for t in threading.enumerate() if t.name.startswith("PostBatch-")]:
        t.join(timeout=5)
    assert seen == [POSTING, POSTING]


def test_post_jobs_now_skips_clips_that_are_not_ready(store, monkeypatch, tmp_path):
    ap = AutoPilot(store, adb=_FakeAdb("SER1"))
    ap.log = lambda *a, **k: None
    done = _bulk_ready(monkeypatch, ap)
    ok = _mk_job(store, tmp_path, "ok")
    already = _mk_job(store, tmp_path, "already")
    store.set_status(already, POSTED)

    r = ap.post_jobs_now([ok, already, 99999], "SER1")
    for t in [t for t in threading.enumerate() if t.name.startswith("PostBatch-")]:
        t.join(timeout=5)
    assert r["queued"] == 1
    assert sorted(r["skipped"]) == sorted([already, 99999])
    assert done == [(ok, "SER1")]


def test_post_jobs_now_refuses_offline_device(store, monkeypatch, tmp_path):
    ap = AutoPilot(store, adb=_FakeAdb("SER1"))
    ap.log = lambda *a, **k: None
    _bulk_ready(monkeypatch, ap)
    jid = _mk_job(store, tmp_path, "x")
    r = ap.post_jobs_now([jid], "GHOST")
    assert r["ok"] is False and "ออฟไลน์" in r["error"]
    assert store.get(jid)["status"] == GENERATED    # ไม่แตะสถานะเมื่อสั่งไม่ผ่าน


def test_post_jobs_now_needs_ids(store, monkeypatch):
    ap = AutoPilot(store, adb=_FakeAdb("SER1"))
    ap.log = lambda *a, **k: None
    assert ap.post_jobs_now([], "SER1")["ok"] is False


def test_post_one_missing_video_is_error(store, monkeypatch, tmp_path):
    product = {"product_id": "p-missing", "basic_info": {"name": "x"}}
    jid = store.import_clip(product, GENERATED, str(tmp_path / "gone.mp4"), None)
    job = store.get(jid)
    monkeypatch.setattr(ap_mod, "make_poster",
                        lambda *a, **k: _FakePoster(True))
    ap = AutoPilot(store, adb=None)
    ap.log = lambda *a, **k: None
    ap._post_one(job, "SER1", {"platforms": ["shopee"]}, ["shopee"])
    assert store.get(jid)["status"] == ERROR
    assert ap.err_count == 1
