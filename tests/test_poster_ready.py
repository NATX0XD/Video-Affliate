"""_ready() — ตรวจว่าหน้าถัดไปมาถึงหรือยัง แม้ uiautomator dump ไม่ได้

หน้า publish ของ Shopee เล่นพรีวิววิดีโอตลอด window จึงไม่เคย idle และ
`uiautomator dump` ล้มประจำ. เงื่อนไขหลายข้อดูแค่ "ชื่อ activity" ไม่ได้ใช้ node เลย
ถ้าข้ามการตรวจทุกครั้งที่ dump ไม่ได้ จะฟ้องว่าขั้นตอนล้มทั้งที่อยู่หน้าถูกแล้ว
(เจอจริงบน SM-A576B: next_2 ล้มหลังลอง 3 รอบ ทั้งที่ถึง PublishVideoActivity แล้ว)
"""
import pytest

from services.adb.autoposter import AutoPoster
from services.adb import ui_finder as UF


@pytest.fixture
def poster(monkeypatch):
    p = AutoPoster.__new__(AutoPoster)          # ข้าม __init__ (ต้องใช้ adb จริง)
    p.TAG = "POST"
    p.said = []
    p.log = p.said.append
    return p


def _no_dump(monkeypatch):
    monkeypatch.setattr(UF, "dump_nodes", lambda *a, **k: [])


def test_activity_only_check_passes_without_a_dump(poster, monkeypatch):
    """next_2 ดูแค่ชื่อหน้า — dump ไม่ได้ก็ต้องผ่าน"""
    _no_dump(monkeypatch)
    monkeypatch.setattr(poster, "_current_activity",
                        lambda s: "com.shopee.sz.luckyvideo.publishvideo.PublishVideoActivity",
                        raising=False)
    assert poster._ready("SER", "next_2", timeout=0) is True
    assert any("ชื่อหน้าตรงแล้ว" in m for m in poster.said)   # บอกให้รู้ว่าผ่านทางนี้


def test_activity_only_check_still_fails_on_the_wrong_page(poster, monkeypatch):
    _no_dump(monkeypatch)
    monkeypatch.setattr(poster, "_current_activity",
                        lambda s: "com.shopee.app.ui.home.HomeActivity_", raising=False)
    assert poster._ready("SER", "next_2", timeout=0) is False


@pytest.mark.parametrize("key", ["live_video_tab", "plus_button", "gallery",
                                 "video_filter", "add_product", "link_icon"])
def test_node_based_checks_do_not_pass_on_an_empty_dump(poster, monkeypatch, key):
    """เงื่อนไขที่ต้องใช้ node ต้องไม่กลายเป็น "ผ่าน" เพราะไม่มี node — ไม่งั้นเดินหน้าทั้งที่ยังไม่ถึง"""
    _no_dump(monkeypatch)
    monkeypatch.setattr(poster, "_current_activity",
                        lambda s: "com.shopee.sz.luckyvideo.publishvideo.PublishVideoActivity",
                        raising=False)
    assert poster._ready("SER", key, timeout=0) is False


def test_unknown_key_is_treated_as_ready(poster, monkeypatch):
    _no_dump(monkeypatch)
    monkeypatch.setattr(poster, "_current_activity", lambda s: "x", raising=False)
    assert poster._ready("SER", "ไม่มีเงื่อนไข", timeout=0) is True
