"""หลักฐานว่า "โพสต์ขึ้นจริง" ต้องเป็นหลักฐานจริง ไม่ใช่การอ่านหน้าจอไม่ได้

บั๊กที่เทสต์ชุดนี้ล็อกไว้ (เจอตอนตรวจโค้ด ยังไม่มีแท็บเล็ตให้รันจริง):
  1. _current_activity คืน "" เมื่อ dumpsys ไทม์เอาต์/มือถือหลุดชั่วขณะ
     _wait_leave_publish เดิมเช็คแค่ `"PublishVideoActivity" not in act`
     → "" ผ่านทันที = "ออกจากหน้า publish แล้ว" = "โพสต์ขึ้นแล้ว"
     แล้ว _maybe_verify ยกผลขึ้นเป็นสำเร็จ → คลิปเข้า "เสร็จสิ้น" ทั้งที่ไม่เคยขึ้น
  2. _tap_post_until_left เดิม: อ่านชื่อหน้าไม่ได้ → on_publish=False → กด 1 ที
     แล้ว return True โดยไม่มีหลักฐานอะไรเลย
  3. ทุก poster ที่ไม่ใช่ Shopee คืน True ทันทีที่ "แตะปุ่มโพสต์ติด" แล้ว
     verify_post ที่หา keyword ไม่เจอจะตัดสินว่าสำเร็จ (conservative) → ปิดเงียบ
"""
import pytest

from services.adb.autoposter import AutoPoster
from services.adb.base_poster import BasePoster


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    """ตัดเวลานอนทิ้งทั้งไฟล์ — ลูปรอผลโพสต์นับเป็นวินาทีจริง"""
    import services.adb.autoposter as ap_mod
    import services.adb.base_poster as bp_mod
    monkeypatch.setattr(ap_mod.time, "sleep", lambda *_: None)
    monkeypatch.setattr(bp_mod.time, "sleep", lambda *_: None)


@pytest.fixture
def poster():
    p = AutoPoster.__new__(AutoPoster)
    p.said = []
    p.log = p.said.append
    p.settings = {}
    p._w, p._h = 1080, 2340
    p._left_publish = False
    p.R = dict(AutoPoster.R)
    return p


def _acts(poster, seq):
    """ป้อนชื่อ activity ทีละรอบ (ตัวสุดท้ายค้างไว้)"""
    box = list(seq)
    def fake(_serial):
        return box.pop(0) if len(box) > 1 else box[0]
    poster._current_activity = fake


PUB = "com.shopee.th/com.shopee.app.ui.video.PublishVideoActivity"
FEED = "com.shopee.th/com.shopee.app.ui.home.HomeActivity"
LAUNCHER = "com.sec.android.app.launcher/com.android.launcher3.Launcher"


# ── _wait_leave_publish: หลักฐานต้องอ่านได้จริง ──────────────────────────────

def test_unreadable_activity_is_not_proof_of_posting(poster):
    """อ่านชื่อหน้าไม่ได้ = ไม่รู้ ห้ามนับเป็น 'ออกจากหน้า publish แล้ว'"""
    _acts(poster, [""])
    assert poster._wait_leave_publish("SER", 3) is False
    assert poster._left_publish is False
    assert any("อ่านชื่อหน้าไม่ได้" in m for m in poster.said)


def test_leaving_to_another_shopee_page_is_proof(poster):
    _acts(poster, [PUB, PUB, FEED])
    assert poster._wait_leave_publish("SER", 5) is True
    assert poster._left_publish is True


def test_leaving_shopee_entirely_is_not_proof(poster):
    """แอปเด้ง/ถูกปิด → ออกจากหน้า publish เหมือนกัน แต่ไม่ได้แปลว่าโพสต์ขึ้น"""
    _acts(poster, [PUB, LAUNCHER])
    assert poster._wait_leave_publish("SER", 5) is False
    assert poster._left_publish is False
    assert any("นอกแอป Shopee" in m for m in poster.said)


def test_staying_on_publish_is_not_proof(poster):
    _acts(poster, [PUB])
    assert poster._wait_leave_publish("SER", 3) is False
    assert poster._left_publish is False


# ── _tap_post_until_left ────────────────────────────────────────────────────

def _arm_tap(poster, pill=True):
    """นับจำนวนครั้งที่กดปุ่มโพสต์ + คุมว่า 'ปุ่มส้มยังอยู่บนจอไหม'"""
    poster.taps = []
    poster._dismiss_keyboard = lambda s: None
    poster._tap_r = lambda s, key, settle=2.0: poster.taps.append(key)
    poster._find_orange_pill = lambda s, ry, **kw: (10, 20) if pill else None


def test_unreadable_activity_never_reports_a_post_it_cannot_see(poster):
    """เดิม: อ่านชื่อหน้าไม่ได้ → กด 1 ที → return True (สำเร็จลอย ๆ)"""
    _arm_tap(poster, pill=True)
    _acts(poster, [""])
    assert poster._tap_post_until_left("SER") is False
    assert poster.taps == ["post_button"] * AutoPoster.POST_TAP_TRIES
    assert poster._left_publish is False


def test_does_not_tap_post_when_we_are_provably_on_another_page(poster):
    """หลุดไปหน้าอื่นแล้ว = แตะพิกัดปุ่มโพสต์คือแตะมั่ว → ห้ามกด ห้ามบอกว่าสำเร็จ"""
    _arm_tap(poster, pill=True)
    _acts(poster, [FEED])
    assert poster._tap_post_until_left("SER") is False
    assert poster.taps == []


def test_post_succeeds_when_the_page_really_changes(poster):
    _arm_tap(poster, pill=True)
    _acts(poster, [PUB, PUB, FEED])
    assert poster._tap_post_until_left("SER") is True
    assert poster._left_publish is True
    assert len(poster.taps) == 1


def test_button_gone_but_still_on_publish_stays_unresolved(poster):
    """ปุ่มหาย = น่าจะกดติดแต่กำลังอัปโหลด — ห้ามบอกว่าล้ม (retry = โพสต์ซ้ำ)"""
    _arm_tap(poster, pill=False)
    _acts(poster, [PUB])
    assert poster._tap_post_until_left("SER") is True     # ปล่อยให้ชั้นยืนยันตัดสิน
    assert poster._left_publish is False


# ── _confirm_posted: "แตะปุ่มติด" ≠ "โพสต์ขึ้น" ──────────────────────────────

class _Root:
    def __init__(self, texts):
        self._texts = texts

    def iter(self, _tag):
        import xml.etree.ElementTree as ET
        out = []
        for t in self._texts:
            e = ET.Element("node")
            e.set("text", t)
            e.set("content-desc", "")
            out.append(e)
        return out


def _bp(dumps):
    p = BasePoster.__new__(BasePoster)
    p.TAG = "TIKTOK"
    p.said = []
    p.log = p.said.append
    box = list(dumps)
    p._ui_dump = lambda s: box.pop(0) if len(box) > 1 else box[0]
    return p


def test_confirm_posted_true_when_button_disappears():
    p = _bp([_Root(["Post", "Drafts"]), _Root(["For You", "Following"])])
    assert p._confirm_posted("SER", ["Post", "โพสต์"], secs=2) is True


def test_confirm_posted_unverified_when_button_still_there():
    """กดแล้วแอปค้างหน้าเดิม — เดิมรายงาน 'สำเร็จ' แล้วคลิปเข้า DONE"""
    p = _bp([_Root(["Post", "Drafts"])])
    assert p._confirm_posted("SER", ["Post", "โพสต์"], secs=1) == "unverified"
    assert any("ยังอยู่บนจอ" in m for m in p.said)


def test_confirm_posted_unverified_when_screen_unreadable():
    p = _bp([None])
    assert p._confirm_posted("SER", ["Post", "โพสต์"], secs=1) == "unverified"
    assert any("อ่านหน้าจอไม่ได้" in m for m in p.said)


# ── process(): ตัวยืนยันลดชั้นได้ แต่ยกชั้นไม่ได้ ────────────────────────────

def _process_with(monkeypatch, flow_result, verify_result):
    p = BasePoster.__new__(BasePoster)
    p.PACKAGE = "com.x"
    p.TAG = "T"
    p.USE_SCRCPY = False
    p.said = []
    p.log = p.said.append
    p.settings = {}
    p._learned = {}
    p._scrcpy = None
    p._clip_last = None
    p.adb = type("A", (), {
        "_adb": lambda *a, **k: (True, "1080x2340"),
        "get_default_ime": lambda *a: "",
        "has_adb_keyboard": lambda *a: False,
        "set_ime": lambda *a: None,
        "ADB_IME": "x/.y",
    })()
    p._get_resolution = lambda s: (1080, 2340)
    p.push_video = lambda s, v: True
    p._build_caption = lambda prod: "cap"
    p._run_flow = lambda *a, **k: flow_result
    p._maybe_verify = lambda s: verify_result
    p._clear_device_clipboard = lambda: None
    monkeypatch.setattr("services.adb.base_poster.time.sleep", lambda *_: None)
    return p.process("SER", None, {}), p


def test_verifier_cannot_upgrade_an_unverified_flow(monkeypatch):
    """verify_post ตอบ 'สำเร็จ' ทุกครั้งที่ไม่เจอ keyword — ห้ามให้มันกลบคำตอบของ flow"""
    res, p = _process_with(monkeypatch, "unverified", True)
    assert res == "unverified"
    assert any("ยืนยันผลไม่ได้" in m for m in p.said)


def test_verifier_can_still_downgrade_to_failed(monkeypatch):
    res, _ = _process_with(monkeypatch, "unverified", False)
    assert res is False


def test_normal_success_path_untouched(monkeypatch):
    res, _ = _process_with(monkeypatch, True, True)
    assert res is True
