"""ตัดสินผลโพสต์ — "โพสต์ขึ้นแล้ว" ต้องไม่ไปโผล่เป็น error ในหน้างาน

หน้า publish และหน้าฟีดหลังโพสต์เล่นวิดีโอตลอด → uiautomator dump ไม่ผ่านทั้งคู่
ตัวยืนยันเดิมจึงตอบ "ยืนยันไม่ได้" ทุกครั้ง แล้วคลิปที่โพสต์สำเร็จถูกบันทึกเป็น
"โพสต์แล้วแต่ยืนยันผลไม่ได้" (สถานะ error) ทั้งที่ขึ้นจริง

หลักฐานที่ไม่ต้องพึ่ง dump: Shopee ออกจาก PublishVideoActivity เมื่อโพสต์ขึ้น
(พิสูจน์แล้วตอนปุ่มโพสต์พลาด — ค้างหน้าเดิม 2 รอบติด แล้วรอบที่กดโดนถึงออก)
"""
import pytest

from services.adb.autoposter import AutoPoster


@pytest.fixture
def poster(monkeypatch):
    p = AutoPoster.__new__(AutoPoster)
    p.TAG = "POST"; p.said = []; p.log = p.said.append
    p.settings = {}
    return p


def _base(monkeypatch, value):
    """ผลจากตัวยืนยันชั้นล่าง (verify_post)"""
    from services.adb import base_poster
    monkeypatch.setattr(base_poster.BasePoster, "_maybe_verify", lambda self, s: value)


def test_leaving_the_publish_page_counts_as_posted(poster, monkeypatch):
    _base(monkeypatch, "unverified")
    poster._left_publish = True
    poster._caption_unverified = False
    assert poster._maybe_verify("SER") is True
    assert any("ออกจากหน้าโพสต์" in m for m in poster.said)


def test_still_unverified_when_we_never_left_the_page(poster, monkeypatch):
    """ค้างหน้า publish = กดไม่ติด — ต้องไม่แกล้งบอกว่าสำเร็จ"""
    _base(monkeypatch, "unverified")
    poster._left_publish = False
    poster._caption_unverified = False
    assert poster._maybe_verify("SER") == "unverified"


def test_unreadable_caption_does_not_downgrade_a_confirmed_post(poster, monkeypatch):
    """อ่านแคปชั่นไม่ได้ ≠ แคปชั่นว่าง — ตัวหลังถูกดักไปแล้วก่อนกดโพสต์"""
    _base(monkeypatch, True)
    poster._left_publish = True
    poster._caption_unverified = True
    assert poster._maybe_verify("SER") is True


def test_unreadable_caption_still_downgrades_when_the_post_is_unconfirmed(poster, monkeypatch):
    _base(monkeypatch, True)
    poster._left_publish = False
    poster._caption_unverified = True
    assert poster._maybe_verify("SER") == "unverified"


def test_a_confirmed_failure_is_never_upgraded(poster, monkeypatch):
    """ตัวยืนยันบอกว่าโพสต์ไม่ขึ้น = เชื่อถือได้ ห้ามกลบด้วยการออกจากหน้า"""
    _base(monkeypatch, False)
    poster._left_publish = True
    poster._caption_unverified = False
    assert poster._maybe_verify("SER") is False
