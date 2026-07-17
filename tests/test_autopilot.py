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

    def process(self, serial, video_path, product, dry_run=False):
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
