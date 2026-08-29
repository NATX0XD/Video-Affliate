"""/api/videos/reveal — เปิดโฟลเดอร์ที่เก็บคลิปในเครื่อง

เบราว์เซอร์แตะระบบไฟล์ไม่ได้ (sandbox) แต่โปรแกรมหลักรันบนเครื่องผู้ใช้อยู่แล้ว
จึงเปิด Finder/Explorer ให้ได้ · ค่าที่ส่งมาจากเบราว์เซอร์ ต้องกัน path traversal
"""
import subprocess

import pytest


@pytest.fixture
def cfgdirs(monkeypatch, tmp_path):
    import config as cfg
    for name, sub in (("PENDING_DIR", "pending"), ("DONE_DIR", "done"), ("ERROR_DIR", "error")):
        d = tmp_path / sub
        d.mkdir()
        monkeypatch.setattr(cfg, name, d)
    return tmp_path


@pytest.fixture
def spy(monkeypatch):
    calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: calls.append(a[0]))
    return calls


def test_reveals_an_existing_clip(web, cfgdirs, spy):
    client, ws, db = web
    (cfgdirs / "pending" / "clip.mp4").write_bytes(b"V")
    r = client.post("/api/videos/reveal", json={"folder": "pending", "name": "clip.mp4"}).json()
    assert r["ok"] is True
    assert "clip.mp4" in str(spy[0])


def test_finds_the_clip_after_it_moved_folders(web, cfgdirs, spy):
    """โพสต์เสร็จไฟล์ย้าย pending → done · หน้าเว็บอาจยังถือ folder เดิมอยู่"""
    client, ws, db = web
    (cfgdirs / "done" / "clip.mp4").write_bytes(b"V")
    r = client.post("/api/videos/reveal", json={"folder": "pending", "name": "clip.mp4"}).json()
    assert r["ok"] is True
    assert "done" in str(spy[0])


def test_missing_file_says_so_and_opens_nothing(web, cfgdirs, spy):
    client, ws, db = web
    r = client.post("/api/videos/reveal", json={"folder": "pending", "name": "gone.mp4"}).json()
    assert r["ok"] is False
    assert "ไม่พบไฟล์" in r["error"]
    assert spy == []


@pytest.mark.parametrize("name", ["../../etc/passwd", "a/b.mp4", "..\\win.ini", ""])
def test_rejects_path_traversal(web, cfgdirs, spy, name):
    client, ws, db = web
    r = client.post("/api/videos/reveal", json={"folder": "pending", "name": name}).json()
    assert r["ok"] is False
    assert spy == []


def test_rejects_unknown_folder(web, cfgdirs, spy):
    client, ws, db = web
    r = client.post("/api/videos/reveal", json={"folder": "somewhere", "name": "clip.mp4"}).json()
    assert r["ok"] is False
    assert spy == []
