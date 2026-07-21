"""
BasePoster — กลไกร่วมของการโพสต์คลิปทุกแพลตฟอร์ม.

แต่ละแพลตฟอร์มสืบทอดคลาสนี้แล้วกำหนด:
    PACKAGE   = ชื่อแพ็กเกจแอป (com.xxx)
    TAG       = ป้าย log สั้น ๆ (เช่น "TIKTOK")
    USE_SCRCPY= True ถ้าต้องใช้ scrcpy โฟกัสช่อง caption (Shopee จำเป็น)
    _run_flow(serial, video_path, caption, has_adbkb, dry_run) -> bool
        ลำดับ tap เฉพาะของแพลตฟอร์มนั้น (เปิดอัปโหลด → เลือกวิดีโอ → caption → โพสต์)

กลไกร่วม: push คลิปเข้าแกลเลอรี, ปลุก/ปลดล็อกจอ, ADBKeyboard (ไทย),
ตัวช่วย UIAutomator (หา element จาก text/desc/id — ทนต่อความละเอียดจอ),
สร้าง caption จากเทมเพลต, ยืนยันผลด้วย Gemini Vision.
"""
import time
import re
import random
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Callable, Tuple


class BasePoster:
    PACKAGE: str = ""
    TAG: str = "POST"
    USE_SCRCPY: bool = False
    # พิกัดเซลล์วิดีโอแรก (ใหม่สุด) ในแกลเลอรี — ratio (x/W, y/H), override ต่อแพลตฟอร์ม
    FIRST_CELL: Tuple[float, float] = (0.16, 0.30)

    def __init__(self, adb_manager, log_cb: Optional[Callable] = None,
                 settings: Optional[dict] = None):
        self.adb = adb_manager
        self.log = log_cb or print
        self.settings = settings or {}
        self.usage_cb = None   # (service, kind, qty, tokens) → usage ledger (J)
        self._w = 1080
        self._h = 2340
        self._scrcpy = None

    # ── Device helpers ────────────────────────────────────────

    def _get_resolution(self, serial: str) -> Tuple[int, int]:
        _, out = self.adb._adb("shell", "wm", "size", serial=serial)
        m = re.search(r"(\d+)x(\d+)", out)
        return (int(m.group(1)), int(m.group(2))) if m else (1080, 2340)

    def _tap_xy(self, serial: str, x: int, y: int):
        if self._scrcpy:
            self._scrcpy.tap(x, y)
        else:
            self.adb.tap(serial, x, y)

    def _tap_ratio(self, serial: str, rx: float, ry: float, name="", settle=2.0):
        x, y = int(self._w * rx), int(self._h * ry)
        if name:
            self.log(f"[{self.TAG}] tap {name} → ({x},{y})")
        self._tap_xy(serial, x, y)
        time.sleep(settle)

    def _is_locked(self, serial: str) -> bool:
        _, out = self.adb._adb("shell", "dumpsys", "window", serial=serial)
        return "isKeyguardShowing=true" in out or "mDreamingLockscreen=true" in out

    def _wake(self, serial: str):
        self.adb._adb("shell", "input", "keyevent", "KEYCODE_WAKEUP", serial=serial)
        time.sleep(0.5)
        self.adb._adb("shell", "wm", "dismiss-keyguard", serial=serial)
        time.sleep(0.6)
        self.adb._adb("shell", "svc", "power", "stayon", "true", serial=serial)
        if self._is_locked(serial):
            self.log(f"[{self.TAG}] ⚠ มือถือยังล็อกอยู่ (secure lock) — โปรดตั้ง screen lock "
                     "เป็น 'ปัด' หรือ 'ไม่มี' บนเครื่องโพสต์ ไม่งั้นโพสต์อัตโนมัติไม่ได้")
        time.sleep(0.5)

    def _current_activity(self, serial: str) -> str:
        _, out = self.adb._adb("shell", "dumpsys", "window", serial=serial)
        m = re.search(r"mCurrentFocus=Window\{[^}]*\s+(\S+/\S+)\}", out)
        return m.group(1) if m else ""

    def _open_app(self, serial: str, wait: float = 6.0):
        """Force-stop + เปิดแอปสะอาด ๆ (ไม่ resume draft เก่า)."""
        self._wake(serial)
        self.log(f"[{self.TAG}] เปิดแอป {self.PACKAGE}...")
        self.adb._adb("shell", "am", "force-stop", self.PACKAGE, serial=serial)
        time.sleep(1)
        self.adb._adb("shell", "monkey", "-p", self.PACKAGE,
                      "-c", "android.intent.category.LAUNCHER", "1", serial=serial)
        time.sleep(wait)

    # ── UIAutomator: หา element จาก text/desc/id (ทนความละเอียด) ──

    def _ui_dump(self, serial: str):
        self.adb._adb("shell", "uiautomator", "dump", "/sdcard/ui_post.xml",
                      serial=serial, timeout=12)
        ok, out = self.adb._adb("shell", "cat", "/sdcard/ui_post.xml",
                                serial=serial, timeout=10)
        if not ok or "<hierarchy" not in out:
            return None
        try:
            return ET.fromstring(out)
        except Exception:
            return None

    @staticmethod
    def _node_center(node):
        m = re.findall(r"\d+", node.get("bounds", ""))
        if len(m) >= 4:
            x1, y1, x2, y2 = map(int, m[:4])
            return (x1 + x2) // 2, (y1 + y2) // 2
        return None

    @staticmethod
    def _match(val: str, q: str, exact: bool) -> bool:
        if not val:
            return False
        return val == q if exact else (q.lower() in val.lower())

    def _find(self, serial, text=None, desc=None, rid=None, exact=False):
        """คืนพิกัดกลาง element แรกที่ตรง (text/content-desc/resource-id)."""
        root = self._ui_dump(serial)
        if root is None:
            return None
        for n in root.iter("node"):
            if text is not None and not self._match(n.get("text", ""), text, exact):
                continue
            if desc is not None and not self._match(n.get("content-desc", ""), desc, exact):
                continue
            if rid is not None and rid not in n.get("resource-id", ""):
                continue
            if text is None and desc is None and rid is None:
                continue
            c = self._node_center(n)
            if c:
                return c
        return None

    def _find_any(self, serial, candidates: list):
        """ลองหลายตัวเลือก (เช่น ['Next','ถัดไป']) — คืนพิกัดตัวแรกที่เจอ."""
        root = self._ui_dump(serial)
        if root is None:
            return None
        for n in root.iter("node"):
            t, d = n.get("text", ""), n.get("content-desc", "")
            for q in candidates:
                if self._match(t, q, False) or self._match(d, q, False):
                    c = self._node_center(n)
                    if c:
                        return c
        return None

    def _tap_find(self, serial, candidates, name="", settle=2.5, timeout=10) -> bool:
        """รอจนเจอ element (จาก candidates) แล้วแตะ. คืน False ถ้าไม่เจอในเวลา."""
        end = time.time() + timeout
        while time.time() < end:
            c = self._find_any(serial, candidates if isinstance(candidates, list) else [candidates])
            if c:
                self.log(f"[{self.TAG}] tap {name or candidates} → {c}")
                self._tap_xy(serial, *c)
                time.sleep(settle)
                return True
            time.sleep(1)
        self.log(f"[{self.TAG}] ⚠ ไม่พบปุ่ม {name or candidates} (timeout {timeout}s)")
        return False

    def _tap_first_video(self, serial, settle=2.0):
        """เลือกวิดีโอใหม่สุด — เซลล์แรกของกริดแกลเลอรี (พิกัด ratio ต่อแพลตฟอร์ม)."""
        rx, ry = self.FIRST_CELL
        self._tap_ratio(serial, rx, ry, name="first_video", settle=settle)

    def _tap_caption(self, serial, candidates, fallback=(0.5, 0.32), settle=1.5):
        """แตะช่อง caption — หาเจอจาก placeholder ก็แตะ, ไม่เจอใช้พิกัดสำรอง."""
        c = self._find_any(serial, candidates)
        if c:
            self.log(f"[{self.TAG}] tap caption → {c}")
            self._tap_xy(serial, *c)
        else:
            self.log(f"[{self.TAG}] ไม่พบช่อง caption — ใช้พิกัดสำรอง {fallback}")
            x, y = int(self._w * fallback[0]), int(self._h * fallback[1])
            self._tap_xy(serial, x, y)
        time.sleep(settle)

    # ── Caption ───────────────────────────────────────────────

    def _build_caption(self, product: dict) -> str:
        name  = (product.get("basic_info", {}) or {}).get("name", "")[:60]
        price = (product.get("basic_info", {}) or {}).get("price", "")
        comm  = (product.get("commission", {}) or {}).get("rate", "")
        link  = (product.get("links", {}) or {}).get("affiliate_link", "") or \
                (product.get("links", {}) or {}).get("product_url", "")
        templates = [t for t in (self.settings.get("caption_templates") or []) if t and t.strip()]
        if templates:
            tmpl = random.choice(templates)
        else:
            tmpl = self.settings.get("caption_template") or "{name} ราคา {price} บาท {link}"
        repl = {"{name}": name, "{price}": str(price), "{commission}": str(comm),
                "{link}": link, "{shop}": self.settings.get("shop_name", "")}
        cap = tmpl
        for k, v in repl.items():
            cap = cap.replace(k, v)
        return " ".join(cap.split()).strip()

    def _type_caption(self, serial: str, text: str, has_adbkb: bool):
        if has_adbkb:
            self.adb.type_unicode(serial, text)
        else:
            ascii_only = "".join(c for c in text if ord(c) < 128).strip()
            self.adb._adb("shell", "input", "text",
                          ascii_only.replace(" ", "%s"), serial=serial)
        time.sleep(1)

    # ── Push video ────────────────────────────────────────────

    def push_video(self, serial: str, video_path: Path) -> bool:
        cam = "/sdcard/DCIM/Camera"
        size_kb = video_path.stat().st_size // 1024
        self.log(f"[{self.TAG}] ส่งวิดีโอไปมือถือ ({size_kb}KB)...")

        # 1) ลบคลิปที่เราเคย push + ล้าง "ผี" ใน MediaStore (ลบไฟล์เฉย ๆ คลังภาพยังจำ thumbnail เก่า
        #    → คลิปเทสเก่าโผล่ดักหน้าตัวจริง) → scan path ที่เพิ่งลบ เพื่อให้ entry หายจริง
        self.adb._adb(
            "shell",
            f'for f in {cam}/vgap_*.mp4 {cam}/flow*.mp4; do '
            f'[ -e "$f" ] && rm -f "$f" && '
            f'am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$f" >/dev/null 2>&1; '
            f'done',
            serial=serial,
        )

        # 2) push ด้วยชื่อใหม่ไม่ซ้ำ → เป็นไฟล์ใหม่ของ MediaStore (date_added = ตอนนี้)
        remote = f"{cam}/vgap_{int(time.time() * 1000)}.mp4"
        ok, msg = self.adb._adb("push", str(video_path), remote, serial=serial, timeout=120)
        if not ok:
            self.log(f"[{self.TAG}] ส่งวิดีโอไม่สำเร็จ: {msg}")
            return False

        # 3) ตั้ง mtime = ตอนนี้ (adb push คง mtime เดิมของไฟล์ → ไม่งั้นไม่ใช่ตัวใหม่สุด)
        self.adb._adb("shell", "touch", remote, serial=serial)

        # 4) ให้คลังภาพรับรู้ไฟล์ใหม่
        self.adb._adb("shell", "am", "broadcast",
                      "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
                      "-d", f"file://{remote}", serial=serial)
        time.sleep(3)
        self.log(f"[{self.TAG}] ส่งวิดีโอสำเร็จ → {remote.split('/')[-1]} (ตัวใหม่สุดในคลัง) ✓")
        return True

    # ── Verify (Gemini Vision) ────────────────────────────────

    def _maybe_verify(self, serial: str):
        """คืนผลยืนยัน 3 สถานะ: True = สำเร็จ · False = ล้มเหลวจริง (retry) ·
        "unverified" = ยืนยันผลไม่ได้ (autopilot จะไม่ move เข้า DONE เงียบ)."""
        if not self.settings.get("verify_post", True):
            self.log(f"[{self.TAG}] เสร็จสิ้น flow ✓ (ปิดการยืนยันผล)")
            return True
        from services.post_verifier import verify_post
        res = verify_post(self.adb, serial, log=self.log, platform=self.TAG)
        status = res.get("status")
        if status == "failed":
            self.log(f"[{self.TAG}] ✗ ยืนยันแล้วว่าโพสต์ไม่สำเร็จ: {res['reason']}")
            return False
        if status == "unverified":
            self.log(f"[{self.TAG}] ⚠ ยืนยันผลไม่ได้ ({res['reason']}) — โพสต์อาจไม่ขึ้น โปรดตรวจเอง")
            return "unverified"
        self.log(f"[{self.TAG}] ✓ ยืนยันโพสต์สำเร็จ")
        return True

    # ── Orchestration (template method) ───────────────────────

    def _apply_coords_override(self, override: Optional[dict]):
        """รวมพิกัด override ต่อเครื่อง (per-instance) ทับ default R ของ poster.
        Additive: ไม่มี override → self.R = class R เดิมเป๊ะ. รับเฉพาะ key ที่มีใน
        default R + ค่า [rx,ry] เป็น float 0..1 (ตัวอื่นข้าม)."""
        base = getattr(type(self), "R", None)
        if not isinstance(base, dict) or not override:
            return
        merged = dict(base)
        for k, v in override.items():
            if k not in base:
                continue
            # รับ 2 shape: [rx,ry] (array/tuple) หรือ {rx,ry} (object) — เผื่อ config เก่า/ใหม่ปน
            if isinstance(v, dict):
                rxv, ryv = v.get("rx"), v.get("ry")
            elif isinstance(v, (list, tuple)) and len(v) == 2:
                rxv, ryv = v[0], v[1]
            else:
                continue
            try:
                rx, ry = float(rxv), float(ryv)
            except (TypeError, ValueError):
                continue
            if 0.0 <= rx <= 1.0 and 0.0 <= ry <= 1.0:
                merged[k] = (rx, ry)
        self.R = merged   # instance attr — ไม่แตะ class R (เครื่องอื่นไม่กระทบ)

    def process(self, serial: str, video_path: Path, product: dict,
                dry_run: bool = False, coords_override: Optional[dict] = None) -> bool:
        if not self.PACKAGE:
            self.log(f"[{self.TAG}] ยังไม่ได้กำหนดแอปปลายทาง — ข้าม")
            return None
        self._apply_coords_override(coords_override)
        if not self.push_video(serial, video_path):
            return False
        time.sleep(2)

        caption = self._build_caption(product)
        self._product = product   # ให้ _run_flow เข้าถึงข้อมูลสินค้า (เช่น ลิงก์ตะกร้า)
        self._w, self._h = self._get_resolution(serial)
        self.log(f"[{self.TAG}] Resolution: {self._w}x{self._h}")

        original_ime = self.adb.get_default_ime(serial)
        has_adbkb = self.adb.has_adb_keyboard(serial)
        if has_adbkb:
            self.adb._adb("shell", "ime", "enable", self.adb.ADB_IME, serial=serial)
            self.adb.set_ime(serial, self.adb.ADB_IME)
            time.sleep(0.5)

        self._scrcpy = None
        if self.USE_SCRCPY:
            from services.adb.scrcpy_control import ScrcpyControl
            self._scrcpy = ScrcpyControl(serial, self._w, self._h, log=self.log)
            if not self._scrcpy.start():
                self.log(f"[{self.TAG}] ⚠ scrcpy ใช้ไม่ได้ — caption อาจไม่ติด (ใช้ adb tap แทน)")
                self._scrcpy = None

        try:
            ok = self._run_flow(serial, video_path, caption, has_adbkb, dry_run)
            if ok and not dry_run:
                ok = self._maybe_verify(serial)
            return ok
        finally:
            if self._scrcpy:
                self._scrcpy.stop()
                self._scrcpy = None
            if has_adbkb and original_ime and "adbkeyboard" not in original_ime.lower():
                self.adb.set_ime(serial, original_ime)

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run) -> bool:
        raise NotImplementedError
