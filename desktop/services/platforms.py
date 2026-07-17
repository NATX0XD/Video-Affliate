"""
Multi-platform poster registry — desktop โพสต์คลิป 1 อันไปได้หลายแพลตฟอร์ม.

โครง plugin: แต่ละแพลตฟอร์มมี poster (สืบทอด BasePoster) interface เดียวกัน
    process(serial, video_path, product, dry_run=False) -> bool | None
      True  = โพสต์สำเร็จ · False = โพสต์ไม่สำเร็จ · None = ข้าม (ไม่มี poster)

ready = เปิดให้เลือก/โพสต์ได้ · tuned = จูน flow กับเครื่องจริงแล้ว (Shopee=แล้ว,
ที่เหลือ flow ตั้งต้น text-based ต้องจูน candidates/พิกัดกับแอปจริงครั้งแรก)
"""
from services.adb.autoposter import AutoPoster
from services.adb.platform_posters import (
    TikTokPoster, ReelsPoster, InstagramPoster, YouTubePoster,
)

PLATFORMS = {
    "shopee":    {"label": "Shopee Video",    "package": "com.shopee.th",              "ready": True, "tuned": True},
    "tiktok":    {"label": "TikTok",          "package": "com.ss.android.ugc.trill",   "ready": True, "tuned": False},
    "reels":     {"label": "Facebook Reels",  "package": "com.facebook.katana",        "ready": True, "tuned": False},
    "instagram": {"label": "Instagram Reels", "package": "com.instagram.android",      "ready": True, "tuned": False},
    "youtube":   {"label": "YouTube Shorts",  "package": "com.google.android.youtube", "ready": True, "tuned": False},
}

POSTERS = {
    "shopee":    AutoPoster,
    "tiktok":    TikTokPoster,
    "reels":     ReelsPoster,
    "instagram": InstagramPoster,
    "youtube":   YouTubePoster,
}


class StubPoster:
    """ไม่มี poster สำหรับ key นี้ — ข้าม (ไม่นับว่าพลาด)."""
    def __init__(self, key, adb, log, settings):
        self.key = key
        self.log = log or print

    def process(self, serial, video_path, product, dry_run=False):
        self.log(f"[{self.key.upper()}] ไม่มีตัวโพสต์สำหรับแพลตฟอร์มนี้ — ข้าม")
        return None


def make_poster(key, adb, log, settings):
    """สร้าง poster ของแพลตฟอร์ม."""
    cls = POSTERS.get(key)
    if cls:
        return cls(adb, log_cb=log, settings=settings)
    return StubPoster(key, adb, log, settings)


def ready_enabled(settings) -> list:
    """แพลตฟอร์มที่ผู้ใช้เลือก + พร้อมโพสต์จริง (ว่าง = ยังไม่เลือก → ไม่โพสต์)."""
    raw = settings.get("platforms") or []
    return [p for p in raw if PLATFORMS.get(p, {}).get("ready")]
