"""
Verify a Shopee post actually succeeded by looking at the phone screen with
Gemini Vision — closes the silent-failure gap (A1.3b).

Why this exists: autoposter taps "post" then returns; if the upload failed or a
warning popped up, the system would wrongly mark the job posted. Unattended, no
one would notice. This reads the screen and confirms.

CONSERVATIVE BY DESIGN: returns verified=False only when the model is CONFIDENT
the post FAILED. When uncertain, no key, or the check itself errors → verified=True.
Reason: re-posting risks a DUPLICATE (spam → ban), which is worse than a missed
retry. We'd rather miss a rare real failure than double-post.
"""
import json

VERIFY_PROMPT = (
    "นี่คือภาพหน้าจอมือถือหลังกดปุ่ม 'โพสต์' วิดีโอในแอป Shopee "
    "ช่วยดูว่าการโพสต์สำเร็จหรือไม่ แล้วตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น:\n"
    '{"status":"success|failed|unknown","reason":"เหตุผลสั้นๆ"}\n'
    "- success = โพสต์เสร็จแล้ว (กลับมาหน้าฟีด/โปรไฟล์ หรือมีข้อความว่าสำเร็จ)\n"
    "- failed = ขึ้น error / ป๊อปอัปเตือน / ยังค้างหน้าโพสต์ / อัปโหลดไม่สำเร็จ\n"
    "- unknown = ดูไม่ออกว่าผลเป็นอย่างไร"
)


def verify_post(adb, serial: str, google_key: str,
                model: str = "gemini-2.0-flash", log=print) -> dict:
    """Return {'verified': bool, 'status': str, 'reason': str}.
    verified=False ⇒ เรามั่นใจว่าโพสต์ 'ไม่สำเร็จ' (ให้ retry); อื่นๆ ถือว่าสำเร็จ."""
    if not google_key:
        log("[VERIFY] ไม่มี Gemini key — ข้ามการยืนยัน (ถือว่าสำเร็จ)")
        return {"verified": True, "status": "unknown", "reason": "no key"}
    try:
        img = adb.fast_screenshot(serial)
        if not img:
            log("[VERIFY] ถ่ายจอไม่ได้ — ข้าม (ถือว่าสำเร็จ)")
            return {"verified": True, "status": "unknown", "reason": "no screenshot"}

        from google import genai
        from google.genai import types
        client = genai.Client(api_key=google_key)
        resp = client.models.generate_content(
            model=model,
            contents=[types.Part.from_bytes(data=img, mime_type="image/jpeg"),
                      VERIFY_PROMPT],
        )
        data = _parse_json(resp.text or "")
        status = (data.get("status") or "unknown").lower()
        reason = data.get("reason", "")
        verified = status != "failed"          # conservative
        tokens = 0
        try:
            tokens = int(getattr(resp.usage_metadata, "total_token_count", 0) or 0)
        except Exception:
            pass
        log(f"[VERIFY] ผล: {status} — {reason}")
        return {"verified": verified, "status": status, "reason": reason, "tokens": tokens}
    except Exception as e:
        log(f"[VERIFY] ยืนยันไม่สำเร็จ ({e}) — ถือว่าสำเร็จไว้ก่อน")
        return {"verified": True, "status": "unknown", "reason": str(e), "tokens": 0}


def _parse_json(raw: str) -> dict:
    """Pull the first {...} object out of the model's reply (handles ```json fences)."""
    raw = (raw or "").strip()
    i, j = raw.find("{"), raw.rfind("}")
    if i == -1 or j == -1 or j < i:
        return {}
    try:
        return json.loads(raw[i:j + 1])
    except Exception:
        return {}
