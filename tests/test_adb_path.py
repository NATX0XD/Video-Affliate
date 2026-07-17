"""adb_path.adb_bin — ลำดับการค้นหา: VGAP_ADB → bundled → which → fallback 'adb'."""
import os

import pytest

from services.adb import adb_path


@pytest.fixture(autouse=True)
def _reset_cache(monkeypatch):
    """ล้าง cache ของ resolver ก่อนทุกเทสต์ + กัน VGAP_ADB รั่วจากภายนอก."""
    monkeypatch.setattr(adb_path, "_cached", None, raising=False)
    monkeypatch.setattr(adb_path, "_logged", False, raising=False)
    monkeypatch.delenv("VGAP_ADB", raising=False)
    yield


def test_env_points_to_file(monkeypatch, tmp_path):
    fake = tmp_path / "adb"
    fake.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setenv("VGAP_ADB", str(fake))
    assert adb_path.adb_bin() == str(fake)


def test_env_points_to_folder(monkeypatch, tmp_path):
    """VGAP_ADB ชี้โฟลเดอร์ → หา <folder>/adb ให้เอง."""
    folder = tmp_path / "platform-tools-dir"
    folder.mkdir()
    binary = folder / adb_path._EXE
    binary.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setenv("VGAP_ADB", str(folder))
    assert adb_path.adb_bin() == str(binary)


def test_falls_back_to_which(monkeypatch):
    """ไม่มี env/bundled → ใช้ shutil.which."""
    monkeypatch.setattr(adb_path.shutil, "which", lambda name: "/opt/tools/adb")
    assert adb_path.adb_bin() == "/opt/tools/adb"


def test_not_found_returns_literal_adb_and_logs_once(monkeypatch):
    """หาไม่เจอเลย → คืน 'adb' (ให้ subprocess โยน error) + log เตือนครั้งเดียว."""
    monkeypatch.setattr(adb_path.shutil, "which", lambda name: None)
    logs = []
    assert adb_path.adb_bin(log=logs.append) == "adb"
    # เรียกซ้ำ: ยังไม่พบ (ไม่ cache 'adb') แต่ต้องไม่ log ซ้ำ
    assert adb_path.adb_bin(log=logs.append) == "adb"
    assert len(logs) == 1
    assert "adb" in logs[0]


def test_env_missing_file_falls_through(monkeypatch, tmp_path):
    """VGAP_ADB ชี้ path ที่ไม่มีไฟล์จริง → ข้ามไปใช้ which."""
    monkeypatch.setenv("VGAP_ADB", str(tmp_path / "nope" / "adb"))
    monkeypatch.setattr(adb_path.shutil, "which", lambda name: "/usr/local/bin/adb")
    assert adb_path.adb_bin() == "/usr/local/bin/adb"
