"""หาไบนารีเองโดยไม่พึ่ง PATH — ffmpeg และ scrcpy-server.

ทำไมสำคัญ: ตัวติดตั้งเติม PATH ให้ก็จริง แต่โปรเซสที่เปิดค้างอยู่ก่อน PATH เปลี่ยน
ไม่เห็นค่าใหม่. บน Windows ทำให้เกิด 2 อาการที่เจอจริง
  · ffmpeg     → "[WinError 2] The system cannot find the file specified" ตอนทำปกคลิป
  · scrcpy     → "scrcpy ใช้ไม่ได้" → แคปชั่นไทยถูกตัดทิ้ง → ไม่กดโพสต์
"""
import importlib

import pytest


def _fresh(mod_name):
    """โหลดโมดูลใหม่ทุกครั้ง — ตัว resolver cache ผลไว้"""
    m = importlib.import_module(mod_name)
    return importlib.reload(m)


# ── ffmpeg ───────────────────────────────────────────────────────────────────

def test_ffmpeg_prefers_env_override(tmp_path, monkeypatch):
    d = tmp_path / "tools"
    d.mkdir()
    exe = d / "ffmpeg"
    exe.write_text("#!/bin/sh\n")
    monkeypatch.setenv("VGAP_FFMPEG", str(d))
    fp = _fresh("services.ffmpeg_path")
    assert fp.ffmpeg() == str(exe)


def test_ffmpeg_finds_installer_tools_dir(tmp_path, monkeypatch):
    """~/.vgap/bin (แมค) — เจอโดยไม่ต้องมีอะไรใน PATH"""
    home = tmp_path / "home"
    (home / ".vgap" / "bin").mkdir(parents=True)
    exe = home / ".vgap" / "bin" / "ffmpeg"
    exe.write_text("#!/bin/sh\n")
    monkeypatch.delenv("VGAP_FFMPEG", raising=False)
    fp = _fresh("services.ffmpeg_path")
    monkeypatch.setattr(fp.Path, "home", staticmethod(lambda: home))
    monkeypatch.setattr(fp.shutil, "which", lambda n: None)   # PATH ว่างเปล่า
    assert fp.ffmpeg() == str(exe)


def test_ffmpeg_falls_back_to_bare_name_and_warns(monkeypatch, tmp_path):
    """หาไม่เจอต้องไม่ crash — คืนชื่อสั้นให้ subprocess โยน error ให้ผู้เรียกจับ + เตือน 1 ครั้ง"""
    fp = _fresh("services.ffmpeg_path")
    monkeypatch.setattr(fp.Path, "home", staticmethod(lambda: tmp_path / "empty"))
    monkeypatch.setattr(fp.shutil, "which", lambda n: None)
    monkeypatch.setattr(fp, "_iter_candidates", lambda name: iter(()))
    said = []
    assert fp.ffmpeg(said.append) == "ffmpeg"
    assert said and "ffmpeg" in said[0]
    fp.ffmpeg(said.append)                 # เรียกซ้ำต้องไม่เตือนซ้ำ (กัน log ท่วม)
    assert len(said) == 1


# ── scrcpy-server ────────────────────────────────────────────────────────────

def test_scrcpy_jar_prefers_installer_copy_over_path(tmp_path, monkeypatch):
    """ชุดของตัวติดตั้งตรึงเวอร์ชันไว้ให้ตรงกับโค้ดแล้ว จึงต้องมาก่อน scrcpy บน PATH"""
    sc = importlib.import_module("services.adb.scrcpy_control")
    home = tmp_path / "home"
    (home / ".vgap" / "bin").mkdir(parents=True)
    jar = home / ".vgap" / "bin" / "scrcpy-server"
    jar.write_bytes(b"jar")

    other = tmp_path / "onpath"
    other.mkdir()
    (other / "scrcpy-server").write_bytes(b"other")

    monkeypatch.delenv("SCRCPY_SERVER_PATH", raising=False)
    monkeypatch.delenv("VGAP_SCRCPY_SERVER", raising=False)
    monkeypatch.setattr(sc.Path, "home", staticmethod(lambda: home))
    monkeypatch.setattr(sc.shutil, "which", lambda n: str(other / "scrcpy"))
    assert sc._find_server_jar() == str(jar)


def test_scrcpy_jar_env_override_wins(tmp_path, monkeypatch):
    sc = importlib.import_module("services.adb.scrcpy_control")
    jar = tmp_path / "mine" / "scrcpy-server"
    jar.parent.mkdir()
    jar.write_bytes(b"jar")
    monkeypatch.setenv("SCRCPY_SERVER_PATH", str(jar))
    assert sc._find_server_jar() == str(jar)


def test_scrcpy_jar_none_when_nothing_installed(tmp_path, monkeypatch):
    sc = importlib.import_module("services.adb.scrcpy_control")
    monkeypatch.delenv("SCRCPY_SERVER_PATH", raising=False)
    monkeypatch.delenv("VGAP_SCRCPY_SERVER", raising=False)
    monkeypatch.setattr(sc.Path, "home", staticmethod(lambda: tmp_path / "empty"))
    monkeypatch.setattr(sc.shutil, "which", lambda n: None)
    monkeypatch.setattr(sc, "_SERVER_CANDIDATES", [])
    monkeypatch.setattr(sc, "_installer_dirs", lambda: iter(()))
    assert sc._find_server_jar() is None
