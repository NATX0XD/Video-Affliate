"""
Post verifier — logic-based via ADB uiautomator dump.
ไม่ใช้ AI/API ใดทั้งสิ้น — parse UI tree แล้วหา keyword แทน

สามสถานะผลลัพธ์ (status):
    success     = พบ indicator ว่าสำเร็จ  → verified=True
    failed      = พบ indicator ว่าล้มเหลว → verified=False (ให้ retry)
    unverified  = ยืนยันไม่ได้ (dump/pull/exception — ไม่ได้หลักฐานมาเช็ค)
                  → verified=False แต่ "แยกจาก failed": autopilot ไม่ move เข้า DONE
                    เงียบ และไม่ retry อัตโนมัติ (กัน double-post) — ให้ user ตรวจเอง
    unknown     = ได้หลักฐานมาแต่ไม่พบ indicator ชัดเจน → verified=True (conservative:
                  ถือว่าสำเร็จ เพื่อกันโพสต์ซ้ำ ซึ่งเสี่ยงโดนแบนกว่า retry พลาด)
"""
import os
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET

# ★ /data/local/tmp ไม่ใช่ /sdcard — Android รุ่นใหม่ (เจอบน Android 16) shell เขียน /sdcard ไม่ได้
#   dump รายงานว่าสำเร็จ แต่ไฟล์ไม่เกิดจริง แล้ว pull ฟ้อง "No such file or directory"
#   ผลคือโพสต์ขึ้นแล้วแต่ระบบรายงาน unverified ทุกครั้ง (ui_finder ย้ายไปพาธนี้ตั้งแต่แรกแล้ว)
UI_REMOTE = "/data/local/tmp/vgap_ui_verify.xml"

from services.adb.adb_path import adb_bin

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

    status: success | failed | unverified | unknown (ดูหัวไฟล์)
    verified=True  → success/unknown (ถือว่าสำเร็จ)
    verified=False → failed (ให้ retry) หรือ unverified (ยืนยันไม่ได้ — ห้ามเงียบ)
    """
    try:
        ok, msg = adb._adb(
            "shell", "uiautomator", "dump", UI_REMOTE,
            serial=serial, timeout=15,
        )
        # uiautomator คืน exit code 0 แม้พิมพ์ "ERROR: could not get idle state." ออกมา
        # เชื่อ exit code อย่างเดียวจะไหลไป pull ไฟล์ที่ไม่เคยถูกสร้าง แล้วรายงานสาเหตุผิด
        # ("pull failed: No such file" ทั้งที่ตัวปัญหาคือ dump ไม่ผ่านตั้งแต่แรก)
        # เช็คแค่คำว่า ERROR — ไม่บังคับว่าต้องมี "dumped" เพราะบาง build ไม่พิมพ์อะไรเลยตอนสำเร็จ
        if not ok or "ERROR" in (msg or ""):
            reason = " ".join((msg or "").split())[:120] or "ไม่มีข้อความตอบกลับ"
            log(f"[VERIFY] อ่านหน้าจอไม่ได้ ({reason}) — ยืนยันผลไม่ได้ "
                f"(หน้าที่เล่นวิดีโออยู่ dump ไม่ผ่านเป็นปกติ)")
            return {"verified": False, "status": "unverified", "reason": f"dump failed: {reason}"}

        # host temp path — ข้ามแพลตฟอร์ม (Windows ไม่มี /tmp) + แยกตาม serial กัน race หลายเครื่อง
        local_xml = os.path.join(tempfile.gettempdir(), f"vgap_ui_verify_{serial}.xml")
        # pull พลาดครั้งเดียวไม่ใช่คำตอบสุดท้าย — เครื่องกำลังอัปโหลด/สลับ activity อยู่
        # (เจอจริง 2026-08-22: โพสต์ขึ้นแล้วแต่ pull รอบแรกล้ม → รายงาน unverified
        #  ลองซ้ำทีหลังผ่านปกติ และ stderr ตัวจริงถูกทิ้งไปจนหาสาเหตุไม่ได้)
        err = ""
        for attempt in range(1, 4):
            r = subprocess.run(
                [adb_bin(log), "-s", serial, "pull", UI_REMOTE, local_xml],
                capture_output=True, timeout=12,
            )
            if r.returncode == 0:
                break
            err = (r.stderr or b"").decode("utf-8", "ignore").strip() \
                or (r.stdout or b"").decode("utf-8", "ignore").strip() \
                or f"rc={r.returncode}"
            log(f"[VERIFY] pull ล้มเหลว (รอบ {attempt}/3): {err}")
            time.sleep(1.5)
        else:
            return {"verified": False, "status": "unverified",
                    "reason": f"pull failed: {err}"}

        ui_text = _extract_ui_text(local_xml)

        for kw in _FAIL_KW:
            if kw in ui_text:
                log(f"[VERIFY] ✗ พบ failure indicator: '{kw}'")
                return {"verified": False, "status": "failed", "reason": f"พบข้อความ: {kw}"}

        for kw in _SUCCESS_KW:
            if kw in ui_text:
                log(f"[VERIFY] ✓ พบ success indicator: '{kw}'")
                return {"verified": True, "status": "success", "reason": f"พบข้อความ: {kw}"}

        log("[VERIFY] ไม่พบ indicator ชัดเจน — ถือว่าสำเร็จ (conservative)")
        return {"verified": True, "status": "unknown", "reason": "ไม่พบ indicator"}

    except Exception as e:
        log(f"[VERIFY] ยืนยันไม่สำเร็จ ({e}) — ยืนยันผลไม่ได้")
        return {"verified": False, "status": "unverified", "reason": str(e)}


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
