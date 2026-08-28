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
import threading
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


def _free_port() -> int:
    """ขอพอร์ตว่างจริงจาก OS แทนการสุ่ม — กัน `adb forward` ชนกันระหว่างเครื่อง"""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


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


CLIPBOARD_TEXT_MAX = 300 * 1024      # scrcpy: CLIPBOARD_TEXT_MAX_LENGTH — เกินแล้ว server ตัด connection


class DeviceMsgReader:
    """อ่าน DeviceMessage ที่ server ส่งกลับมาทาง control socket (socket เป็นสองทาง)

    ทำไมต้องมี 2 เหตุผล:
      1. ถ้าไม่มีใครอ่าน buffer ฝั่งรับจะเต็ม → server บล็อกตอนเขียน → thread ควบคุมค้าง
         = touch injection ตายทั้ง session (server ส่ง ACK_CLIPBOARD ทุกครั้งที่ sequence != 0
         และส่งสำเนาคลิปบอร์ดกลับมาทุกครั้งที่มันเปลี่ยน เพราะ clipboard_autosync default = true)
      2. ACK_CLIPBOARD คือหลักฐานเดียวที่ยืนยันได้ว่า server รับคำสั่ง SET_CLIPBOARD จริง
         → ทำให้ set_clipboard คืนค่าที่สื่อความจริงได้

    ถ้าเจอ message type ที่ไม่รู้จัก (server คนละเวอร์ชัน) จะเลิกพาร์สแล้วอ่านทิ้งอย่างเดียว
    — ยังกัน buffer เต็มได้ แต่ ack ใช้ไม่ได้ (synced = False)
    """
    TYPE_CLIPBOARD      = 0
    TYPE_ACK_CLIPBOARD  = 1
    TYPE_UHID_OUTPUT    = 2
    TYPE_OPEN_KEYBOARD  = 3

    def __init__(self, sock: socket.socket, log=print, tag: str = ""):
        self._sock  = sock
        self.log    = log
        self.tag    = tag
        self.synced = True
        self.alive  = True
        self._acks: set = set()
        self._cv   = threading.Condition()
        self._buf  = bytearray()
        self._clip_text: Optional[str] = None      # คลิปบอร์ดล่าสุดที่ server ส่งกลับมา
        self._clip_stamp = 0.0
        threading.Thread(target=self._loop, daemon=True, name=f"scrcpy-dev{tag}").start()

    def stop(self):
        self.alive = False
        with self._cv:
            self._cv.notify_all()

    def wait_ack(self, seq: int, timeout: float) -> bool:
        deadline = time.time() + timeout
        with self._cv:
            while seq not in self._acks:
                left = deadline - time.time()
                if left <= 0 or not self.alive:
                    return False
                self._cv.wait(left)
            self._acks.discard(seq)
            return True

    def wait_clipboard(self, after: float, timeout: float) -> Optional[str]:
        """รอ DEVICE_MSG CLIPBOARD ที่มาหลังเวลา `after` — ใช้คู่กับ GET_CLIPBOARD"""
        deadline = time.time() + timeout
        with self._cv:
            while not (self._clip_stamp > after):
                left = deadline - time.time()
                if left <= 0 or not self.alive:
                    return None
                self._cv.wait(left)
            return self._clip_text

    def _loop(self):
        while self.alive:
            try:
                chunk = self._sock.recv(65536)
            except Exception:
                break
            if not chunk:
                break
            if not self.synced:
                continue                      # เลิกพาร์สแล้ว — อ่านทิ้งอย่างเดียวกัน buffer เต็ม
            self._buf.extend(chunk)
            self._parse()
        self.stop()

    def _parse(self):
        b = self._buf
        while b:
            t = b[0]
            if t == self.TYPE_ACK_CLIPBOARD:
                if len(b) < 9:
                    return
                seq = struct.unpack(">q", bytes(b[1:9]))[0]
                del b[:9]
                with self._cv:
                    self._acks.add(seq)
                    if len(self._acks) > 64:
                        # ack ที่มาช้ากว่า timeout ไม่มีใครมารับ — เก็บไว้แค่ 32 ตัวล่าสุด
                        for old in sorted(self._acks)[:-32]:
                            self._acks.discard(old)
                    self._cv.notify_all()
            elif t == self.TYPE_CLIPBOARD:
                if len(b) < 5:
                    return
                n = struct.unpack(">I", bytes(b[1:5]))[0]
                if len(b) < 5 + n:
                    return
                text = bytes(b[5:5 + n]).decode("utf-8", "ignore")
                del b[:5 + n]
                with self._cv:
                    self._clip_text  = text
                    self._clip_stamp = time.time()
                    self._cv.notify_all()
            elif t == self.TYPE_UHID_OUTPUT:
                if len(b) < 5:
                    return
                n = struct.unpack(">H", bytes(b[3:5]))[0]
                if len(b) < 5 + n:
                    return
                del b[:5 + n]
            elif t == self.TYPE_OPEN_KEYBOARD:
                del b[:1]
            else:
                self.synced = False
                b.clear()
                self.log(f"[scrcpy{self.tag}] device message ไม่รู้จัก (type={t}) — เลิกอ่าน ack")
                return


class ScrcpyControl:
    """Touch-only scrcpy control session for one device."""

    def __init__(self, serial: str, width: int = 1080, height: int = 2340, log=print):
        self.serial = serial
        self.W = width
        self.H = height
        self.log = log
        self._sock: Optional[socket.socket] = None
        self._proc: Optional[subprocess.Popen] = None
        # ห้ามสุ่มพอร์ต: `adb forward` rebind ทับของเดิมเงียบๆ → โพสต์หลายเครื่องพร้อมกัน
        # เครื่อง A อาจไปต่อเข้า localabstract ของเครื่อง B = แตะลงเครื่องผิด
        self._port = _free_port()
        self._scid = f"{random.randint(0, 0x7FFFFFFF):08x}"
        self._clip_seq = 0
        self._dev: Optional[DeviceMsgReader] = None
        self._last_clip: Optional[str] = None      # ข้อความล่าสุดที่ "เรา" ตั้งไว้ (ดู set_clipboard)
        self._motionevent_ok: Optional[bool] = None  # None = ยังไม่รู้ว่าเครื่องนี้รองรับไหม

    # ── lifecycle ─────────────────────────────────────────────

    class _Failed:
        """ผลลัพธ์ปลอมเมื่อ adb ค้างจน timeout — ให้ผู้เรียกเช็ค returncode ได้เหมือนกัน"""
        returncode = 124
        stdout = ""
        stderr = "timeout"

    def _adb(self, *args, timeout: float = 15):
        # ต้องมี timeout: จุดเรียกทั้งหมดอยู่บนเส้นทาง "socket เพิ่งตาย" ซึ่งเป็นสถานการณ์เดียว
        # กับที่ `adb shell` ไม่คืนค่า — ถ้าไม่ใส่ งานโพสต์จะค้างถาวรโดยไม่มีอะไรมาปลุก
        try:
            return subprocess.run([adb_bin(self.log), "-s", self.serial, *args],
                                  capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            self.log(f"[scrcpy] adb {' '.join(args[:3])} ค้างเกิน {timeout:.0f} วิ")
            return self._Failed()
        except Exception as e:
            self.log(f"[scrcpy] adb {' '.join(args[:3])} ล้มเหลว: {e}")
            return self._Failed()

    def start(self) -> bool:
        jar = _find_server_jar()
        if not jar:
            hint = ("ติดตั้ง scrcpy แล้วใส่ใน PATH "
                    "(Win: scoop install scrcpy / choco install scrcpy · "
                    "Mac: brew install scrcpy) "
                    "หรือชี้ไฟล์เองด้วย env SCRCPY_SERVER_PATH")
            self.log(f"[scrcpy] ไม่พบ scrcpy-server jar — {hint}")
            return False

        # เวอร์ชันต้องตรงกับ jar ที่ติดตั้งจริง ไม่งั้น server ปฏิเสธการรัน
        from services.adb.scrcpy_stream import scrcpy_version
        version = scrcpy_version(self.log, jar)

        # Push server (idempotent — fast if unchanged)
        self._adb("push", jar, SERVER_REMOTE)
        self._adb("forward", f"tcp:{self._port}", f"localabstract:scrcpy_{self._scid}")

        self._proc = subprocess.Popen(
            [adb_bin(self.log), "-s", self.serial, "shell",
             f"CLASSPATH={SERVER_REMOTE}",
             "app_process", "/", "com.genymobile.scrcpy.Server", version,
             f"scid={self._scid}", "log_level=error", "tunnel_forward=true",
             "video=false", "audio=false", "control=true",
             "cleanup=false", "send_dummy_byte=true", "raw_stream=false"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        # ต้องได้ dummy byte จริงถึงจะถือว่าต่อติด
        # (adb forward รับ TCP ให้ตั้งแต่ server ยังไม่ listen หรือ server ตายไปแล้ว
        #  ถ้าไม่เช็ค byte นี้ จะได้ socket ลวง ที่ tap แล้วเงียบหายไปเฉยๆ)
        deadline = time.time() + 12
        while time.time() < deadline:
            try:
                sock = socket.create_connection(("127.0.0.1", self._port), timeout=2)
            except Exception:
                time.sleep(0.25)
                continue
            try:
                sock.settimeout(2)
                if sock.recv(1) == b"\x00":
                    sock.settimeout(None)
                    self._sock = sock
                    break
            except Exception:
                pass
            try: sock.close()
            except Exception: pass
            time.sleep(0.25)

        if not self._sock:
            err = ""
            if self._proc and self._proc.poll() is not None:
                try: err = (self._proc.stdout.read() or b"").decode("utf-8", "ignore")[-300:]
                except Exception: pass
            self.log(f"[scrcpy] control socket เชื่อมต่อไม่ได้{(' — ' + err.strip()) if err.strip() else ''}")
            if "does not match" in err:
                # เส้นทางโพสต์ก็ต้องกู้เองได้ ไม่ใช่เฉพาะจอสด
                from services.adb.scrcpy_stream import apply_server_version_hint
                apply_server_version_hint(err, jar, self.log)
            self.stop()
            return False

        # ต้องมีคนอ่านฝั่งขากลับตลอด ไม่งั้น buffer เต็มแล้ว server ค้าง (ดู DeviceMsgReader)
        self._dev = DeviceMsgReader(self._sock, self.log, tag=f":{self.serial}")
        self.log("[scrcpy] control session พร้อม")
        return True

    def stop(self):
        if self._dev:
            self._dev.stop()
            self._dev = None
        if self._sock:
            try: self._sock.close()
            except Exception: pass
            self._sock = None
        proc, self._proc = self._proc, None
        if proc:
            try: proc.terminate()
            except Exception: pass
            try:
                proc.wait(timeout=3)          # ไม่ wait = zombie `adb shell` ค้างทุกโพสต์
            except Exception:
                try: proc.kill()
                except Exception: pass
                try: proc.wait(timeout=2)
                except Exception: pass
            try:
                if proc.stdout: proc.stdout.close()
            except Exception: pass
        self._adb("forward", "--remove", f"tcp:{self._port}")

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.stop()

    # ── input ─────────────────────────────────────────────────

    def _drop_socket(self, e: Exception):
        """socket ตายกลางทาง (server ตาย / เครื่องหลุด / ปิด USB debugging ชั่วขณะ)

        ต้องไม่ปล่อย BrokenPipeError ขึ้นไป — มันจะทะลุ tap() → _tap_xy() → _run_flow()
        แล้วล้มทั้งงานโพสต์ ทั้งที่ยังแตะผ่าน adb ต่อได้
        """
        if self._sock is not None:
            self.log(f"[scrcpy] control socket ขาด ({type(e).__name__}: {e}) — ใช้ adb input แทน")
        if self._dev:
            self._dev.stop()
            self._dev = None
        try:
            if self._sock:
                self._sock.close()
        except Exception:
            pass
        self._sock = None

    def _touch(self, action: int, x: int, y: int) -> bool:
        # type=2 INJECT_TOUCH_EVENT
        # >b b Q i i H H H i i  → type, action, pointerId, x, y, w, h, pressure, actionBtn, buttons
        if not self._sock:
            return False
        pressure = 0xFFFF if action == 0 else 0           # 1.0 on DOWN, 0 on UP
        btn = 1 if action != 1 else 0                      # PRIMARY while pressed
        msg = struct.pack(">bbQiiHHHii", 2, action,
                          0xFFFFFFFFFFFFFFFF, x, y, self.W, self.H, pressure, btn, btn)
        try:
            self._sock.sendall(msg)
            return True
        except Exception as e:
            self._drop_socket(e)
            return False

    def _release_pointer(self, x: int, y: int, what: str) -> bool:
        """นิ้วค้าง DOWN อยู่บนเครื่อง (server ตายกลางท่า + cleanup=false = ไม่มีใครเก็บกวาด)

        ห้ามยิงท่าเดิมซ้ำผ่าน adb — บน toggle การแตะสองครั้งจะกลับที่เดิม
        `input motionevent` มีเฉพาะ Android 9+ (API 28) — บน SM-P585Y (Android 8.x) จะได้
        "Unknown command: motionevent" จึงต้องเช็ค returncode จริง และ **ห้าม log ว่าปล่อยแล้ว
        ถ้าไม่รู้ว่าปล่อยได้จริง** (ไม่งั้นเป็น silent failure ที่หลอกคนอ่าน log)

        คืน True เมื่อคำสั่งปล่อยนิ้วสำเร็จจริงเท่านั้น
        """
        if self._motionevent_ok is False:
            self.log(f"[scrcpy] {what} ไม่สมบูรณ์ — เครื่องนี้ไม่มี `input motionevent` "
                     f"(Android < 9) อาจมีนิ้วค้างที่ ({x},{y}) ไม่ยิงท่าซ้ำ")
            return False
        r = self._adb("shell", "input", "motionevent", "UP", str(x), str(y), timeout=10)
        out = f"{getattr(r, 'stdout', '')}{getattr(r, 'stderr', '')}"
        if r.returncode == 0 and "Unknown command" not in out and "Error:" not in out:
            self._motionevent_ok = True
            self.log(f"[scrcpy] {what} ไม่สมบูรณ์ (socket ขาดกลางท่า) — ปล่อยนิ้วที่ ({x},{y}) แล้ว")
            return True
        if "Unknown command" in out:
            self._motionevent_ok = False      # ไม่ต้องลองใหม่ทุกครั้ง
        self.log(f"[scrcpy] {what} ไม่สมบูรณ์ และปล่อยนิ้วไม่สำเร็จ (rc={r.returncode} "
                 f"{out.strip()[:80]}) — อาจมีนิ้วค้างที่ ({x},{y})")
        return False

    def tap(self, x: int, y: int, hold: float = 0.08) -> bool:
        # base_poster._tap_xy เรียกโดยไม่เช็คค่า return → ถ้า socket ตาย ต้อง fallback ที่นี่เอง
        # ไม่งั้นการแตะจะหายเงียบทั้งที่ adb ยังใช้ได้
        if not self._touch(0, x, y):
            # ตายตั้งแต่ยังไม่ได้แตะ → ยิงท่าเดิมผ่าน adb ได้ ไม่มีอะไรลงเครื่องไปแล้ว
            return self._adb("shell", "input", "tap", str(x), str(y)).returncode == 0
        time.sleep(hold)
        if self._touch(1, x, y):
            return True
        self._release_pointer(x, y, "tap")
        return False

    def text(self, s: str) -> bool:
        """พิมพ์ข้อความยูนิโค้ด (ไทยได้) ผ่าน scrcpy — type=1 INJECT_TEXT

        ทำไมต้องมี: `input text` ส่งไทยไม่ได้ ส่วน ADBKeyboard ต้องติดตั้ง APK บนเครื่อง
        ซึ่งเครื่องจริงไม่ได้มีทุกตัว (แท็บเล็ต SM-P585Y ไม่มี → แคปชั่นไทยหายทั้งก้อน)
        scrcpy พิมพ์ผ่าน InputManager ตรง ๆ ใช้ได้ทุกเครื่องที่ scrcpy ต่อติดอยู่แล้ว
        """
        if not self._sock or not s:
            return False
        data = s.encode("utf-8")
        limit = 280          # server จำกัด 300 ไบต์ต่อข้อความ (TEXT_MAX_LENGTH)
        i = 0
        try:
            while i < len(data):
                j = min(i + limit, len(data))
                while j < len(data) and (data[j] & 0xC0) == 0x80:   # ห้ามตัดกลางตัวอักษร UTF-8
                    j -= 1
                if j <= i:
                    return False
                chunk = data[i:j]
                self._sock.sendall(struct.pack(">bi", 1, len(chunk)) + chunk)
                time.sleep(0.06)
                i = j
        except Exception as e:
            self.log(f"[scrcpy] พิมพ์ข้อความไม่สำเร็จ: {e}")
            if isinstance(e, OSError):      # socket ตาย → เลิกใช้ ไม่งั้น tap ถัดไปพังตาม
                self._drop_socket(e)
            return False
        return True

    ACK_TIMEOUT = 2.0

    def set_clipboard(self, text: str, paste: bool = True) -> bool:
        """type=9 SET_CLIPBOARD — เขียนคลิปบอร์ดเครื่อง แล้วสั่งวางลงช่องที่โฟกัสอยู่

        ทำไมต้องมี: เครื่องที่ไม่ได้ลง ADBKeyboard พิมพ์ไทยไม่ได้เลย
        (`input text` รับแต่ ASCII → แคปชั่นไทยหายทั้งก้อน) คลิปบอร์ด+paste
        ใส่ยูนิโค้ดได้ทุกเครื่องที่ scrcpy ต่อติดอยู่แล้ว

        wire (ControlMessageReader.parseSetClipboard):
          type(1B) | sequence(8B BE) | paste(1B) | len(4B BE uint) | utf-8  → หัว 14 ไบต์
          ต้องใช้ format '>bqBI' — big-endian ไม่มี padding

        ⚠ ค่า return หมายถึงอะไร — **"ตั้งคลิปบอร์ดสำเร็จ" เท่านั้น ไม่ใช่ "วางสำเร็จ"**:
          True  = server ตอบ ACK_CLIPBOARD ของ sequence นี้กลับมา (= รับคำสั่งและตั้งคลิปบอร์ดแล้ว)
                  หรือ อ่าน ack ไม่ได้แต่เขียน socket ผ่าน (server คนละเวอร์ชัน — ดู DeviceMsgReader.synced)
          False = ไม่มี socket / ข้อความยาวเกินลิมิต / เขียนไม่ผ่าน / ไม่ได้ ack ใน ACK_TIMEOUT
          **ไม่การันตีว่าข้อความลงช่อง caption จริง** — paste ยิงไปที่ view ที่โฟกัสอยู่เท่านั้น
          ผู้เรียกต้อง verify เองด้วย uiautomator (base_poster._caption_landed) ก่อนกดโพสต์
          ถ้าต้องการแยกสองเรื่องนี้ออกจากกันชัดๆ ให้ใช้ `set_clipboard(text, paste=False)`
          (= ตั้งอย่างเดียว) แล้วสั่ง `paste_clipboard()` เอง (= วางอย่างเดียว)

        ⚠ เรื่อง prime (ตั้งข้อความเดิมซ้ำแล้วค่อยสั่ง paste):
          scrcpy server เช็คว่าคลิปบอร์ดมีข้อความเดิมอยู่แล้วหรือไม่ก่อนตั้งค่า — ถ้าเหมือนเดิม
          `Device.setClipboardText()` คืน false และ **บาง build ข้ามการยิง KEYCODE_PASTE**
          ทั้งที่ยังส่ง ack กลับมาปกติ = ค่า return จะเป็น True ทั้งที่ไม่มีการวางเกิดขึ้น
          เมธอดนี้จึงกันให้เอง: ถ้า `paste=True` และข้อความตรงกับที่ *เรา* เพิ่งตั้งไว้
          จะแทรกค่าอื่น (ช่องว่าง) ก่อนหนึ่งครั้ง เพื่อบังคับให้ setClipboardText คืน true จริง

        text = "" → ล้างคลิปบอร์ด (ดู clear_clipboard)
        """
        if self._sock is None or text is None:
            return False
        if paste and self._last_clip is not None and text == self._last_clip:
            # ข้อความเดิม → ต้องทำให้ค่าเปลี่ยนก่อน ไม่งั้น server อาจข้าม KEYCODE_PASTE
            self.log("[scrcpy] คลิปบอร์ดเป็นข้อความเดิมอยู่แล้ว — แทรกค่าอื่นก่อน paste")
            self._set_clipboard_raw(" ", paste=False)
            time.sleep(0.05)
        ok = self._set_clipboard_raw(text, paste=paste)
        self._last_clip = text if ok else None
        return ok

    def _set_clipboard_raw(self, text: str, paste: bool) -> bool:
        if self._sock is None:
            return False
        data = text.encode("utf-8")
        if not data:
            # ClipboardManager บางรุ่นเมิน ClipData ว่าง → ใช้ช่องว่างเดียวแทน (ผลกับผู้ใช้เท่ากัน)
            data = b" "
        if len(data) > CLIPBOARD_TEXT_MAX:
            self.log(f"[scrcpy] ข้อความยาว {len(data)} ไบต์ เกินลิมิตคลิปบอร์ด "
                     f"{CLIPBOARD_TEXT_MAX} — ไม่ส่ง (ส่งไปแล้ว server จะตัด connection ทิ้ง)")
            return False
        self._clip_seq += 1
        seq = self._clip_seq
        msg = struct.pack(">bqBI", 9, seq, 1 if paste else 0, len(data)) + data
        try:
            self._sock.sendall(msg)
        except Exception as e:
            self._drop_socket(e)
            return False
        dev = self._dev
        if dev is None or not dev.synced:
            return True                      # ยืนยันไม่ได้ แต่เขียนออกไปแล้ว — ไม่โกหกว่าล้มเหลว
        if dev.wait_ack(seq, self.ACK_TIMEOUT):
            return True
        self.log(f"[scrcpy] ตั้งคลิปบอร์ดแล้วไม่ได้ ack ใน {self.ACK_TIMEOUT:.0f} วิ — ถือว่าไม่สำเร็จ")
        return False

    def clear_clipboard(self) -> bool:
        """ล้างคลิปบอร์ดของเครื่อง — เรียกหลังพิมพ์แคปชั่น/ลิงก์เสร็จทุกครั้ง

        ทำไมต้องมี: เครื่องที่รันคือเครื่องผู้ใช้จริง ถ้าไม่ล้าง แคปชั่น + ลิงก์ affiliate
        ของโพสต์ล่าสุดจะค้างในคลิปบอร์ด (ผู้ใช้ไปวางที่อื่นแล้วลิงก์ติดไปด้วย และบน
        Android < 10 แอปพื้นหลังอ่านคลิปบอร์ดได้) และยังทำให้รอบถัดไป "วางของเก่า"
        ได้ข้อความหน้าตาถูกต้องจนตรวจไม่เจอว่าวางผิดโพสต์

        ส่งช่องว่างเดียว ไม่ใช่สตริงว่าง เพราะ ClipboardManager บางรุ่นเมิน ClipData ว่าง
        paste=False เสมอ — ล้างอย่างเดียว ไม่ยิง KEYCODE_PASTE ลงหน้าจอ
        คืนค่าตามกติกาเดียวกับ set_clipboard (True = ได้ ack / ยืนยันไม่ได้แต่ส่งผ่าน)

        ⚠ ทับของที่ผู้ใช้ก๊อปไว้เอง — ถ้าอยากคืนของเดิม ให้ `old = get_clipboard()` ก่อนเริ่ม flow
        แล้ว `set_clipboard(old, paste=False)` ตอนจบแทนการเรียกเมธอดนี้
        """
        ok = self.set_clipboard(" ", paste=False)
        if ok:
            self.log("[scrcpy] ล้างคลิปบอร์ดเครื่องแล้ว (ของเดิมที่ผู้ใช้ก๊อปไว้ถูกทับ)")
        return ok

    def get_clipboard(self, timeout: float = 2.0) -> Optional[str]:
        """type=8 GET_CLIPBOARD — ขอข้อความในคลิปบอร์ดเครื่อง (คืน None ถ้าอ่านไม่ได้)

        ใช้เก็บของเดิมก่อนเริ่ม flow แล้วคืนตอนจบ จะได้ไม่ลบสิ่งที่ผู้ใช้ก๊อปไว้
        wire: type(1B) | copyKey(1B: 0=none 1=copy 2=cut) → server ตอบ DEVICE_MSG CLIPBOARD
        ต้องมี DeviceMsgReader ที่ยังพาร์สได้ (synced) ไม่งั้นคืน None
        """
        dev = self._dev
        if self._sock is None or dev is None or not dev.synced:
            return None
        mark = time.time()
        try:
            self._sock.sendall(struct.pack(">bb", 8, 0))
        except Exception as e:
            self._drop_socket(e)
            return None
        return dev.wait_clipboard(mark, timeout)

    def paste_clipboard(self) -> bool:
        """ยิง KEYCODE_PASTE (279) ลง view ที่โฟกัสอยู่ — คู่กับ set_clipboard(text, paste=False)

        ใช้เมื่อไม่อยากพึ่ง paste flag ของ SET_CLIPBOARD (บาง build ข้าม paste ถ้าข้อความไม่เปลี่ยน)
        wire: INJECT_KEYCODE type=0 | action(1B) | keycode(4B) | repeat(4B) | metaState(4B)
        """
        if self._sock is None:
            return False
        for action in (0, 1):                       # down แล้ว up
            try:
                self._sock.sendall(struct.pack(">bbiii", 0, action, 279, 0, 0))
            except Exception as e:
                self._drop_socket(e)
                return False
        return True

    def swipe(self, x1, y1, x2, y2, steps: int = 12, duration: float = 0.3) -> bool:
        if not self._touch(0, x1, y1):
            # ยังไม่ได้เริ่มปัด → ปัดใหม่ทั้งเส้นด้วย adb ได้ปลอดภัย
            return self._adb("shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2),
                             str(int(duration * 1000))).returncode == 0
        last = (x1, y1)
        for i in range(1, steps + 1):
            t = i / steps
            last = (int(x1 + (x2 - x1) * t), int(y1 + (y2 - y1) * t))
            if not self._touch(2, *last):
                self._release_pointer(*last, "swipe")     # ห้ามปัดซ้ำ = เลื่อนสองเท่า
                return False
            time.sleep(duration / steps)
        if self._touch(1, x2, y2):
            return True
        self._release_pointer(x2, y2, "swipe")
        return False
