"""หาแผง "เพิ่มสินค้า" จากภาพหน้าจอ — เส้นทางที่ทำให้ได้ค่านายหน้า

หน้า publish ของ Shopee เล่นพรีวิววิดีโอตลอด window ไม่เคย idle → uiautomator dump
ล้มแทบทุกครั้ง. ถ้าเชื่อ dump อย่างเดียวจะสรุปว่า "ไม่มีแผงเพิ่มสินค้า" ทุกครั้ง
แล้วข้ามการใส่ลิงก์ → คลิปขึ้นโดยไม่มีการ์ดสินค้า คนดูกดซื้อไม่ได้ ไม่ได้ค่านายหน้า
ภาพหน้าจอไม่สนใจ idle state จึงใช้ตัดสินแทนได้

ภาพในโฟลเดอร์ fixtures มาจากเครื่องจริง (SM-A576B 1080x2340)
"""
import subprocess
from pathlib import Path

import pytest

from services.adb.autoposter import AutoPoster

FIX = Path(__file__).parent / "fixtures"
PUBLISH = "com.shopee.th/com.shopee.sz.luckyvideo.publishvideo.PublishVideoActivity"
FEED    = "com.shopee.th/com.shopee.app.ui.home.HomeActivity_"


def _check(monkeypatch, png: str, activity: str) -> bool:
    p = AutoPoster.__new__(AutoPoster)
    p.TAG = "POST"
    p.log = lambda *a, **k: None
    p._current_activity = lambda s: activity
    data = (FIX / png).read_bytes()

    class _R:
        stdout = data
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: _R())
    return p._screen_has_add_product("SER")


def test_finds_the_orange_add_product_pill_on_the_publish_page(monkeypatch):
    assert _check(monkeypatch, "publish_page_1080x2340.png", PUBLISH) is True


def test_video_feed_buy_button_is_not_mistaken_for_it(monkeypatch):
    """ฟีดมีปุ่ม "ซื้อเลย" สีส้มเหมือนกัน — ต้องไม่นับ"""
    assert _check(monkeypatch, "video_feed_1080x2340.png", FEED) is False


def test_only_checks_while_on_the_publish_page(monkeypatch):
    """กันภาพหลุดเฟรม/หน้าอื่นที่บังเอิญมีสีส้มกว้าง ๆ"""
    assert _check(monkeypatch, "publish_page_1080x2340.png", FEED) is False


def test_no_screenshot_means_not_found(monkeypatch):
    p = AutoPoster.__new__(AutoPoster)
    p.TAG = "POST"; p.log = lambda *a, **k: None
    p._current_activity = lambda s: PUBLISH

    class _R:
        stdout = b""
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: _R())
    assert p._screen_has_add_product("SER") is False


def test_panel_wait_falls_back_to_the_screenshot(monkeypatch):
    """dump อ่านไม่ได้ แต่เห็นปุ่มในภาพ → ต้องถือว่ามีแผง (ไม่งั้นข้ามการใส่ลิงก์)"""
    from services.adb import ui_finder as UF
    p = AutoPoster.__new__(AutoPoster)
    p.TAG = "POST"; p.said = []; p.log = p.said.append
    monkeypatch.setattr(UF, "wait_for", lambda *a, **k: ([], None))
    monkeypatch.setattr(p, "_screen_has_add_product", lambda s: True, raising=False)
    assert p._wait_add_product_panel("SER", timeout=0) is True
    assert any("เห็นจากภาพหน้าจอ" in m for m in p.said)


def test_panel_wait_reports_absent_when_neither_sees_it(monkeypatch):
    from services.adb import ui_finder as UF
    p = AutoPoster.__new__(AutoPoster)
    p.TAG = "POST"; p.said = []; p.log = p.said.append
    monkeypatch.setattr(UF, "wait_for", lambda *a, **k: ([], None))
    monkeypatch.setattr(p, "_screen_has_add_product", lambda s: False, raising=False)
    assert p._wait_add_product_panel("SER", timeout=0) is False
