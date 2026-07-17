"""
Minimal scrcpy control client — touch injection only (no video).

Why this exists:
  Shopee Video's PublishVideoActivity caption EditText does NOT accept focus
  from `adb shell input tap` / `sendevent` (needs root) / `input motionevent`.
  scrcpy's MotionEvent injection (via InputManager with proper finger/pressure
  flags) DOES focus it. This module reuses scrcpy's server purely for touch.

Requires:
  - scrcpy installed (server jar pushed to /data/local/tmp/scrcpy-server.jar)
  - matching server version string (SCRCPY_VERSION)
"""
import os
import socket
import struct
import subprocess
import time
import random
import shutil
from pathlib import Path
from typing import Optional

from services.adb.adb_path import adb_bin

SCRCPY_VERSION = "4.0"
SERVER_REMOTE  = "/data/local/tmp/scrcpy-server.jar"

# Homebrew / Linux locations for the scrcpy server jar (mac/linux)
_SERVER_CANDIDATES = [
    "/opt/homebrew/share/scrcpy/scrcpy-server",
    "/opt/homebrew/Cellar/scrcpy/{v}/share/scrcpy/scrcpy-server".format(v=SCRCPY_VERSION),
    "/usr/local/share/scrcpy/scrcpy-server",
    "/usr/share/scrcpy/scrcpy-server",
]
# ไฟล์ server ที่มากับ scrcpy — ชื่อ "scrcpy-server" (ส่วนใหญ่) หรือ "scrcpy-server.jar"
_SERVER_NAMES = ["scrcpy-server", "scrcpy-server.jar"]


def _candidates_near(dir_path) -> list:
    d = Path(dir_path)
    return [d / n for n in _SERVER_NAMES] + [d / "share" / "scrcpy" / n for n in _SERVER_NAMES]


def _find_server_jar() -> Optional[str]:
    # 1) env override — SCRCPY_SERVER_PATH เป็นตัวแปรที่ scrcpy เองก็อ่าน (ชี้ไฟล์ตรงสุด)
    env = os.environ.get("SCRCPY_SERVER_PATH") or os.environ.get("VGAP_SCRCPY_SERVER")
    if env and Path(env).exists():
        return env
    # 2) ข้างๆ ไฟล์ scrcpy บน PATH — ครอบ Windows (scoop/choco), Linux, และ portable zip
    exe = shutil.which("scrcpy") or shutil.which("scrcpy.exe")
    if exe:
        for c in _candidates_near(Path(exe).parent):
            if c.exists():
                return str(c)
    # 3) ตำแหน่งมาตรฐาน mac/linux
    for p in _SERVER_CANDIDATES:
        if Path(p).exists():
            return p
    # 4) ตำแหน่งติดตั้งทั่วไปบน Windows (scoop / chocolatey / Program Files)
    if os.name == "nt":
        win_dirs = []
        up = os.environ.get("USERPROFILE", "")
        if up:
            win_dirs.append(Path(up) / "scoop" / "apps" / "scrcpy" / "current")
        choco = os.environ.get("ChocolateyInstall", r"C:\ProgramData\chocolatey")
        win_dirs.append(Path(choco) / "lib" / "scrcpy" / "tools")
        for pf in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if pf:
                win_dirs.append(Path(pf) / "scrcpy")
        for d in win_dirs:
            for c in _candidates_near(d):
                if c.exists():
                    return str(c)
    # 5) Try `brew --prefix scrcpy` (mac)
    brew = shutil.which("brew")
    if brew:
        try:
            r = subprocess.run([brew, "--prefix", "scrcpy"],
                               capture_output=True, text=True, timeout=5)
            cand = Path(r.stdout.strip()) / "share/scrcpy/scrcpy-server"
            if cand.exists():
                return str(cand)
        except Exception:
            pass
    return None


class ScrcpyControl:
    """Touch-only scrcpy control session for one device."""

    def __init__(self, serial: str, width: int = 1080, height: int = 2340, log=print):
        self.serial = serial
        self.W = width
        self.H = height
        self.log = log
        self._sock: Optional[socket.socket] = None
        self._proc: Optional[subprocess.Popen] = None
        self._port = random.randint(27200, 27999)
        self._scid = f"{random.randint(0, 0x7FFFFFFF):08x}"

    # ── lifecycle ─────────────────────────────────────────────

    def _adb(self, *args):
        return subprocess.run([adb_bin(self.log), "-s", self.serial, *args],
                              capture_output=True, text=True)

    def start(self) -> bool:
        jar = _find_server_jar()
        if not jar:
            hint = ("ติดตั้ง scrcpy แล้วใส่ใน PATH "
                    "(Win: scoop install scrcpy / choco install scrcpy · "
                    "Mac: brew install scrcpy) "
                    "หรือชี้ไฟล์เองด้วย env SCRCPY_SERVER_PATH")
            self.log(f"[scrcpy] ไม่พบ scrcpy-server jar — {hint}")
            return False

        # Push server (idempotent — fast if unchanged)
        self._adb("push", jar, SERVER_REMOTE)
        self._adb("forward", f"tcp:{self._port}", f"localabstract:scrcpy_{self._scid}")

        self._proc = subprocess.Popen(
            [adb_bin(self.log), "-s", self.serial, "shell",
             f"CLASSPATH={SERVER_REMOTE}",
             "app_process", "/", "com.genymobile.scrcpy.Server", SCRCPY_VERSION,
             f"scid={self._scid}", "log_level=error", "tunnel_forward=true",
             "video=false", "audio=false", "control=true",
             "cleanup=false", "send_dummy_byte=true", "raw_stream=false"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        time.sleep(1.5)

        for _ in range(12):
            try:
                self._sock = socket.create_connection(("127.0.0.1", self._port), timeout=2)
                break
            except Exception:
                time.sleep(0.3)

        if not self._sock:
            self.log("[scrcpy] control socket เชื่อมต่อไม่ได้")
            self.stop()
            return False

        # Consume dummy byte
        self._sock.settimeout(2)
        try:
            self._sock.recv(1)
        except Exception:
            pass
        self.log("[scrcpy] control session พร้อม")
        return True

    def stop(self):
        if self._sock:
            try: self._sock.close()
            except Exception: pass
            self._sock = None
        if self._proc:
            try: self._proc.terminate()
            except Exception: pass
            self._proc = None
        self._adb("forward", "--remove", f"tcp:{self._port}")

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.stop()

    # ── input ─────────────────────────────────────────────────

    def _touch(self, action: int, x: int, y: int):
        # type=2 INJECT_TOUCH_EVENT
        # >b b Q i i H H H i i  → type, action, pointerId, x, y, w, h, pressure, actionBtn, buttons
        pressure = 0xFFFF if action == 0 else 0           # 1.0 on DOWN, 0 on UP
        btn = 1 if action != 1 else 0                      # PRIMARY while pressed
        msg = struct.pack(">bbQiiHHHii", 2, action,
                          0xFFFFFFFFFFFFFFFF, x, y, self.W, self.H, pressure, btn, btn)
        self._sock.sendall(msg)

    def tap(self, x: int, y: int, hold: float = 0.08):
        if not self._sock:
            return
        self._touch(0, x, y)
        time.sleep(hold)
        self._touch(1, x, y)

    def swipe(self, x1, y1, x2, y2, steps: int = 12, duration: float = 0.3):
        if not self._sock:
            return
        self._touch(0, x1, y1)
        for i in range(1, steps + 1):
            t = i / steps
            self._touch(2, int(x1 + (x2 - x1) * t), int(y1 + (y2 - y1) * t))
            time.sleep(duration / steps)
        self._touch(1, x2, y2)
