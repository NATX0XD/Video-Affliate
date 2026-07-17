"""post_verifier.verify_post — สถานะ success/failed/unverified/unknown ตาม keyword/หลักฐาน."""
import os
import tempfile

import pytest

from services import post_verifier


class FakeADB:
    """จำลอง ADBManager: _adb คืน (ok, msg) หรือโยน exception ตามที่ตั้งไว้."""
    def __init__(self, dump_ok=True, dump_msg="ok", raise_exc=False):
        self.dump_ok = dump_ok
        self.dump_msg = dump_msg
        self.raise_exc = raise_exc

    def _adb(self, *args, serial=None, timeout=None):
        if self.raise_exc:
            raise RuntimeError("boom")
        return self.dump_ok, self.dump_msg


def _xml(text):
    return f'<?xml version="1.0"?><hierarchy><node text="{text}" content-desc=""/></hierarchy>'


def _fake_run(returncode, xml_text=None):
    """แทน subprocess.run ของขั้น pull: ถ้าให้ xml_text จะเขียนไฟล์ปลายทาง (จำลอง pull สำเร็จ)."""
    def _run(cmd, capture_output=None, timeout=None):
        if xml_text is not None:
            local = cmd[-1]  # [adb, -s, serial, pull, remote, local]
            with open(local, "w", encoding="utf-8") as f:
                f.write(xml_text)

        class _R:
            pass
        r = _R()
        r.returncode = returncode
        return r
    return _run


SERIAL = "TESTSERIAL1"


def _cleanup_local():
    p = os.path.join(tempfile.gettempdir(), f"vgap_ui_verify_{SERIAL}.xml")
    if os.path.exists(p):
        os.remove(p)


@pytest.fixture(autouse=True)
def _clean():
    _cleanup_local()
    yield
    _cleanup_local()


def test_dump_failure_is_unverified(monkeypatch):
    adb = FakeADB(dump_ok=False, dump_msg="device offline")
    monkeypatch.setattr(post_verifier.subprocess, "run", _fake_run(0, _xml("x")))
    res = verify(adb)
    assert res["status"] == "unverified"
    assert res["verified"] is False


def test_pull_failure_is_unverified(monkeypatch):
    adb = FakeADB(dump_ok=True)
    monkeypatch.setattr(post_verifier.subprocess, "run", _fake_run(1))  # pull returncode!=0
    res = verify(adb)
    assert res["status"] == "unverified"
    assert res["verified"] is False


def test_exception_is_unverified(monkeypatch):
    adb = FakeADB(raise_exc=True)
    monkeypatch.setattr(post_verifier.subprocess, "run", _fake_run(0, _xml("x")))
    res = verify(adb)
    assert res["status"] == "unverified"
    assert res["verified"] is False


def test_failure_keyword_detected(monkeypatch):
    adb = FakeADB(dump_ok=True)
    monkeypatch.setattr(post_verifier.subprocess, "run",
                        _fake_run(0, _xml("เกิดข้อผิดพลาด ลองอีกครั้ง")))
    res = verify(adb)
    assert res["status"] == "failed"
    assert res["verified"] is False


def test_success_keyword_detected(monkeypatch):
    adb = FakeADB(dump_ok=True)
    monkeypatch.setattr(post_verifier.subprocess, "run",
                        _fake_run(0, _xml("โพสต์แล้ว")))
    res = verify(adb)
    assert res["status"] == "success"
    assert res["verified"] is True


def test_no_keyword_is_unknown_but_verified(monkeypatch):
    """ได้หลักฐานแต่ไม่มี indicator → conservative: unknown + verified=True (กันโพสต์ซ้ำ)."""
    adb = FakeADB(dump_ok=True)
    monkeypatch.setattr(post_verifier.subprocess, "run",
                        _fake_run(0, _xml("สวัสดี ทดสอบ หน้าจอ")))
    res = verify(adb)
    assert res["status"] == "unknown"
    assert res["verified"] is True


def test_failure_wins_over_success_keyword(monkeypatch):
    """ถ้ามีทั้ง fail และ success indicator → fail มาก่อน (ให้ retry ปลอดภัยกว่า)."""
    adb = FakeADB(dump_ok=True)
    monkeypatch.setattr(post_verifier.subprocess, "run",
                        _fake_run(0, _xml("โพสต์แล้ว แต่ อัปโหลดล้มเหลว")))
    res = verify(adb)
    assert res["status"] == "failed"


def verify(adb):
    return post_verifier.verify_post(adb, SERIAL, log=lambda *a, **k: None)
