import time
from pathlib import Path

from services.adb.base_poster import BasePoster


class AutoPoster(BasePoster):
    """โพสต์วิดีโอขึ้น Shopee Video (luckyvideo PublishVideoActivity).

    หมายเหตุเครื่องคลาสนี้ (Samsung / Android 16):
    - หน้า Shopee Video ไม่เปิด UI Automator nodes (dump คืนค่าเก่า) → flow ใช้
      พิกัดอัตราส่วน (ratio) ที่จับจากเครื่องจริง 1080x2340 แล้วสเกลตามจอ
    - caption ไทยต้องใช้ ADBKeyboard (input text / clipboard ไม่ติด) ดู manager
    """
    PACKAGE = "com.shopee.th"
    TAG = "POST"
    USE_SCRCPY = True   # จำเป็นเพื่อโฟกัสช่อง caption ของ Shopee

    # Ratio coordinates (x/W, y/H) จากเครื่องจริง 1080x2340 — sync กับ UI Shopee Video
    R = {
        "live_video_tab": (0.500, 0.932),
        "plus_button":    (0.940, 0.072),
        "gallery":        (0.798, 0.790),
        "video_filter":   (0.500, 0.135),
        "first_video":    (0.125, 0.205),
        "next_1":         (0.885, 0.906),
        "next_2":         (0.861, 0.881),
        "caption_field":  (0.444, 0.123),
        # ── เพิ่มสินค้าผ่านลิงก์ (หน้า publish + picker + กรอกลิงก์) ──
        # พิกัด toggle/ปุ่มหน้า publish วัดจากเครื่องจริง (เลย์เอาต์ 4 toggle:
        # Duet/บันทึก/ป้าย AI/แชร์ FB) — ทำ "ป้าย AI" + "เพิ่มสินค้า" ตอน caption ยังว่าง
        "add_product":    (0.756, 0.323),  # ปุ่มส้ม "แตะเพื่อเพิ่มสินค้า" (แถวบนสุด ไม่ขยับตาม toggle)
        "link_icon":      (0.927, 0.066),  # ไอคอนลิงก์มุมขวาบน (หน้า picker เลือกสินค้า)
        "link_field":     (0.500, 0.247),  # ช่อง EditText "ลิงก์สินค้า"
        "import_btn":     (0.530, 0.406),  # ปุ่ม "นำเข้า" (เปลี่ยนจาก "วางลิงก์" เมื่อมีข้อความ)
        "select_all":     (0.201, 0.869),  # "เลือกทั้งหมด" แถบล่าง
        "add_confirm":    (0.646, 0.868),  # ปุ่ม "เพิ่ม" แถบล่าง (ยืนยันเพิ่มสินค้า)
        # ── toggle หน้า publish (Duet=0.392/บันทึก=0.467 ห้ามแตะ ยกเว้น Duet ที่ต้องปิด) ──
        "duet_toggle":    (0.878, 0.392),  # "อนุญาตให้ใช้ซ้ำ/Duet" — เปิด ON เองดีฟอลต์ ต้องแตะให้ปิด
        "ai_label":       (0.878, 0.575),  # "ครีเอเตอร์เพิ่มป้ายกำกับ AI" — toggle ที่ต้องเปิด
        "caption_ok":     (0.905, 0.063),  # ปุ่ม "ตกลง" มุมขวาบน (ยืนยันแคปชั่น)
        "post_button":    (0.500, 0.900),  # ปุ่ม "โพสต์" ส้มแถบล่าง
    }

    def _tap_r(self, serial: str, key: str, settle: float = 2.0):
        rx, ry = self.R[key]
        self._tap_ratio(serial, rx, ry, name=key, settle=settle)

    def _caption_without_link(self, caption: str) -> str:
        """Shopee แนบลิงก์ผ่านการ์ดสินค้าแล้ว → ตัดลิงก์ออกจาก caption ไม่ให้ซ้ำ/รก."""
        link = self._affiliate_link()
        if not link:
            return caption
        c = caption.replace("#" + link, "").replace(link, "")
        return " ".join(c.split()).strip()

    def _affiliate_link(self) -> str:
        """ลิงก์ตะกร้า/สินค้าสำหรับแนบในโพสต์ (จากข้อมูลสินค้า)."""
        p = getattr(self, "_product", {}) or {}
        links = p.get("links", {}) or {}
        return (links.get("affiliate_link") or links.get("product_url")
                or p.get("link") or p.get("cart_link") or "").strip()

    def _add_product_by_link(self, serial, has_adbkb) -> bool:
        """เพิ่มสินค้าเข้าโพสต์ผ่านลิงก์ Shopee (โชว์ในวิดีโอ). คืน True ถ้าเพิ่มสำเร็จ."""
        link = self._affiliate_link()
        if not link:
            self.log("[POST] ไม่มีลิงก์สินค้า — ข้ามการเพิ่มสินค้า")
            return False

        self.log(f"[POST] เพิ่มสินค้าผ่านลิงก์: {link}")
        # หน้า publish → เปิด picker เลือกสินค้า
        self._tap_r(serial, "add_product", settle=2.5)
        # picker → ไอคอนลิงก์มุมขวาบน → หน้า "กรอกลิงก์สินค้า"
        self._tap_r(serial, "link_icon", settle=2.0)
        # แตะช่องกรอก → พิมพ์ลิงก์ (ADBKeyboard)
        self._tap_r(serial, "link_field", settle=1.0)
        self._type_caption(serial, link, has_adbkb)
        time.sleep(1.5)
        # "นำเข้า" → resolve สินค้าเข้า "รายการสินค้า"
        self._tap_r(serial, "import_btn", settle=4.0)
        # เลือกทั้งหมด → เพิ่ม
        self._tap_r(serial, "select_all", settle=1.2)
        self._tap_r(serial, "add_confirm", settle=3.5)

        # ยืนยันว่ากลับถึงหน้า publish
        for _ in range(3):
            act = self._current_activity(serial)
            if act.endswith("PublishVideoActivity"):
                self.log("[POST] เพิ่มสินค้าสำเร็จ — กลับหน้าโพสต์ ✓")
                return True
            time.sleep(1.5)
        self.log("[POST] ⚠ หลังเพิ่มสินค้าไม่กลับหน้าโพสต์ (flow อาจคลาด)")
        return False

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        # 1. เปิด Shopee สะอาด ๆ
        self._open_app(serial, wait=6)

        # 2. แท็บ Live & Video
        self.log("[POST] เปิดแท็บ Live & Video...")
        self._tap_r(serial, "live_video_tab", settle=4)

        # 3. กด + สร้าง
        self.log("[POST] กด + สร้างวิดีโอ...")
        self._tap_r(serial, "plus_button", settle=4)

        # 4. เปิดคลังภาพ
        self.log("[POST] เปิดคลังภาพ...")
        self._tap_r(serial, "gallery", settle=3)

        # 5. กรองวิดีโอ + เลือกอันล่าสุด
        self.log("[POST] กรองเฉพาะวิดีโอ + เลือกอันล่าสุด...")
        self._tap_r(serial, "video_filter", settle=2)
        self._tap_r(serial, "first_video", settle=2)

        # 6. ถัดไป (เลือก) → ถัดไป (editor)
        self._tap_r(serial, "next_1", settle=4)
        self._tap_r(serial, "next_2", settle=4)

        # 7. ถึงหน้า publish — กัน preview ค้างทับ (กด back กลับ)
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

        # สำคัญ: หน้า publish อ่าน uiautomator ไม่ได้ (preview เล่นตลอด ไม่ idle) → blind ratio
        # ทุกตัวต้องแตะตอน caption ยังว่าง + ก่อนการ์ดสินค้าขึ้น ไม่งั้นเลย์เอาต์เลื่อนแล้วพลาด
        # ลำดับ: ป้าย AI (toggle ตัวที่ 3 นิ่ง) → เพิ่มสินค้า (แถวบนสุดไม่ขยับ) → caption ท้ายสุด

        # 8. เปิดป้ายกำกับ AI (ครีเอเตอร์แจ้งเนื้อหาสร้างด้วย AI)
        self.log("[POST] เปิดป้ายกำกับ AI...")
        self._tap_r(serial, "ai_label", settle=1.2)

        # 8.5 ปิด Duet (อนุญาตให้ใช้ซ้ำ — เปิด ON เองดีฟอลต์ ต้องการให้ปิด)
        self.log("[POST] ปิด Duet (อนุญาตให้ใช้ซ้ำ)...")
        self._tap_r(serial, "duet_toggle", settle=1.2)

        # 9. เพิ่มสินค้าผ่านลิงก์ตะกร้า (โชว์สินค้าในวิดีโอ)
        self._add_product_by_link(serial, has_adbkb)

        # 10. caption (พิมพ์ท้ายสุด — ความยาวไม่กระทบการแตะอื่นแล้ว)
        #     ตัดลิงก์ออก เพราะแนบผ่านการ์ดสินค้าแล้ว
        self.log("[POST] ใส่ caption...")
        self._tap_r(serial, "caption_field", settle=1.5)
        self._type_caption(serial, self._caption_without_link(caption), has_adbkb)

        # 10.5 กด "ตกลง" ยืนยันแคปชั่น
        self.log("[POST] กดตกลง ยืนยันแคปชั่น...")
        self._tap_r(serial, "caption_ok", settle=1.5)

        if dry_run:
            self.log("[POST] DRY RUN — ป้าย AI + ปิด Duet + สินค้า + caption(ตกลง) แล้ว หยุดก่อนกดโพสต์ ✓")
            return True

        # 11. โพสต์
        self.log("[POST] กดโพสต์...")
        self._tap_r(serial, "post_button", settle=5)
        return True
