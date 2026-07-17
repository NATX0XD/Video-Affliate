"""
Posters ของแพลตฟอร์มโซเชียล — TikTok / Facebook Reels / Instagram / YouTube.

ต่างจาก Shopee: แอปเหล่านี้ "เปิด UI Automator nodes" ได้ → flow ใช้การหาปุ่ม
จาก text/content-desc (ทนต่อความละเอียดจอ + ภาษา TH/EN) แทน blind coordinates.

⚠️ FLOW ตั้งต้น — ปุ่ม/ข้อความอิงเวอร์ชันแอปทั่วไป (TH/EN). เวอร์ชันจริงอาจต่าง
ต้องจูน candidates/พิกัดสำรอง (FIRST_CELL, caption fallback) กับเครื่องจริงครั้งแรก.
ทุกสเตปมี log ละเอียดเพื่อให้จูนง่าย; หาไม่เจอ → หยุดก่อนโพสต์ (ไม่มั่ว).
"""
from services.adb.base_poster import BasePoster


class TikTokPoster(BasePoster):
    PACKAGE = "com.ss.android.ugc.trill"
    TAG = "TIKTOK"
    FIRST_CELL = (0.16, 0.30)

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        self._open_app(serial, wait=7)
        # + สร้าง (ปุ่มกลางล่าง)
        if not self._tap_find(serial, ["Create", "สร้าง", "ถ่าย"], name="create",
                              settle=4, timeout=12):
            self._tap_ratio(serial, 0.5, 0.95, name="create(fallback)", settle=4)
        # อัปโหลด (จากแกลเลอรี)
        if not self._tap_find(serial, ["Upload", "อัปโหลด"], name="upload", settle=3):
            return False
        # เลือกวิดีโอใหม่สุด
        self._tap_first_video(serial, settle=2)
        # ถัดไป (เลือก → ตัด → โพสต์) อาจมี 2 ครั้ง
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-1", settle=4)
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-2", settle=4, timeout=6)
        # caption
        self.log("[TIKTOK] ใส่ caption...")
        self._tap_caption(serial, ["Add caption", "เพิ่มคำบรรยาย", "บรรยาย", "Describe"])
        self._type_caption(serial, caption, has_adbkb)
        if dry_run:
            self.log("[TIKTOK] DRY RUN — พิมพ์ caption แล้ว หยุดก่อนโพสต์ ✓")
            return True
        # โพสต์
        if not self._tap_find(serial, ["Post", "โพสต์"], name="post", settle=5):
            return False
        return True


class ReelsPoster(BasePoster):
    PACKAGE = "com.facebook.katana"
    TAG = "REELS"
    FIRST_CELL = (0.16, 0.32)

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        self._open_app(serial, wait=8)
        # เข้าสร้าง Reel
        if not self._tap_find(serial, ["Reels", "รีล"], name="reels-tab", settle=4, timeout=12):
            self.log("[REELS] ไม่พบแท็บ Reels — ลองปุ่มสร้าง")
        self._tap_find(serial, ["Create", "สร้าง", "Add reel", "สร้างรีล"], name="create", settle=4, timeout=8)
        # เลือกวิดีโอใหม่สุด
        self._tap_first_video(serial, settle=2)
        # ถัดไป x2
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-1", settle=4)
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-2", settle=4, timeout=6)
        # caption
        self.log("[REELS] ใส่ caption...")
        self._tap_caption(serial, ["Describe your reel", "อธิบายรีล", "Say something", "เขียน"])
        self._type_caption(serial, caption, has_adbkb)
        if dry_run:
            self.log("[REELS] DRY RUN — พิมพ์ caption แล้ว หยุดก่อนแชร์ ✓")
            return True
        # แชร์
        if not self._tap_find(serial, ["Share now", "Share", "แชร์เลย", "แชร์"], name="share", settle=5):
            return False
        return True


class InstagramPoster(BasePoster):
    PACKAGE = "com.instagram.android"
    TAG = "IG"
    FIRST_CELL = (0.16, 0.55)   # IG grid อยู่ครึ่งล่าง (ครึ่งบนเป็น preview)

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        self._open_app(serial, wait=7)
        # + สร้างโพสต์
        if not self._tap_find(serial, ["New post", "Create", "สร้าง"], name="create",
                              settle=4, timeout=12):
            self._tap_ratio(serial, 0.5, 0.95, name="create(fallback)", settle=4)
        # เลือกแท็บ REEL
        self._tap_find(serial, ["Reel", "รีล"], name="reel-tab", settle=3, timeout=6)
        # เลือกวิดีโอใหม่สุด
        self._tap_first_video(serial, settle=2)
        # Next x2 (edit → caption)
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-1", settle=4)
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-2", settle=4, timeout=6)
        # caption
        self.log("[IG] ใส่ caption...")
        self._tap_caption(serial, ["Write a caption", "เขียนคำบรรยาย", "Add a caption", "คำบรรยาย"])
        self._type_caption(serial, caption, has_adbkb)
        if dry_run:
            self.log("[IG] DRY RUN — พิมพ์ caption แล้ว หยุดก่อนแชร์ ✓")
            return True
        # Share
        if not self._tap_find(serial, ["Share", "แชร์"], name="share", settle=5):
            return False
        return True


class YouTubePoster(BasePoster):
    PACKAGE = "com.google.android.youtube"
    TAG = "YT"
    FIRST_CELL = (0.16, 0.30)

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        self._open_app(serial, wait=7)
        # + สร้าง
        if not self._tap_find(serial, ["Create", "สร้าง"], name="create", settle=4, timeout=12):
            self._tap_ratio(serial, 0.5, 0.93, name="create(fallback)", settle=4)
        # สร้าง Short
        self._tap_find(serial, ["Create a Short", "Short", "สร้าง Short", "ช็อต"],
                       name="short", settle=4, timeout=8)
        # เปิดแกลเลอรี (ไอคอนซ้ายล่าง) แล้วเลือกวิดีโอใหม่สุด
        self._tap_ratio(serial, 0.10, 0.92, name="gallery", settle=3)
        self._tap_first_video(serial, settle=2)
        # Next / Done x2 (trim → details)
        self._tap_find(serial, ["Next", "Done", "ถัดไป", "เสร็จ"], name="next-1", settle=4)
        self._tap_find(serial, ["Next", "ถัดไป"], name="next-2", settle=4, timeout=6)
        # caption = ชื่อ Short
        self.log("[YT] ใส่ caption (ชื่อ Short)...")
        self._tap_caption(serial, ["Add a title", "เพิ่มชื่อ", "Title", "ชื่อ"])
        self._type_caption(serial, caption, has_adbkb)
        if dry_run:
            self.log("[YT] DRY RUN — พิมพ์ caption แล้ว หยุดก่อนอัปโหลด ✓")
            return True
        # อัปโหลด
        if not self._tap_find(serial, ["Upload Short", "Upload", "อัปโหลด"], name="upload", settle=5):
            return False
        return True
