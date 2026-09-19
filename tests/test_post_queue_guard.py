"""คิวโพสต์ต้องไม่โพสต์คลิปเดียวกันสองรอบ

เส้นทางที่ทำให้เกิดโพสต์ซ้ำ (เจอตอนตรวจโค้ด):
  post_jobs_now ตั้งทุกคลิปในชุดเป็น 'posting' พร้อมกัน แล้วโพสต์ทีละคลิปในเธรดเดียว
  คลิปท้ายชุดจึงนั่งรอคิวได้เป็นสิบ ๆ นาทีโดย updated_at ไม่ขยับ
  → _sweep_stale เห็นว่า "ค้าง" แล้วดึงกลับเป็น 'generated'
  → worker ของเครื่องนั้น claim ไปโพสต์
  → เธรดของชุดเดิมก็ยังวนมาโพสต์คลิปนั้นอีกรอบ (เดิมเช็คแค่ `if job:`)
"""
import pytest

from services import autopilot as ap_mod
from services.autopilot import AutoPilot
from services.db import GENERATED, POSTING


def _clip(store, tmp_path, name):
    video = tmp_path / f"{name}.mp4"
    video.write_bytes(b"FAKEVIDEO")
    product = {"product_id": name, "basic_info": {"name": name, "price": 1},
               "commission": {"rate": 1}}
    return store.import_clip(product, GENERATED, str(video), None)


@pytest.fixture
def pilot(store, monkeypatch):
    ap = AutoPilot(store, adb=None)
    ap.log = lambda *a, **k: None
    ap.posted = []
    # _post_one ตัวจริงไปแตะ adb — เราสนใจแค่ "คลิปไหนถูกส่งไปโพสต์บ้าง"
    ap._post_one = lambda job, serial, s, plats=None: ap.posted.append(job["id"])
    ap._device_online = lambda serial: True
    monkeypatch.setattr(ap_mod.cfg, "load", lambda: {"platforms": ["shopee"]})
    # เธรดในเทสต์ = รันตรง ๆ (ไม่งั้นต้องมานั่ง join)
    monkeypatch.setattr(ap_mod.threading, "Thread",
                        lambda target=None, **kw: type("T", (), {"start": target})())
    return ap


def test_batch_skips_a_clip_that_was_requeued_while_waiting(pilot, store, tmp_path):
    a = _clip(store, tmp_path, "a")
    b = _clip(store, tmp_path, "b")
    pilot.post_jobs_now([a, b], serial="SER1")
    assert pilot.posted == [a, b]          # ปกติ: โพสต์ครบทั้งชุด

    # รอบใหม่: จำลอง _sweep_stale ดึงคลิป b กลับเข้าคิวระหว่างที่ชุดยังรอ
    store.set_status(a, GENERATED)
    store.set_status(b, GENERATED)
    pilot.posted.clear()
    orig = pilot._post_one

    def steal(job, serial, s, plats=None):
        orig(job, serial, s, plats)
        if job["id"] == a:                  # ระหว่างโพสต์ a → b ถูกดึงกลับเข้าคิว
            store.set_status(b, GENERATED)

    pilot._post_one = steal
    pilot.post_jobs_now([a, b], serial="SER1")
    assert pilot.posted == [a]              # b ต้องไม่ถูกโพสต์ซ้ำโดยชุดนี้
    assert store.get(b)["status"] == GENERATED   # ยังอยู่ในคิว ไม่ได้หายไปไหน


def test_batch_marks_everything_posting_upfront(pilot, store, tmp_path):
    """ผู้ใช้ต้องเห็นทันทีว่าทั้งชุดถูกรับเข้าคิวแล้ว"""
    seen = []
    pilot._post_one = lambda job, serial, s, plats=None: seen.append(
        store.get(job["id"])["status"])
    a = _clip(store, tmp_path, "a")
    res = pilot.post_jobs_now([a], serial="SER1")
    assert res["ok"] and res["queued"] == 1
    assert seen == [POSTING]


# ── เพดาน "ค้างนานเกินไป" ต้องยาวกว่าเวลาโพสต์จริงเสมอ ───────────────────────

def test_stale_window_never_shorter_than_the_constant(pilot, monkeypatch):
    monkeypatch.setattr(ap_mod.cfg, "load", lambda: {})
    assert pilot._stale_secs() >= AutoPilot.STALE_POSTING_SEC


def test_stale_window_grows_with_a_longer_post_timeout(pilot, monkeypatch):
    """post_timeout_sec=1800 → ค่าคงที่ 1200 จะไปดึงคลิปที่ยังโพสต์อยู่ออกมาโพสต์ซ้ำ"""
    monkeypatch.setattr(ap_mod.cfg, "load", lambda: {"post_timeout_sec": 1800})
    assert pilot._stale_secs() > 1800


def test_stale_window_survives_a_broken_setting(pilot, monkeypatch):
    """ค่าตั้งพัง → ต้องได้ค่าปลอดภัยเดิม ไม่ใช่ระเบิดจนตัวกวาดงานค้างไม่ทำงาน"""
    monkeypatch.setattr(ap_mod.cfg, "load", lambda: {"post_timeout_sec": "ไม่ใช่ตัวเลข"})
    monkeypatch.setattr(ap_mod.cfg, "load", lambda: {})
    baseline = pilot._stale_secs()
    monkeypatch.setattr(ap_mod.cfg, "load", lambda: {"post_timeout_sec": "ไม่ใช่ตัวเลข"})
    assert pilot._stale_secs() == baseline >= AutoPilot.STALE_POSTING_SEC
