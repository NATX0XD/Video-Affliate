"""
Flow prompt builder — บริดจ์ชั่วคราว (P-cleanup).

desktop เขียน prompt ภาษาไทยให้ extension เอาไปป้อน Google Flow.
นี่คือส่วนเดียวที่เหลือจากซากโค้ดสร้างคลิป (video_generator เดิม) — เก็บไว้เป็น
ไฟล์เล็กๆ เพื่อให้ /api/flow/next ทำงานต่อได้ระหว่างที่ยังไม่ย้ายการเขียน prompt
ไปฝั่ง extension. เมื่อ extension เขียน prompt เองได้แล้ว ลบไฟล์นี้ + flow/next ทิ้ง.

ไม่มี Veo / generate_video — desktop ไม่เรนเดอร์คลิปเอง (Flow ทำในเบราว์เซอร์).
"""
import base64
from typing import Optional, Tuple, Callable

DEFAULT_PROMPT_MODEL = "gemini-2.0-flash"


def get_product_image(product: dict) -> Optional[Tuple[bytes, str]]:
    """คืน (image_bytes, mime) จากสินค้าที่ extension ดูดมา หรือ None."""
    # 1) base64 data URL ที่ extension จับมา
    for b64 in (product.get("images_b64") or []):
        if b64 and b64.startswith("data:"):
            try:
                header, data = b64.split(",", 1)
                mime = header.split(":")[1].split(";")[0] or "image/jpeg"
                return base64.b64decode(data), mime
            except Exception:
                continue
    # 2) โหลดจาก URL รูป
    for url in (product.get("images") or []):
        if url and url.startswith("http"):
            try:
                import httpx
                r = httpx.get(url, timeout=20, follow_redirects=True,
                              headers={"Referer": "https://shopee.co.th/"})
                if r.status_code == 200 and len(r.content) > 500:
                    mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
                    return r.content, mime
            except Exception:
                continue
    return None


def _gemini_flow_prompt(product: dict, settings: dict,
                        image_bytes: Optional[bytes], mime: Optional[str],
                        log: Callable) -> str:
    """ให้ Gemini เขียน prompt ภาษาไทยสำหรับ Flow (text→video 9:16, ช็อตเดียว 8 วิ)."""
    from google import genai
    from google.genai import types

    bi    = product.get("basic_info", {}) or {}
    name  = bi.get("name", "สินค้า Shopee")
    price = bi.get("price", "")
    sold  = bi.get("sold_count", "")
    bg    = settings.get("background", "สตูดิโอ")
    pers  = settings.get("personality", "สนุกสนาน")

    instruction = f"""คุณเป็นครีเอเตอร์คอนเทนต์สั้นไวรัล Shopee มือโปร เขียน prompt ภาษาไทย 1 ย่อหน้า
สั่งให้ Veo สร้างวิดีโอโฆษณา/รีวิว "ช็อตเดียวต่อเนื่อง 8 วินาที" ที่ "หยุดนิ้วคนเลื่อนฟีดได้ทันที" จากสินค้าในรูปที่แนบมา

สินค้า: {name}
ราคา: ฿{price}   ขายแล้ว: {sold}

หัวใจคือ "ว้าวภายใน 8 วินาที" — เขียน prompt ที่มี:
- ขึ้นต้น: "วิดีโอแนวตั้ง 9:16 ช็อตเดียวต่อเนื่อง 8 วินาที ไม่มีการตัดสลับฉาก คุณภาพระดับโฆษณา"
- HOOK ใน 1 วินาทีแรกที่สะดุดตา (เช่น คนโชว์สินค้าเข้ากล้องแบบมีพลัง / สีหน้าตื่นเต้น / แอ็กชันเด่นของสินค้า) ให้คนอยากดูต่อ
- คนไทย 1 คน หน้าตาดีมีเสน่ห์ บุคลิกสดใสมีพลัง เข้ากับกลุ่มเป้าหมายสินค้า ถือ/ใช้สินค้าตัวในรูปจริง (บรรยายรูปร่าง/สีที่เห็น ห้ามเปลี่ยนเป็นของอื่น) โชว์จุดเด่น/การใช้งานที่เห็นผลชัด
- พูดไทย "ประโยคเดียวสั้น ปังๆ" ที่กระตุ้นให้อยากซื้อ (เน้นจุดขายเด็ด/ความคุ้ม/ราคา {price} บาท) สั้นพอพูดจบใน 8 วิ เสียงชัดมีพลัง
- ภาพ: แสงสวยคมชัด สีจัดจ้านน่าดึงดูด กล้องเคลื่อนมีไดนามิก (ซูม/แพน/orbit นุ่มแต่มีพลัง) ฉาก{bg} อารมณ์{pers} สไตล์คอนเทนต์ไวรัลทันสมัย

ตอบเฉพาะข้อความ prompt เท่านั้น ไม่ต้องมีคำอธิบายอื่น"""

    fallback = (f"วิดีโอแนวตั้ง 9:16 ช็อตเดียวต่อเนื่อง 8 วินาที คุณภาพระดับโฆษณา สไตล์คอนเทนต์ไวรัล: "
                f"ผู้หญิงไทยหน้าตาดีวัย 25 สดใสมีพลัง ชูสินค้า {name} ตัวในรูปจริงเข้ากล้องแบบ HOOK สะดุดตาในวินาทีแรก "
                f"ยิ้มกว้างพูดไทยปังๆ ว่า \"บอกเลยตัวนี้ปังมาก คุ้มสุดๆ ราคาแค่ {price} บาทเองนะคะ!\" "
                f"แสงสวยคมชัด สีจัดจ้าน กล้องซูมเข้ามีไดนามิก ฉากไลฟ์สไตล์ทันสมัย")

    contents = [instruction]
    if image_bytes:
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime or "image/jpeg"))

    model = settings.get("prompt_model", DEFAULT_PROMPT_MODEL)
    try:
        client = genai.Client(api_key=settings["google_api_key"])
        resp = client.models.generate_content(model=model, contents=contents)
        return (resp.text or "").strip() or fallback
    except Exception as e:
        log(f"[PROMPT] Gemini พลาด ({str(e)[:60]}) → ใช้ fallback")
        return fallback


def build_flow_prompt(product: dict, settings: dict, log: Callable = print) -> str:
    """สร้าง prompt ที่จะส่งเข้า Flow — ยืดหยุ่นตามค่าตั้งของผู้ใช้:
      prompt_mode=template → ใช้เทมเพลตของผู้ใช้ตรงๆ (เติมตัวแปร)
      prompt_mode=ai       → ให้ Gemini เขียน + ต่อท้ายสไตล์ที่ผู้ใช้กำหนด
    """
    bi   = product.get("basic_info", {}) or {}
    name = bi.get("name", "สินค้า")
    price = bi.get("price", "")
    comm = (product.get("commission", {}) or {}).get("rate", "")
    dur  = settings.get("duration", 8)
    shop = settings.get("shop_name", "")

    def fill(t: str) -> str:
        repl = {"{name}": name, "{price}": str(price), "{commission}": str(comm),
                "{duration}": str(dur), "{shop}": shop}
        for k, v in repl.items():
            t = (t or "").replace(k, v)
        return t

    tmpl = (settings.get("prompt_template") or "").strip()
    default = (f"สร้างวิดีโอโฆษณาแนวตั้ง 9:16 ความยาว {dur} วินาที ของ {name} "
               f"กล้องค่อยๆ ซูมเข้า แสงสตูดิโอ สไตล์โฆษณาสินค้า")

    # โหมดเทมเพลต — ผู้ใช้คุมเองเต็มที่
    if settings.get("prompt_mode") == "template" and tmpl:
        return fill(tmpl)

    # โหมด AI
    fallback = fill(tmpl) if tmpl else default
    if not settings.get("google_api_key"):
        return fallback
    try:
        img = get_product_image(product)
        image_bytes, mime = img if img else (None, None)
        p = _gemini_flow_prompt(product, settings, image_bytes, mime, log) or fallback
        note = (settings.get("prompt_style_note") or "").strip()
        if note:
            p = f"{p}\n{fill(note)}"
        return p
    except Exception as e:
        log(f"[FLOW] เขียน prompt ไม่สำเร็จ: {e}")
        return fallback
