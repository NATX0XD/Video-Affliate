"""Central ADB binary resolver — หา adb ให้เจอทั้งบนเครื่อง dev และเครื่องลูกค้า/Mac.

เดิมโค้ดเรียก "adb" ตรง ๆ → พึ่ง PATH ล้วน → ADB not found บนเครื่องที่ไม่ได้ลง
platform-tools. ตัวนี้หา adb ตามลำดับ:
    1) env VGAP_ADB (ชี้ไฟล์ adb หรือโฟลเดอร์ก็ได้)
    2) adb ที่ bundled มากับโปรแกรม (bin ข้างโปรเจกต์ / electron/bin / platform-tools)
    3) PATH (shutil.which)
ผลลัพธ์ถูก cache. หาไม่เจอ → log error ชัดเจน (ครั้งเดียว) แล้ว fallback เป็น 'adb'
(subprocess จะโยน FileNotFoundError ให้ผู้เรียกจับได้ — ไม่ crash เงียบ).
"""
import os
import shutil
import sys
from pathlib import Path

_EXE = "adb.exe" if os.name == "nt" else "adb"
_cached = None      # str เมื่อ resolve แล้ว
_logged = False     # log "หาไม่เจอ" ไปแล้วหรือยัง (กัน spam)


def _iter_candidates():
    # 1) env override — ชี้ไฟล์ adb ตรง ๆ หรือชี้โฟลเดอร์ก็ได้
    env = (os.environ.get("VGAP_ADB") or "").strip()
    if env:
        p = Path(env)
        yield p
        yield p / _EXE
        yield p / "platform-tools" / _EXE

    # 2) bundled ข้างโปรแกรม
    roots = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            roots.append(Path(meipass))
    parents = Path(__file__).resolve().parents   # .../desktop/services/adb/adb_path.py
    repo    = parents[3] if len(parents) > 3 else parents[-1]
    desktop = parents[2] if len(parents) > 2 else parents[-1]
    roots += [repo, desktop]
    for base in roots:
        yield base / _EXE
        yield base / "bin" / _EXE
        yield base / "electron" / "bin" / _EXE
        yield base / "platform-tools" / _EXE


def adb_bin(log=None) -> str:
    """คืน path ของ adb ที่ใช้ได้ (cache). หาไม่เจอ → log ครั้งเดียว + คืน 'adb'."""
    global _cached, _logged
    if _cached:
        return _cached
    for c in _iter_candidates():
        try:
            if c.is_file():
                _cached = str(c)
                return _cached
        except Exception:
            pass
    found = shutil.which("adb")
    if found:
        _cached = found
        return _cached
    if not _logged:
        _logged = True
        (log or print)(
            "[ADB] ⚠ หา adb ไม่พบ — ตั้ง env VGAP_ADB ให้ชี้ไฟล์ adb, วาง adb ไว้ใน "
            "โฟลเดอร์ bin ข้างโปรแกรม, หรือติดตั้ง platform-tools "
            "(Mac: brew install android-platform-tools)"
        )
    return "adb"   # fallback — subprocess จะ error ให้ผู้เรียกจับได้ (ไม่ crash เงียบ)
