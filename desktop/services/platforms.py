"""
Multi-platform poster registry — desktop โพสต์คลิป 1 อันไปได้หลายแพลตฟอร์ม.

โครง plugin: แต่ละแพลตฟอร์มมี poster ที่ทำตาม interface เดียวกัน
    process(serial, video_path, product, dry_run=False) -> bool | None
      True  = โพสต์สำเร็จ
      False = โพสต์ไม่สำเร็จ
      None  = ข้าม (แพลตฟอร์มยังไม่พร้อม)

ready=True = มี flow โพสต์จริงแล้ว · ready=False = โครงไว้ ต้องจูนพิกัดกับเครื่องจริง
"""
from services.adb.autoposter import AutoPoster

PLATFORMS = {
    "shopee":    {"label": "Shopee Video",    "package": "com.shopee.th",        "ready": True},
    "tiktok":    {"label": "TikTok",          "package": "com.ss.android.ugc.trill", "ready": False},
    "reels":     {"label": "Facebook Reels",  "package": "com.facebook.katana",  "ready": False},
    "instagram": {"label": "Instagram Reels", "package": "com.instagram.android", "ready": False},
    "youtube":   {"label": "YouTube Shorts",  "package": "com.google.android.youtube", "ready": False},
}


class StubPoster:
    """แพลตฟอร์มที่ยังไม่ได้ทำ flow โพสต์ — โครงไว้ทำต่อ (จูนพิกัดกับเครื่องจริง)."""
    def __init__(self, key, adb, log, settings):
        self.key = key
        self.log = log or print

    def process(self, serial, video_path, product, dry_run=False):
        label = PLATFORMS.get(self.key, {}).get("label", self.key)
        self.log(f"[{self.key.upper()}] '{label}' ยังไม่รองรับการโพสต์ (อยู่ระหว่างพัฒนา) — ข้าม")
        return None   # ข้าม ไม่นับว่าพลาด


def make_poster(key, adb, log, settings):
    """สร้าง poster ของแพลตฟอร์ม."""
    if key == "shopee":
        return AutoPoster(adb, log_cb=log, settings=settings)
    return StubPoster(key, adb, log, settings)


def ready_enabled(settings) -> list:
    """แพลตฟอร์มที่ผู้ใช้เปิด + พร้อมโพสต์จริง (ถ้าไม่มีเลย → shopee เป็นค่าเริ่ม)."""
    raw = settings.get("platforms") or ["shopee"]
    ready = [p for p in raw if PLATFORMS.get(p, {}).get("ready")]
    return ready or ["shopee"]
