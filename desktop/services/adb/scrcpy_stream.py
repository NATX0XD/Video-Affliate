"""
scrcpy video + control session — สตรีม H.264 ดิบเข้าเว็บ (ดีเลย์ต่ำ) แทน MJPEG เดิม

ทำไมต้องมี:
  mirror.py เดิมใช้ `adb screenrecord` → ffmpeg → JPEG re-encode → MJPEG
  ดีเลย์ ~1-2 วิ, กิน CPU, ต้อง restart ทุก 170 วิ
  โมดูลนี้ต่อ scrcpy server ตรงๆ เอา H.264 packet ส่งเข้า WebSocket
  ให้เบราว์เซอร์ decode เองด้วย WebCodecs → ดีเลย์ ~50-100ms, CPU แทบไม่ขยับ

โปรโตคอล (ยืนยันจาก source scrcpy 4.1):
  video socket:  [dummy byte][codec id 4B]  แล้ววนอ่าน header 12B
                 - header[0] & 0x80  → session meta: width=BE32(4..8), height=BE32(8..12)
                 - ไม่งั้น          → frame: ptsAndFlags=BE64(0..8), size=BE32(8..12), ตามด้วย payload
                   bit62 = config packet (SPS/PPS), bit61 = key frame
  control socket: เชื่อมทีหลัง video (tunnel_forward accept ตามลำดับ) ไม่มี dummy byte
"""
import re
import socket
import struct
import subprocess
import threading
import time
import random
from typing import Optional, Callable

from services.adb.adb_path import adb_bin
from services.adb.scrcpy_control import _find_server_jar, SERVER_REMOTE

# scrcpy server jar ต้องได้ version string ตรงกับตัว jar ไม่งั้นมันจะปฏิเสธการรัน
_FALLBACK_VERSION = "4.1"
_version_cache: Optional[str] = None

# keycode Android ที่ใช้บ่อย — ยิงผ่าน control socket เร็วกว่า `adb shell input keyevent` มาก
KEYCODES = {
    "KEYCODE_HOME": 3,
    "KEYCODE_BACK": 4,
    "KEYCODE_VOLUME_UP": 24,
    "KEYCODE_VOLUME_DOWN": 25,
    "KEYCODE_POWER": 26,
    "KEYCODE_ENTER": 66,
    "KEYCODE_APP_SWITCH": 187,
}

PACKET_FLAG_CONFIG = 1 << 62
PACKET_FLAG_KEY    = 1 << 61


def _version_of(exe) -> Optional[str]:
    try:
        r = subprocess.run([str(exe), "--version"], capture_output=True, text=True, timeout=5)
        m = re.search(r"scrcpy\s+([0-9]+(?:\.[0-9]+)+)", (r.stdout or "") + (r.stderr or ""))
        return m.group(1) if m else None
    except Exception:
        return None


def scrcpy_version(log=print, jar: Optional[str] = None) -> str:
    """
    version ที่ส่งให้ server ต้องตรงกับ jar ที่ push ขึ้นมือถือ ไม่งั้น server ตายทันที
    ("The server version (x) does not match the client (y)") แล้ว tap ทุกครั้งจะ BrokenPipe

    ลำดับการหา: env → binary scrcpy ที่อยู่ข้างๆ jar (สำคัญ: เครื่องนี้มีทั้ง ~/.vgap 4.0
    และ brew 4.1) → scrcpy บน PATH
    """
    global _version_cache
    if _version_cache:
        return _version_cache
    import os
    from pathlib import Path

    env = os.environ.get("VGAP_SCRCPY_VERSION")
    if env:
        _version_cache = env.strip()
        return _version_cache

    if jar:
        d = Path(jar).resolve().parent
        for cand in (d / "scrcpy", d / "scrcpy.exe",
                     d.parent / "bin" / "scrcpy",            # <prefix>/share/scrcpy → <prefix>/bin
                     d.parent.parent / "bin" / "scrcpy"):
            if cand.exists():
                v = _version_of(cand)
                if v:
                    _version_cache = v
                    return v

    v = _version_of("scrcpy")
    if v:
        _version_cache = v
        return v

    _version_cache = _FALLBACK_VERSION
    log(f"[scrcpy] อ่านเวอร์ชันไม่ได้ — ใช้ค่าเริ่มต้น {_version_cache}")
    return _version_cache


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class ScrcpySession:
    """หนึ่ง session ต่อหนึ่งเครื่อง — video fan-out ให้หลาย subscriber ได้พร้อมกัน"""

    def __init__(self, serial: str, log: Callable = print,
                 max_size: int = 1024, max_fps: int = 30, bit_rate: int = 6_000_000,
                 codec: str = "h264"):
        self.serial   = serial
        self.log      = log
        self.max_size = max_size
        self.max_fps  = max_fps
        self.bit_rate = bit_rate
        self.codec    = codec

        self.width  = 0
        self.height = 0
        self.device_name = ""
        self.running = False

        self._video: Optional[socket.socket]   = None
        self._control: Optional[socket.socket] = None
        self._proc: Optional[subprocess.Popen] = None
        self._port = 0
        self._scid = ""

        self._subs: dict = {}          # id → callback(kind, payload, meta)
        self._sub_seq = 0
        self._subs_lock = threading.Lock()
        self._ctl_lock  = threading.Lock()
        self._start_lock = threading.Lock()
        self._config_pkt: Optional[bytes] = None   # SPS/PPS ล่าสุด (ส่งให้ subscriber ใหม่)
        self._reader: Optional[threading.Thread] = None

    # ── lifecycle ────────────────────────────────────────────

    def _adb(self, *args, timeout=15):
        return subprocess.run([adb_bin(self.log), "-s", self.serial, *args],
                              capture_output=True, text=True, timeout=timeout)

    def start(self) -> bool:
        with self._start_lock:
            if self.running:
                return True
            jar = _find_server_jar()
            if not jar:
                self.log("[scrcpy] ไม่พบ scrcpy-server — ติดตั้ง scrcpy ก่อน "
                         "(Mac: brew install scrcpy · Win: scoop install scrcpy)")
                return False

            version = scrcpy_version(self.log, jar)
            self._port = _free_port()
            self._scid = f"{random.randint(0, 0x7FFFFFFF):08x}"

            try:
                self._adb("push", jar, SERVER_REMOTE, timeout=30)
                self._adb("forward", f"tcp:{self._port}", f"localabstract:scrcpy_{self._scid}")
            except Exception as e:
                self.log(f"[scrcpy] เตรียม server ไม่สำเร็จ: {e}")
                return False

            # ⚠ ส่ง option เท่าที่จำเป็นเท่านั้น (ที่เหลือใช้ค่า default ของ server)
            # เครื่อง Android 8.x บางรุ่น (เช่น SM-P585Y) app_process จะพัง
            # "stack corruption detected (-fstack-protector)" เมื่อ command line ยาวเกิน
            # — ไม่เกี่ยวกับ option ตัวไหน แต่เกี่ยวกับความยาวรวม จึงห้ามใส่ค่า default ซ้ำ
            self._proc = subprocess.Popen(
                [adb_bin(self.log), "-s", self.serial, "shell",
                 f"CLASSPATH={SERVER_REMOTE}",
                 "app_process", "/", "com.genymobile.scrcpy.Server", version,
                 f"scid={self._scid}", "log_level=error", "tunnel_forward=true",
                 "audio=false",
                 f"max_size={self.max_size}", f"max_fps={self.max_fps}",
                 f"video_bit_rate={self.bit_rate}"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            )
            threading.Thread(target=self._drain_server_log, daemon=True).start()

            # video socket ต้องต่อก่อน control เสมอ (server accept ตามลำดับ)
            # adb forward ยอมรับ connection ตั้งแต่ server ยังไม่ listen แล้วปิดทิ้ง
            # → ต้องวนต่อใหม่จนกว่าจะได้ dummy byte จริง
            self._video = self._handshake_video(timeout=15)
            if not self._video:
                out = ""
                if self._proc and self._proc.poll() is not None:
                    try: out = (self._proc.stdout.read() or b"").decode("utf-8", "ignore")[-400:]
                    except Exception: pass
                self.log(f"[scrcpy] ต่อ video socket ไม่ได้{(' — ' + out.strip()) if out.strip() else ''}")
                self._teardown()
                return False

            self._control = self._connect(timeout=5)
            if not self._control:
                self.log("[scrcpy] ต่อ control socket ไม่ได้ — ดูได้แต่คุมไม่ได้")

            self.running = True
            self._reader = threading.Thread(target=self._read_loop, daemon=True,
                                            name=f"scrcpy-{self.serial}")
            self._reader.start()
            self.log(f"[scrcpy] สตรีมเริ่ม → {self.serial} ({self.codec} {self.max_size}p {self.max_fps}fps)")
            return True

    def _drain_server_log(self):
        """ต้องอ่าน stdout ทิ้งเรื่อยๆ ไม่งั้น pipe เต็มแล้ว server ค้าง"""
        proc = self._proc
        if not proc or not proc.stdout:
            return
        for raw in iter(proc.stdout.readline, b""):
            line = raw.decode("utf-8", "ignore").strip()
            if line and ("ERROR" in line or "WARN" in line):
                self.log(f"[scrcpy:{self.serial}] {line}")

    def _handshake_video(self, timeout: float) -> Optional[socket.socket]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            sock = self._connect(timeout=min(2.0, max(0.1, deadline - time.time())))
            if not sock:
                continue
            try:
                sock.settimeout(2)
                if sock.recv(1) == b"\x00":
                    sock.settimeout(None)
                    return sock
            except Exception:
                pass
            try: sock.close()
            except Exception: pass
            time.sleep(0.2)
        return None

    def _connect(self, timeout: float) -> Optional[socket.socket]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                return socket.create_connection(("127.0.0.1", self._port), timeout=2)
            except Exception:
                time.sleep(0.15)
        return None

    def _teardown(self):
        for s in (self._video, self._control):
            try:
                if s: s.close()
            except Exception:
                pass
        self._video = self._control = None
        if self._proc:
            try: self._proc.terminate()
            except Exception: pass
            self._proc = None
        if self._port:
            try: self._adb("forward", "--remove", f"tcp:{self._port}", timeout=5)
            except Exception: pass

    def stop(self):
        self.running = False
        self._teardown()
        self._config_pkt = None
        self.log(f"[scrcpy] สตรีมหยุด → {self.serial}")

    # ── subscribers ──────────────────────────────────────────

    def subscribe(self, cb: Callable) -> int:
        """cb(kind, payload) — kind: 'meta' | 'packet'; payload: dict | (flags, bytes)"""
        with self._subs_lock:
            self._sub_seq += 1
            sid = self._sub_seq
            self._subs[sid] = cb
        # subscriber ใหม่ต้องได้ SPS/PPS + key frame ทันที ไม่งั้นภาพไม่ขึ้น
        # (ถ้ายังไม่มี config = encoder เพิ่งเริ่ม เดี๋ยวมันส่ง config+key frame มาเองอยู่แล้ว
        #  ห้ามสั่ง reset ตอนนี้ — server จะโยน exception ใน thread control-recv แล้วสตรีมไม่เริ่ม)
        if self._config_pkt:
            try: cb("packet", (0b01, self._config_pkt))
            except Exception: pass
            cb("meta", {"codec": self.codec, "width": self.width, "height": self.height})
            self.request_key_frame()
        return sid

    def unsubscribe(self, sid: int) -> int:
        with self._subs_lock:
            self._subs.pop(sid, None)
            return len(self._subs)

    @property
    def subscriber_count(self) -> int:
        with self._subs_lock:
            return len(self._subs)

    def _emit(self, kind: str, payload):
        with self._subs_lock:
            subs = list(self._subs.values())
        for cb in subs:
            try:
                cb(kind, payload)
            except Exception:
                pass

    # ── video reader ─────────────────────────────────────────

    def _recv_exact(self, n: int) -> Optional[bytes]:
        buf = bytearray()
        while len(buf) < n:
            try:
                chunk = self._video.recv(n - len(buf))
            except Exception:
                return None
            if not chunk:
                return None
            buf.extend(chunk)
        return bytes(buf)

    def _read_loop(self):
        meta = self._recv_exact(64)                # device name (send_device_meta default = true)
        if meta:
            self.device_name = meta.rstrip(b"\x00").decode("utf-8", "ignore")
        head = self._recv_exact(4)                 # codec id เช่น b"h264"
        if not head:
            self.running = False
            return
        codec_id = head.decode("ascii", "ignore").strip("\x00")
        if codec_id:
            self.codec = codec_id

        while self.running:
            hdr = self._recv_exact(12)
            if not hdr:
                break
            if hdr[0] & 0x80:                      # session meta (ขนาดจอ/หมุนจอ)
                self.width  = struct.unpack(">I", hdr[4:8])[0]
                self.height = struct.unpack(">I", hdr[8:12])[0]
                self._config_pkt = None            # config เก่าใช้ไม่ได้แล้ว
                self._emit("meta", {"codec": self.codec,
                                    "width": self.width, "height": self.height})
                continue

            pts_flags = struct.unpack(">Q", hdr[0:8])[0]
            size      = struct.unpack(">I", hdr[8:12])[0]
            data = self._recv_exact(size)
            if data is None:
                break
            is_config = bool(pts_flags & PACKET_FLAG_CONFIG)
            is_key    = bool(pts_flags & PACKET_FLAG_KEY)
            if is_config:
                self._config_pkt = data
            flags = (0b01 if is_config else 0) | (0b10 if is_key else 0)
            self._emit("packet", (flags, data))

        self.running = False
        self._emit("meta", {"closed": True})

    # ── control ──────────────────────────────────────────────

    def _send_ctl(self, msg: bytes) -> bool:
        if not self._control:
            return False
        with self._ctl_lock:
            try:
                self._control.sendall(msg)
                return True
            except Exception:
                return False

    def request_key_frame(self):
        """TYPE_RESET_VIDEO — บังคับ encoder ส่ง config + key frame ใหม่ทันที"""
        self._send_ctl(struct.pack(">b", 17))

    def touch(self, action: int, rx: float, ry: float,
              pointer_id: int = 0xFFFFFFFFFFFFFFFF, pressure: float = 1.0):
        """rx/ry = สัดส่วน 0..1 ของจอ — แปลงเป็นพิกัดวิดีโอปัจจุบัน กันพลาดตอนหมุนจอ"""
        w, h = self.width or 1080, self.height or 2340
        x = max(0, min(w - 1, int(rx * w)))
        y = max(0, min(h - 1, int(ry * h)))
        p = 0 if action == 1 else int(max(0.0, min(1.0, pressure)) * 0xFFFF)
        btn = 0 if action == 1 else 1              # PRIMARY ระหว่างกดอยู่
        self._send_ctl(struct.pack(">bbQiiHHHii", 2, action, pointer_id,
                                   x, y, w, h, p, btn, btn))

    def scroll(self, rx: float, ry: float, hscroll: float = 0.0, vscroll: float = 0.0):
        w, h = self.width or 1080, self.height or 2340
        x = max(0, min(w - 1, int(rx * w)))
        y = max(0, min(h - 1, int(ry * h)))
        # ฝั่ง server หาร 16 กลับ → ส่งเป็น fixed point ของช่วง [-16,16]
        hs = int(max(-1.0, min(1.0, hscroll / 16)) * 0x7FFF)
        vs = int(max(-1.0, min(1.0, vscroll / 16)) * 0x7FFF)
        self._send_ctl(struct.pack(">biiHHhhi", 3, x, y, w, h, hs, vs, 0))

    def key(self, code, meta_state: int = 0) -> bool:
        """code = ชื่อ KEYCODE_* หรือเลข — ส่ง down+up"""
        kc = KEYCODES.get(code) if isinstance(code, str) else int(code)
        if kc is None:
            return False
        ok = self._send_ctl(struct.pack(">bbiii", 0, 0, kc, 0, meta_state))
        ok = self._send_ctl(struct.pack(">bbiii", 0, 1, kc, 0, meta_state)) and ok
        return ok


class ScrcpyManager:
    """คุม session ต่อ serial — เปิดเมื่อมีคนดู ปิดเมื่อไม่มีคนดูแล้ว"""

    IDLE_GRACE = 8.0   # วินาที — กันเปิด/ปิดรัวตอนสลับหน้า

    def __init__(self, log: Callable = print):
        self.log = log
        self._sessions: dict = {}
        self._lock = threading.Lock()

    def get_or_start(self, serial: str, **kw) -> Optional[ScrcpySession]:
        old = None
        with self._lock:
            s = self._sessions.get(serial)
            if s and s.running:
                # คนดูใหม่ขอความละเอียดสูงกว่าที่สตรีมอยู่ (เช่น เปิดเต็มจอจากกริด) → เปิดใหม่ให้คมขึ้น
                # คนดูเดิมจะโดนตัดแล้ว reconnect เองอัตโนมัติ
                if kw.get("max_size", 0) > s.max_size:
                    old = self._sessions.pop(serial, None)
                else:
                    return s
        if old:
            old.stop()
        with self._lock:
            s = ScrcpySession(serial, log=self.log, **kw)
            self._sessions[serial] = s
        if not s.start():
            with self._lock:
                self._sessions.pop(serial, None)
            return None
        return s

    def get(self, serial: str) -> Optional[ScrcpySession]:
        return self._sessions.get(serial)

    def release(self, serial: str):
        """เรียกตอน subscriber ตัวสุดท้ายหลุด — รอ grace ก่อนปิดจริง"""
        def _later():
            time.sleep(self.IDLE_GRACE)
            with self._lock:
                s = self._sessions.get(serial)
                if s and s.subscriber_count == 0:
                    self._sessions.pop(serial, None)
                    s.stop()
        threading.Thread(target=_later, daemon=True).start()

    def stop(self, serial: str):
        with self._lock:
            s = self._sessions.pop(serial, None)
        if s:
            s.stop()

    def stop_all(self):
        with self._lock:
            items = list(self._sessions.values())
            self._sessions.clear()
        for s in items:
            s.stop()
