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


# ── ลำดับทับกันของพิกัด: class R → preset ตามจอ → override ต่อเครื่อง ──────────

def _mk(w=1080, h=2340):
    p = AutoPoster.__new__(AutoPoster)
    p.TAG = "POST"; p.said = []; p.log = p.said.append
    p._w, p._h = w, h
    return p


def test_device_override_does_not_wipe_the_resolution_preset():
    """เครื่องมี override แค่บางคีย์ ต้องไม่ทำให้ preset ของจอหายทั้งชุด

    เจอจริงบน SM-A576B: preset ขึ้นใน log แต่ตอนแตะกลับใช้ค่า base
    เพราะ _apply_coords_override เริ่มใหม่จาก class R ทับ preset ที่เพิ่งใส่
    ผลคือปุ่มโพสต์พลาดไป 94px แล้วคลิปไม่ได้ถูกโพสต์จริง
    """
    p = _mk()
    p._apply_resolution_preset()
    from_preset = p.R["post_button"]
    assert from_preset == AutoPoster.R_PRESETS[(1080, 2340)]["post_button"]

    p._apply_coords_override({"live_video_tab": [0.5833, 0.9517]})   # คีย์อื่นล้วน
    assert p.R["post_button"] == from_preset, "preset ของจอต้องอยู่ครบหลังใส่ override"
    assert p.R["live_video_tab"] == (0.5833, 0.9517), "override ต้องชนะ"


def test_override_still_wins_over_the_preset_for_the_same_key():
    p = _mk()
    p._apply_resolution_preset()
    p._apply_coords_override({"post_button": [0.4, 0.8]})
    assert p.R["post_button"] == (0.4, 0.8)


def test_unknown_resolution_keeps_class_defaults():
    p = _mk(999, 999)
    p._apply_resolution_preset()
    p._apply_coords_override(None)
    assert p.R["post_button"] == AutoPoster.R["post_button"]


# ── "อ่านหน้าจอไม่ได้" ต้องไม่ถูกนับเป็น "แตะไม่ติด" ──────────────────────────

def _blind(poster, monkeypatch, act="com.shopee.app.ui.home.HomeActivity_"):
    """จำลองเครื่องที่ dump ไม่ผ่านเลย (ฟีดวิดีโอเล่นตลอด)"""
    _no_dump(monkeypatch)
    monkeypatch.setattr(poster, "_current_activity", lambda s: act, raising=False)
    monkeypatch.setattr(poster, "_tap_r", lambda *a, **k: None, raising=False)


def test_ready_marks_itself_blind_when_no_dump_ever_arrives(poster, monkeypatch):
    _blind(poster, monkeypatch)
    assert poster._ready("SER", "live_video_tab", timeout=0) is False
    assert poster._ready_blind is True          # ตอบไม่ได้ ไม่ใช่ตอบว่าไม่พร้อม


def test_ready_is_not_blind_when_the_page_was_readable(poster, monkeypatch):
    """อ่านหน้าจอได้แต่เงื่อนไขไม่ผ่าน = คำตอบเชื่อถือได้ ต้องไม่ถือว่า 'ไม่รู้'"""
    monkeypatch.setattr(UF, "dump_nodes", lambda *a, **k: ["node"])
    monkeypatch.setattr(poster, "_current_activity",
                        lambda s: "com.shopee.app.ui.home.HomeActivity_", raising=False)
    assert poster._ready("SER", "next_2", timeout=0) is False
    assert poster._ready_blind is False


def test_step_continues_when_readiness_cannot_be_judged(poster, monkeypatch):
    """เจอจริงบนแท็บเล็ต: live_video_tab ล้ม 3 รอบเพราะ dump ไม่ผ่าน แล้วตัดจบทั้งงาน"""
    _blind(poster, monkeypatch)
    assert poster._step("SER", "live_video_tab", tries=2, settle=0, timeout=0) is True
    assert any("ให้ขั้นถัดไปเป็นตัวตัดสิน" in m for m in poster.said)


def test_step_still_fails_when_the_screen_says_not_ready(poster, monkeypatch):
    """อ่านหน้าจอได้และบอกว่ายังไม่ถึง = ล้มจริง ต้องไม่ปล่อยผ่าน"""
    monkeypatch.setattr(UF, "dump_nodes", lambda *a, **k: ["node"])
    monkeypatch.setattr(poster, "_current_activity",
                        lambda s: "com.shopee.app.ui.home.HomeActivity_", raising=False)
    monkeypatch.setattr(poster, "_tap_r", lambda *a, **k: None, raising=False)
    assert poster._step("SER", "next_2", tries=2, settle=0, timeout=0) is False
