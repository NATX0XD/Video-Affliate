"""
Post verifier — logic-based via ADB uiautomator dump.
ไม่ใช้ AI/API ใดทั้งสิ้น — parse UI tree แล้วหา keyword แทน

CONSERVATIVE BY DESIGN: verified=False เฉพาะตอนมั่นใจว่าล้มเหลว
เหตุผล: โพสต์ซ้ำ (duplicate) เสี่ยงโดนแบน ร้ายกว่า retry พลาด
"""
import os
import subprocess
import tempfile
import xml.etree.ElementTree as ET

# ── Keyword banks ────────────────────────────────────────────────────────────

_FAIL_KW = [
    # ไทย
    "ล้มเหลว", "ไม่สำเร็จ", "เกิดข้อผิดพลาด", "ข้อผิดพลาด",
    "ลองอีกครั้ง", "ลองใหม่", "อัปโหลดล้มเหลว",
    # English
    "upload failed", "network error", "connection error",
    "something went wrong", "couldn't share", "couldn't post",
    "please try again", "error occurred", "post failed",
]

_SUCCESS_KW = [
    # ไทย
    "โพสต์แล้ว", "เผยแพร่แล้ว", "อัปโหลดสำเร็จ", "โพสต์เสร็จสิ้น",
    # English
    "your video is live", "upload complete", "successfully posted",
    "video posted", "reel shared", "short uploaded",
]

# ── Main ─────────────────────────────────────────────────────────────────────

def verify_post(adb, serial: str, log=print, platform: str = "", **_) -> dict:
    """Return {'verified': bool, 'status': str, 'reason': str}.

    verified=False → มั่นใจว่าล้มเหลว (ให้ retry)
    verified=True  → สำเร็จ หรือ ไม่แน่ใจ (conservative)
    """
    try:
        ok, msg = adb._adb(
            "shell", "uiautomator", "dump", "/sdcard/ui_verify.xml",
            serial=serial, timeout=15,
        )
        if not ok:
            log(f"[VERIFY] uiautomator dump ล้มเหลว ({msg}) — ข้าม (ถือว่าสำเร็จ)")
            return {"verified": True, "status": "unknown", "reason": "dump failed"}

        # host temp path — ข้ามแพลตฟอร์ม (Windows ไม่มี /tmp) + แยกตาม serial กัน race หลายเครื่อง
        local_xml = os.path.join(tempfile.gettempdir(), f"vgap_ui_verify_{serial}.xml")
        r = subprocess.run(
            ["adb", "-s", serial, "pull", "/sdcard/ui_verify.xml", local_xml],
            capture_output=True, timeout=12,
        )
        if r.returncode != 0:
            log("[VERIFY] pull ล้มเหลว — ข้าม (ถือว่าสำเร็จ)")
            return {"verified": True, "status": "unknown", "reason": "pull failed"}

        ui_text = _extract_ui_text(local_xml)

        for kw in _FAIL_KW:
            if kw in ui_text:
                log(f"[VERIFY] ✗ พบ failure indicator: '{kw}'")
                return {"verified": False, "status": "failed", "reason": f"พบข้อความ: {kw}"}

        for kw in _SUCCESS_KW:
            if kw in ui_text:
                log(f"[VERIFY] ✓ พบ success indicator: '{kw}'")
                return {"verified": True, "status": "success", "reason": f"พบข้อความ: {kw}"}

        log("[VERIFY] ไม่พบ indicator ชัดเจน — ถือว่าสำเร็จ")
        return {"verified": True, "status": "unknown", "reason": "ไม่พบ indicator"}

    except Exception as e:
        log(f"[VERIFY] ยืนยันไม่สำเร็จ ({e}) — ถือว่าสำเร็จไว้ก่อน")
        return {"verified": True, "status": "unknown", "reason": str(e)}


def _extract_ui_text(path: str) -> str:
    """ดึง text + content-desc ทุก node จาก uiautomator XML."""
    try:
        tree = ET.parse(path)
        parts = []
        for node in tree.iter():
            for attr in ("text", "content-desc"):
                val = node.get(attr, "")
                if val:
                    parts.append(val.lower())
        return " ".join(parts)
    except Exception:
        return ""
