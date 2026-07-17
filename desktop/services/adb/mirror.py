import io
import queue
import subprocess
import threading
import time
import re
from PIL import Image
from typing import Optional, Callable

from services.adb.adb_path import adb_bin

STREAM_W = 540   # output width (half-res for performance)


class ScreenMirror:
    def __init__(self, adb_manager):
        self.adb      = adb_manager
        self.log: Callable = print

        self._running  = False
        self._serial   = ""
        self._thread: Optional[threading.Thread] = None

        self.on_frame: Optional[Callable] = None   # (img: Image, fps: int)

        self.phone_w   = 1080
        self.phone_h   = 2340
        self._stream_h = 1170  # calculated from aspect ratio
        self._fps      = 0
        self._fc       = 0
        self._fps_ts   = time.time()
        self._pending  = False

        self._latest_jpeg: Optional[bytes] = None
        self._frame_queue: queue.Queue = queue.Queue(maxsize=2)
        self._jpeg_lock = __import__("threading").Lock()

        self._adb_proc: Optional[subprocess.Popen] = None
        self._ffmpeg_proc: Optional[subprocess.Popen] = None

    # ── Control ───────────────────────────────────────────────

    def start(self, serial: str):
        if self._running:
            self.stop()
            time.sleep(0.5)
        self._serial  = serial
        self._pending = False
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        self._pending = False
        self._kill_procs()

    def mark_rendered(self):
        self._pending = False

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self._jpeg_lock:
            return self._latest_jpeg

    @property
    def fps(self) -> int:
        return self._fps

    @property
    def is_running(self) -> bool:
        return self._running

    # ── Device info ───────────────────────────────────────────

    def _get_resolution(self) -> tuple[int, int]:
        try:
            r = subprocess.run(
                [adb_bin(self.log), "-s", self._serial, "shell", "wm", "size"],
                capture_output=True, text=True, timeout=5
            )
            m = re.search(r"(\d+)x(\d+)", r.stdout)
            if m:
                return int(m.group(1)), int(m.group(2))
        except Exception:
            pass
        return 1080, 2340

    # ── Process management ────────────────────────────────────

    def _kill_procs(self):
        for proc in [self._ffmpeg_proc, self._adb_proc]:
            if proc:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    pass
        self._ffmpeg_proc = None
        self._adb_proc    = None

    def _start_procs(self, stream_h: int) -> bool:
        try:
            # Encode at target resolution on-device → no ffmpeg scale needed
            self._adb_proc = subprocess.Popen(
                [adb_bin(self.log), "-s", self._serial, "exec-out",
                 "screenrecord",
                 "--output-format=h264",
                 "--bit-rate=4000000",
                 "--size", f"{STREAM_W}x{stream_h}",  # encode at display size
                 "--time-limit=170",
                 "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=0,
            )

            self._ffmpeg_proc = subprocess.Popen(
                ["ffmpeg",
                 "-f", "h264",   # explicit format — no probing needed
                 "-i", "pipe:0",
                 "-f", "rawvideo",
                 "-pix_fmt", "rgb24",
                 "pipe:1"],
                stdin=self._adb_proc.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=0,
            )
            return True
        except Exception as e:
            self.log(f"[Mirror] ไม่สามารถเริ่ม stream: {e}")
            return False

    # ── Main loop ─────────────────────────────────────────────

    def _loop(self):
        self.phone_w, self.phone_h = self._get_resolution()

        # Calculate output height (keep aspect ratio, force even number)
        h = int(STREAM_W * self.phone_h / self.phone_w)
        self._stream_h = h if h % 2 == 0 else h + 1
        frame_bytes    = STREAM_W * self._stream_h * 3   # rgb24

        while self._running:
            self._kill_procs()

            if not self._start_procs(self._stream_h):
                time.sleep(3)
                continue

            self.log(f"[Mirror] H264 stream เริ่ม → {self._serial}")

            # ── Frame read loop ──
            while self._running:
                # Read EXACTLY frame_bytes — pipe may return chunks smaller than one frame
                try:
                    buf = bytearray()
                    while len(buf) < frame_bytes:
                        chunk = self._ffmpeg_proc.stdout.read(frame_bytes - len(buf))
                        if not chunk:
                            buf = None
                            break
                        buf.extend(chunk)
                    data = bytes(buf) if buf is not None else b''
                except Exception:
                    break

                if len(data) != frame_bytes:
                    break   # stream ended → restart

                # FPS counter
                self._fc += 1
                elapsed = time.time() - self._fps_ts
                if elapsed >= 1.0:
                    self._fps    = int(self._fc / elapsed)
                    self._fc     = 0
                    self._fps_ts = time.time()

                try:
                    img = Image.frombytes("RGB", (STREAM_W, self._stream_h), data)

                    # Always update JPEG — store latest + push to queue for stream
                    try:
                        buf = io.BytesIO()
                        img.save(buf, format="JPEG", quality=55)
                        jpeg = buf.getvalue()
                        with self._jpeg_lock:
                            self._latest_jpeg = jpeg
                        # Push to stream queue; drop oldest frame if full
                        try:
                            self._frame_queue.put_nowait(jpeg)
                        except queue.Full:
                            try: self._frame_queue.get_nowait()
                            except queue.Empty: pass
                            try: self._frame_queue.put_nowait(jpeg)
                            except queue.Full: pass
                    except Exception:
                        pass

                    # Throttle on_frame callback for Tkinter UI only
                    if not self._pending:
                        self._pending = True
                        if self.on_frame:
                            self.on_frame(img, self._fps)
                except Exception:
                    self._pending = False

            if not self._running:
                break

            self.log("[Mirror] Stream หยุด — restart...")
            time.sleep(1)

        self._kill_procs()
        self._fps = 0

    # ── Input events ──────────────────────────────────────────

    def tap(self, x: int, y: int):
        threading.Thread(
            target=lambda: self.adb.tap(self._serial, x, y),
            daemon=True
        ).start()

    def swipe(self, x1: int, y1: int, x2: int, y2: int, ms: int = 250):
        threading.Thread(
            target=lambda: self.adb._adb(
                "shell", "input", "swipe",
                str(x1), str(y1), str(x2), str(y2), str(ms),
                serial=self._serial
            ), daemon=True
        ).start()

    def _key(self, code: str):
        threading.Thread(
            target=lambda: self.adb._adb(
                "shell", "input", "keyevent", code,
                serial=self._serial
            ), daemon=True
        ).start()

    def home(self):     self._key("KEYCODE_HOME")
    def back(self):     self._key("KEYCODE_BACK")
    def recents(self):  self._key("KEYCODE_APP_SWITCH")
    def vol_up(self):   self._key("KEYCODE_VOLUME_UP")
    def vol_down(self): self._key("KEYCODE_VOLUME_DOWN")
    def power(self):    self._key("KEYCODE_POWER")
    def enter(self):    self._key("KEYCODE_ENTER")
