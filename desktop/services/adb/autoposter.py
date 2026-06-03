import time
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Callable, Tuple


class AutoPoster:
    """Automates posting a video to Shopee Video (luckyvideo PublishVideoActivity).

    NOTE on this device class (Samsung / Android 16):
    - Shopee Video screens do NOT expose UI Automator nodes (dumps return stale
      data). So the flow uses RATIO-BASED fixed coordinates mapped from a real
      1080x2340 run, scaled to the device resolution.
    - Thai captions require ADBKeyboard (input text / clipboard fail). See manager.
    """

    # Ratio coordinates (x/W, y/H) discovered from a real 1080x2340 device.
    # Keep these in sync with the actual Shopee Video UI.
    R = {
        "live_video_tab": (0.500, 0.932),   # bottom nav "Live & Video"
        "plus_button":    (0.940, 0.072),   # "+" top-right of video feed
        "gallery":        (0.798, 0.790),   # "คลังภาพ" in camera screen
        "video_filter":   (0.500, 0.135),   # "วิดีโอ" tab in gallery picker
        "first_video":    (0.125, 0.205),   # first cell after filtering videos
        "next_1":         (0.885, 0.906),   # "ถัดไป" after selecting video
        "next_2":         (0.861, 0.881),   # "ถัดไป" after editor
        "caption_field":  (0.444, 0.123),   # caption input (right of thumbnail, NOT the header)
        "post_button":    (0.500, 0.955),   # "โพสต์" button
    }

    def __init__(self, adb_manager, log_cb: Optional[Callable] = None):
        self.adb = adb_manager
        self.log = log_cb or print
        self._w = 1080
        self._h = 2340
        self._scrcpy = None   # ScrcpyControl session (set during posting)

    # ── Device helpers ────────────────────────────────────────

    def _get_resolution(self, serial: str) -> Tuple[int, int]:
        _, out = self.adb._adb("shell", "wm", "size", serial=serial)
        m = re.search(r"(\d+)x(\d+)", out)
        if m:
            return int(m.group(1)), int(m.group(2))
        return 1080, 2340

    def _tap_xy(self, serial: str, x: int, y: int):
        """Tap via scrcpy if available (focuses EditTexts), else adb input tap."""
        if self._scrcpy:
            self._scrcpy.tap(x, y)
        else:
            self.adb.tap(serial, x, y)

    def _tap_r(self, serial: str, key: str, settle: float = 2.0):
        """Tap a ratio-coordinate by name."""
        rx, ry = self.R[key]
        x, y = int(self._w * rx), int(self._h * ry)
        self.log(f"[POST] tap {key} → ({x},{y})")
        self._tap_xy(serial, x, y)
        time.sleep(settle)

    def _wake(self, serial: str):
        self.adb._adb("shell", "input", "keyevent", "KEYCODE_WAKEUP", serial=serial)
        time.sleep(0.5)

    def _current_activity(self, serial: str) -> str:
        _, out = self.adb._adb("shell", "dumpsys", "window", serial=serial)
        m = re.search(r"mCurrentFocus=Window\{[^}]*\s+(\S+/\S+)\}", out)
        return m.group(1) if m else ""

    # ── Push video ────────────────────────────────────────────

    def push_video(self, serial: str, video_path: Path) -> bool:
        remote = f"/sdcard/DCIM/Camera/{video_path.name}"
        size_kb = video_path.stat().st_size // 1024
        self.log(f"[POST] ส่งวิดีโอไปมือถือ ({size_kb}KB)...")

        ok, msg = self.adb._adb("push", str(video_path), remote,
                                 serial=serial, timeout=120)
        if not ok:
            self.log(f"[POST] ส่งวิดีโอไม่สำเร็จ: {msg}")
            return False

        # Media scan so it appears in gallery immediately
        self.adb._adb("shell", "am", "broadcast",
                       "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
                       "-d", f"file://{remote}", serial=serial)
        time.sleep(3)
        self.log("[POST] ส่งวิดีโอสำเร็จ ✓")
        return True

    # ── Caption typing (ADBKeyboard for Thai) ─────────────────

    def _type_caption(self, serial: str, text: str, has_adbkb: bool):
        # ADBKeyboard must already be the active IME (set before focusing the field),
        # so the focused caption keeps its input connection when we broadcast.
        if has_adbkb:
            self.adb.type_unicode(serial, text)
        else:
            ascii_only = "".join(c for c in text if ord(c) < 128).strip()
            self.adb._adb("shell", "input", "text",
                          ascii_only.replace(" ", "%s"), serial=serial)
        time.sleep(1)

    # ── Shopee Video posting flow ─────────────────────────────

    def post_to_shopee(self, serial: str, video_path: Path, product: dict,
                       dry_run: bool = False) -> bool:
        name  = product.get("basic_info", {}).get("name", "")[:60]
        price = product.get("basic_info", {}).get("price", "")
        comm  = product.get("commission", {}).get("rate", "")
        link  = (product.get("links", {}).get("affiliate_link", "") or
                 product.get("links", {}).get("product_url", ""))
        caption = f"{name} ราคา {price} บาท"
        if comm:
            caption += f" commission {comm}%"
        if link:
            caption += f" {link}"

        self._w, self._h = self._get_resolution(serial)
        self.log(f"[POST] Resolution: {self._w}x{self._h}")

        original_ime = self.adb.get_default_ime(serial)
        has_adbkb    = self.adb.has_adb_keyboard(serial)
        if has_adbkb:
            # Enable + activate ADBKeyboard up-front so the caption field already
            # has it as the IME when we focus it (switching IME after focus drops it).
            self.adb._adb("shell", "ime", "enable", self.adb.ADB_IME, serial=serial)
            self.adb.set_ime(serial, self.adb.ADB_IME)
            time.sleep(0.5)

        # Start scrcpy control session — required to focus Shopee's caption field
        from services.adb.scrcpy_control import ScrcpyControl
        self._scrcpy = ScrcpyControl(serial, self._w, self._h, log=self.log)
        if not self._scrcpy.start():
            self.log("[POST] ⚠ scrcpy ใช้ไม่ได้ — caption อาจไม่ติด (ใช้ adb tap แทน)")
            self._scrcpy = None

        try:
            return self._do_post(serial, video_path, caption, has_adbkb, dry_run)
        finally:
            if self._scrcpy:
                self._scrcpy.stop()
                self._scrcpy = None
            if has_adbkb and original_ime and "adbkeyboard" not in original_ime.lower():
                self.adb.set_ime(serial, original_ime)

    def _do_post(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        # 1. Wake & open Shopee (force-stop first → clean launch, not resume a draft)
        self._wake(serial)
        self.log("[POST] เปิด Shopee...")
        self.adb._adb("shell", "am", "force-stop", "com.shopee.th", serial=serial)
        time.sleep(1)
        self.adb._adb("shell", "monkey", "-p", "com.shopee.th",
                       "-c", "android.intent.category.LAUNCHER", "1", serial=serial)
        time.sleep(6)

        # 2. Go to "Live & Video" tab
        self.log("[POST] เปิดแท็บ Live & Video...")
        self._tap_r(serial, "live_video_tab", settle=4)

        # 3. Tap "+" to create
        self.log("[POST] กด + สร้างวิดีโอ...")
        self._tap_r(serial, "plus_button", settle=4)

        # 4. Open gallery "คลังภาพ"
        self.log("[POST] เปิดคลังภาพ...")
        self._tap_r(serial, "gallery", settle=3)

        # 5. Filter videos then pick the first (newest) one
        self.log("[POST] กรองเฉพาะวิดีโอ + เลือกอันล่าสุด...")
        self._tap_r(serial, "video_filter", settle=2)
        self._tap_r(serial, "first_video", settle=2)

        # 6. Next (select) → Next (editor)
        self._tap_r(serial, "next_1", settle=4)
        self._tap_r(serial, "next_2", settle=4)

        # 7. Reach the publish screen. A stray tap can open the video preview
        #    (PreviewVideoActivity) on top — back out until we're on PublishVideoActivity.
        for _ in range(3):
            act = self._current_activity(serial)
            short = act.split("/")[-1] if act else "?"
            self.log(f"[POST] หน้าปัจจุบัน: {short}")
            if short.endswith("PublishVideoActivity"):
                break
            if "PreviewVideoActivity" in short:
                self.log("[POST] อยู่หน้า preview — กด back กลับหน้าโพสต์")
                self.adb._adb("shell", "input", "keyevent", "KEYCODE_BACK", serial=serial)
                time.sleep(2)
            else:
                self.log("[POST] ⚠ ไม่ถึงหน้าโพสต์ — flow อาจคลาดเคลื่อน หยุดก่อนโพสต์")
                return False
        else:
            self.log("[POST] ⚠ วนหา publish screen ไม่เจอ หยุดก่อนโพสต์")
            return False

        # 8. Caption
        # NOTE: with ADBKeyboard active, mServedView is always null even when the
        # field IS focused — so we can't use focus-detection here. Instead tap the
        # caption (scrcpy gives it real focus) and broadcast the text directly.
        self.log("[POST] ใส่ caption...")
        self._tap_r(serial, "caption_field", settle=1.5)
        self._type_caption(serial, caption, has_adbkb)

        if dry_run:
            self.log("[POST] DRY RUN — พิมพ์ caption แล้ว หยุดก่อนกดโพสต์ ✓")
            self.log("[POST] ตรวจสอบ caption บนมือถือ ถ้าถูกต้องค่อยรันจริง")
            return True

        # 9. Post
        self.log("[POST] กดโพสต์...")
        self._tap_r(serial, "post_button", settle=4)
        self.log("[POST] เสร็จสิ้น flow ✓ (ตรวจสอบผลบนมือถือ)")
        return True

    # ── Full flow ─────────────────────────────────────────────

    def process(self, serial: str, video_path: Path, product: dict,
                dry_run: bool = False) -> bool:
        if not self.push_video(serial, video_path):
            return False
        time.sleep(2)
        return self.post_to_shopee(serial, video_path, product, dry_run=dry_run)
