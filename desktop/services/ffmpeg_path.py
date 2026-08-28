"""หา ffmpeg/ffprobe ให้เจอ โดยไม่พึ่ง PATH อย่างเดียว.

เดิมเรียก "ffmpeg" ตรง ๆ. บน Windows ตัวติดตั้งวาง ffmpeg ไว้ใน
%LOCALAPPDATA%\\vgap-tools\\ff\\...\\bin แล้วเติมเข้า PATH ของผู้ใช้ — แต่โปรเซส
ที่เปิดอยู่ "ก่อน" PATH ถูกแก้จะไม่เห็นค่าใหม่ ผลคือ

    ดึงเฟรมแรกเป็นปกไม่สำเร็จ: [WinError 2] The system cannot find the file specified

ลำดับการหา (เหมือน adb_path.py):
    1) env VGAP_FFMPEG (ชี้ไฟล์หรือโฟลเดอร์ก็ได้)
    2) โฟลเดอร์เครื่องมือของตัวติดตั้ง (~/.vgap/bin บนแมค · vgap-tools บนวินโดวส์)
    3) bundled ข้างโปรแกรม (bin / electron/bin)
    4) PATH
หาไม่เจอ → log ครั้งเดียวแล้วคืนชื่อสั้น ให้ subprocess โยน error ให้ผู้เรียกจับ
"""
import os
import shutil
import sys
from pathlib import Path

_WIN = os.name == "nt"
_cached: dict[str, str] = {}
_logged: set[str] = set()


def _exe(name: str) -> str:
    return f"{name}.exe" if _WIN else name


def _tool_dirs():
    """โฟลเดอร์ที่ตัวติดตั้งวางไบนารีไว้ (แยกตามระบบ)"""
    home = Path.home()
    yield home / ".vgap" / "bin"                       # แมค: ตัวติดตั้ง DMG
    la = os.environ.get("LOCALAPPDATA") or str(home / "AppData" / "Local")
    tools = Path(la) / "vgap-tools"
    yield tools
    # วินโดวส์: ffmpeg ถูกแตกไว้ใต้ ff/<ชื่อโฟลเดอร์ที่เปลี่ยนไปทุก build>/bin
    ff = tools / "ff"
    try:
        if ff.is_dir():
            for d in ff.iterdir():
                yield d
                yield d / "bin"
    except Exception:
        pass


def _iter_candidates(name: str):
    exe = _exe(name)
    env = (os.environ.get("VGAP_FFMPEG") or "").strip()
    if env:
        p = Path(env)
        yield p if p.name.lower().startswith(name) else p / exe
        yield p.parent / exe          # ชี้มาที่ ffmpeg แต่เราต้องการ ffprobe ที่อยู่ข้าง ๆ
        yield p / "bin" / exe

    for d in _tool_dirs():
        yield d / exe

    roots = []
    if getattr(sys, "frozen", False):
        mei = getattr(sys, "_MEIPASS", "")
        if mei:
            roots.append(Path(mei))
    parents = Path(__file__).resolve().parents        # .../desktop/services/ffmpeg_path.py
    roots += [parents[2] if len(parents) > 2 else parents[-1],
              parents[1] if len(parents) > 1 else parents[-1]]
    for base in roots:
        yield base / exe
        yield base / "bin" / exe
        yield base / "electron" / "bin" / exe


def tool(name: str, log=None) -> str:
    """คืน path ของ ffmpeg/ffprobe ที่ใช้ได้ (cache ต่อชื่อ)"""
    if name in _cached:
        return _cached[name]
    for c in _iter_candidates(name):
        try:
            if c.is_file():
                _cached[name] = str(c)
                return _cached[name]
        except Exception:
            pass
    found = shutil.which(name)
    if found:
        _cached[name] = found
        return found
    if name not in _logged:
        _logged.add(name)
        (log or print)(
            f"[FFMPEG] ⚠ หา {name} ไม่พบ — ต่อคลิป/ทำปก/แทรก footage จะไม่ทำงาน "
            f"(ลงใหม่ด้วยตัวติดตั้ง หรือตั้ง env VGAP_FFMPEG ให้ชี้โฟลเดอร์ที่มี {_exe(name)})"
        )
    return name      # ให้ subprocess โยน FileNotFoundError ให้ผู้เรียกจับเอง ไม่เงียบ


def ffmpeg(log=None) -> str:
    return tool("ffmpeg", log)


def ffprobe(log=None) -> str:
    return tool("ffprobe", log)
