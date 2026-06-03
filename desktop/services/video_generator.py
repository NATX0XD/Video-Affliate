"""
AI video generation for Shopee affiliate products.

Pipeline (image-to-video):
  1. Fetch the real product image (scraper provides images_b64 / images URLs)
  2. Gemini looks at the product + image and writes a cinematic motion prompt
  3. Veo animates the product image into a 9:16 promo clip

Single provider: Google (Gemini + Veo) via the google-genai SDK.
Needs a Google AI Studio API key with billing enabled (not the consumer
Gemini subscription — that can't call the API).
"""
import time
import base64
from pathlib import Path
from typing import Optional, Callable, Tuple
import config as cfg

DEFAULT_PROMPT_MODEL = "gemini-2.0-flash"
DEFAULT_VEO_MODEL    = "veo-2.0-generate-001"


class VideoGenerator:
    def __init__(self, google_key: str, settings: dict, claude_key: str = None):
        # claude_key kept for backward-compat with callers; no longer used.
        self.google_key = google_key
        self.settings = settings
        self.log: Callable = print
        self.on_progress: Optional[Callable] = None   # (pid, stage, detail)

    def _client(self):
        from google import genai
        return genai.Client(api_key=self.google_key)

    def _progress(self, pid, stage, detail=""):
        if self.on_progress:
            try: self.on_progress(pid, stage, detail)
            except Exception: pass

    # ── Friendly error translation ────────────────────────────

    @staticmethod
    def friendly_error(err) -> str:
        s = str(err)
        if "FAILED_PRECONDITION" in s or "GCP billing" in s or "Cloud Platform billing" in s:
            return ("ต้องเปิด Google Cloud billing ก่อน — Veo เป็น paid-only "
                    "ไปที่ console.cloud.google.com/billing แล้วผูก billing account "
                    "ให้ project ของ API key")
        if "RESOURCE_EXHAUSTED" in s or "429" in s or "quota" in s.lower():
            return ("Quota Veo หมด/เกินลิมิต — ตรวจ quota ที่ ai.dev/rate-limit "
                    "หรือเปิด GCP billing เพื่อปลดลิมิต paid")
        if "generate_audio" in s:
            return "generate_audio ใช้ได้เฉพาะ Vertex AI — Veo 3 มีเสียงให้อยู่แล้ว (เอา toggle ออก)"
        if "PERMISSION_DENIED" in s or "API key not valid" in s or "401" in s or "403" in s:
            return "API key ไม่ถูกต้อง/ไม่มีสิทธิ์ — ตรวจ key ใน Settings"
        if "safety" in s.lower() or "blocked" in s.lower():
            return "ถูก safety filter บล็อก — ลองปรับ prompt/รูปสินค้า"
        if "not found" in s.lower() or "NOT_FOUND" in s:
            return "ไม่พบ model ที่เลือก — กด 'โหลด model ที่ key ใช้ได้' แล้วเลือกใหม่"
        # Fallback: first line of the raw error
        return s.split("\n")[0][:200]

    # ── Product image ─────────────────────────────────────────

    def _get_product_image(self, product: dict) -> Optional[Tuple[bytes, str]]:
        """Return (image_bytes, mime_type) from the scraped product, or None."""
        # 1) base64 data URLs captured by the extension
        for b64 in (product.get("images_b64") or []):
            if b64 and b64.startswith("data:"):
                try:
                    header, data = b64.split(",", 1)
                    mime = header.split(":")[1].split(";")[0] or "image/jpeg"
                    return base64.b64decode(data), mime
                except Exception:
                    continue

        # 2) download from image URLs
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

    # ── Prompt (Gemini, image-aware) ──────────────────────────

    def generate_prompt(self, product: dict,
                        image_bytes: Optional[bytes] = None,
                        mime: Optional[str] = None,
                        target: str = "veo") -> str:
        """Write a motion-prompt from the product image.
        target="veo"  → concise English prompt for Veo image-to-video
        target="flow" → Thai prompt for the Google Flow agent (text→video, 9:16)
        """
        from google.genai import types

        name  = product.get("basic_info", {}).get("name", "สินค้า Shopee")
        price = product.get("basic_info", {}).get("price", "")
        sold  = product.get("basic_info", {}).get("sold_count", "")

        personality = self.settings.get("personality", "สนุกสนาน")
        style       = self.settings.get("style",       "ไลฟ์สไตล์")
        bg          = self.settings.get("background",  "สตูดิโอ")
        age_group   = self.settings.get("age_group",   "ทุกวัย")
        duration    = self.settings.get("duration",    8)

        if target == "flow":
            # Flow ใช้ Veo 3 — ช็อตเดียว 8 วิ แต่ต้อง "ว้าว/หยุดนิ้วคนเลื่อน" ใน 8 วิ
            instruction = f"""คุณเป็นครีเอเตอร์คอนเทนต์สั้นไวรัล Shopee มือโปร เขียน prompt ภาษาไทย 1 ย่อหน้า
สั่งให้ Veo สร้างวิดีโอโฆษณา/รีวิว "ช็อตเดียวต่อเนื่อง 8 วินาที" ที่ "หยุดนิ้วคนเลื่อนฟีดได้ทันที" จากสินค้าในรูปที่แนบมา

สินค้า: {name}
ราคา: ฿{price}   ขายแล้ว: {sold}

หัวใจคือ "ว้าวภายใน 8 วินาที" — เขียน prompt ที่มี:
- ขึ้นต้น: "วิดีโอแนวตั้ง 9:16 ช็อตเดียวต่อเนื่อง 8 วินาที ไม่มีการตัดสลับฉาก คุณภาพระดับโฆษณา"
- HOOK ใน 1 วินาทีแรกที่สะดุดตา (เช่น คนโชว์สินค้าเข้ากล้องแบบมีพลัง / สีหน้าตื่นเต้น / แอ็กชันเด่นของสินค้า) ให้คนอยากดูต่อ
- คนไทย 1 คน หน้าตาดีมีเสน่ห์ บุคลิกสดใสมีพลัง เข้ากับกลุ่มเป้าหมายสินค้า ถือ/ใช้สินค้าตัวในรูปจริง (บรรยายรูปร่าง/สีที่เห็น ห้ามเปลี่ยนเป็นของอื่น) โชว์จุดเด่น/การใช้งานที่เห็นผลชัด
- พูดไทย "ประโยคเดียวสั้น ปังๆ" ที่กระตุ้นให้อยากซื้อ (เน้นจุดขายเด็ด/ความคุ้ม/ราคา {price} บาท) สั้นพอพูดจบใน 8 วิ เสียงชัดมีพลัง
- ภาพ: แสงสวยคมชัด สีจัดจ้านน่าดึงดูด กล้องเคลื่อนมีไดนามิก (ซูม/แพน/orbit นุ่มแต่มีพลัง) ฉาก{bg} อารมณ์{personality} สไตล์คอนเทนต์ไวรัลทันสมัย

ตอบเฉพาะข้อความ prompt เท่านั้น ไม่ต้องมีคำอธิบายอื่น"""
            fallback = (f"วิดีโอแนวตั้ง 9:16 ช็อตเดียวต่อเนื่อง 8 วินาที คุณภาพระดับโฆษณา สไตล์คอนเทนต์ไวรัล: "
                        f"ผู้หญิงไทยหน้าตาดีวัย 25 สดใสมีพลัง ชูสินค้า {name} ตัวในรูปจริงเข้ากล้องแบบ HOOK สะดุดตาในวินาทีแรก "
                        f"ยิ้มกว้างพูดไทยปังๆ ว่า \"บอกเลยตัวนี้ปังมาก คุ้มสุดๆ ราคาแค่ {price} บาทเองนะคะ!\" "
                        f"แสงสวยคมชัด สีจัดจ้าน กล้องซูมเข้ามีไดนามิก ฉากไลฟ์สไตล์ทันสมัย")
        else:
            instruction = f"""You are a pro short-form video director for Shopee product ads.
Write ONE concise English motion-prompt for an AI video generator that will
ANIMATE the attached product image into a vertical 9:16 promo clip.

Product: {name}
Price: ฿{price}   Sold: {sold}

Requirements:
- Keep the EXACT product from the image as the hero — do not invent a different product
- Add tasteful camera motion (slow push-in, orbit, parallax) and lighting
- Mood: {personality} / {style}, audience: {age_group}, setting: {bg}
- ~{duration}s, 9:16 vertical, high quality, e-commerce look
- Output ONLY the prompt text, no explanations."""
            fallback = f"Cinematic 9:16 promo of {name}, slow push-in, studio lighting"

        contents = [instruction]
        if image_bytes:
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime or "image/jpeg"))

        model = self.settings.get("prompt_model", DEFAULT_PROMPT_MODEL)
        # ถ้า Gemini พลาด (เช่น 429 โควต้าหมด) → คืน fallback (ที่เขียนไว้คุณภาพดี) ไม่ throw
        try:
            resp = self._client().models.generate_content(model=model, contents=contents)
            return (resp.text or "").strip() or fallback
        except Exception as e:
            self.log(f"[PROMPT] Gemini พลาด ({str(e)[:60]}) → ใช้ fallback")
            return fallback

    def generate_flow_scenes(self, product: dict,
                             image_bytes: Optional[bytes] = None,
                             mime: Optional[str] = None) -> list:
        """สร้าง prompt แยกเป็นฉากๆ (คนเดียวกันทุกฉาก) สำหรับสั่ง Flow ทีละคลิป
        คืน list ของ prompt (เช่น 4 ฉาก × ~6 วิ) — extension วนสั่งทีละฉากแล้วต่อกัน."""
        from google.genai import types

        name  = product.get("basic_info", {}).get("name", "สินค้า Shopee")
        price = product.get("basic_info", {}).get("price", "")
        bg    = self.settings.get("background", "สตูดิโอ")
        pers  = self.settings.get("personality", "สดใส")

        instruction = f"""คุณเป็นผู้กำกับวิดีโอรีวิวสินค้า Shopee แนวคนรีวิวพูดไทย
ออกแบบรีวิว 20 วินาที แบ่งเป็น 4 ฉากๆ ละ ~5-6 วินาที โดยใช้ "คนรีวิวคนเดียวกันเป๊ะ" ทุกฉาก

สินค้า: {name}   ราคา: ฿{price}

ทำตามนี้:
1. ออกแบบคนรีวิว 1 คน (ให้เข้ากับสินค้าในรูป) เขียนคำบรรยายละเอียด: เพศ/วัย/เชื้อชาติไทย/ทรงผม/หน้าตา/การแต่งตัว+สีเสื้อ — ต้องเหมือนกันเป๊ะทั้ง 4 ฉาก
2. เขียน prompt 4 ฉากตามนี้ แต่ละฉากต้องขึ้นต้นด้วยคำบรรยายคนคนเดิม (copy เหมือนกัน) แล้วตามด้วยแอ็กชัน + ประโยคพูดภาษาไทย + มุมกล้อง:
   ฉาก1: ทักทาย โชว์สินค้า | ฉาก2: โชว์จุดเด่น/ใช้งาน | ฉาก3: รีวิวความรู้สึก/ความคุ้ม | ฉาก4: ชวนซื้อ โชว์สินค้าเต็มจอ
3. ทุกฉากเป็นวิดีโอแนวตั้ง 9:16 ฉาก{bg} อารมณ์{pers} ความยาว 6 วินาที ถือสินค้าตัวในรูปจริง

สำคัญมาก: แต่ละฉากต้องเป็น "shot เดียวต่อเนื่อง (one continuous take 6 วินาที)" — บรรยายเป็นแอ็กชันเดียวสั้นๆ ห้ามใส่หลายช่วงเวลา/หลายช็อต/storyboard ย่อย (กัน AI ซอยเป็นหลายคลิป) เขียนสั้น กระชับ ฉากละ 1-2 ประโยคพอ

รูปแบบคำตอบ: เขียน prompt 4 ฉากเท่านั้น คั่นแต่ละฉากด้วยบรรทัด "===SCENE===" (ไม่ต้องมีหัวข้อ/คำอธิบายอื่น)"""

        contents = [instruction]
        if image_bytes:
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime or "image/jpeg"))
        model = self.settings.get("prompt_model", DEFAULT_PROMPT_MODEL)
        try:
            resp = self._client().models.generate_content(model=model, contents=contents)
            parts = [p.strip() for p in (resp.text or "").split("===SCENE===") if p.strip()]
            if len(parts) >= 2:
                return parts[:6]
        except Exception as e:
            self.log(f"[FLOW] gen scenes ไม่สำเร็จ: {e}")
        # fallback: 4 ฉากคนเดิม
        person = "ผู้หญิงไทยวัย 25 ปี ผมยาวสีดำตรง แต่งหน้าใส เสื้อยืดสีขาว ยิ้มแย้ม"
        acts = [
            (f"ทักทายกล้องพร้อมถือ {name} พูดว่า \"สวัสดีค่ะ วันนี้มารีวิว {name} ค่ะ\""),
            (f"โชว์ {name} ใกล้ๆ พูดว่า \"ตัวนี้คุณภาพดีมากเลยค่ะ\""),
            (f"รีวิวความรู้สึก พูดว่า \"ใช้แล้วชอบมาก คุ้มสุดๆ\""),
            (f"ชวนซื้อ โชว์ {name} เต็มจอ พูดว่า \"ราคาแค่ {price} บาท รีบสั่งเลยนะคะ\""),
        ]
        return [f"วิดีโอแนวตั้ง 9:16 ความยาว 6 วินาที: {person} {a} ฉาก{bg} แสงสวย" for a in acts]

    # ── Video (Veo, image-to-video) ───────────────────────────

    def generate_video(self, prompt: str, product_id: str,
                      image_bytes: Optional[bytes] = None,
                      mime: Optional[str] = None) -> Optional[Path]:
        from google.genai import types

        model = self.settings.get("vdo_model", DEFAULT_VEO_MODEL)
        client = self._client()
        mode = "image-to-video" if image_bytes else "text-to-video"
        self.log(f"[VDO] สร้างวิดีโอ ({mode}, {model}) — อาจใช้เวลา 1-4 นาที...")

        # NOTE: generate_audio is Vertex-AI-only; the Developer API (AI Studio key)
        # rejects it. Veo 3.x already includes audio natively, so we don't pass it.
        cfg_kwargs = dict(aspect_ratio="9:16", number_of_videos=1)

        vid_kwargs = dict(
            model=model,
            prompt=prompt,
            config=types.GenerateVideosConfig(**cfg_kwargs),
        )
        if image_bytes:
            vid_kwargs["image"] = types.Image(image_bytes=image_bytes,
                                              mime_type=mime or "image/jpeg")

        self._progress(product_id, "submit", model)
        try:
            operation = client.models.generate_videos(**vid_kwargs)
        except Exception as e:
            msg = self.friendly_error(e)
            self.log(f"[VDO] ❌ {msg}")
            self._progress(product_id, "error", msg)
            return None

        max_wait, waited = 360, 0
        while not operation.done:
            if waited >= max_wait:
                self.log("[VDO] ❌ Timeout — Veo ใช้เวลานานเกิน 6 นาที")
                self._progress(product_id, "error", "timeout")
                return None
            time.sleep(15)
            waited += 15
            self.log(f"[VDO] ⏳ Veo กำลังเรนเดอร์... {waited}s")
            self._progress(product_id, "rendering", str(waited))
            try:
                operation = client.operations.get(operation)
            except Exception as e:
                msg = self.friendly_error(e)
                self.log(f"[VDO] ❌ {msg}")
                self._progress(product_id, "error", msg)
                return None

        resp = getattr(operation, "response", None)
        vids = getattr(resp, "generated_videos", None) if resp else None
        if not vids:
            self.log("[VDO] ❌ ไม่มีวิดีโอในผลลัพธ์ (อาจถูก safety filter)")
            self._progress(product_id, "error", "ไม่มีผลลัพธ์ (safety filter?)")
            return None

        self._progress(product_id, "downloading", "")
        out_path = cfg.PENDING_DIR / f"{product_id}_{int(time.time())}.mp4"
        cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
        client.files.download(file=vids[0].video)
        vids[0].video.save(str(out_path))
        self.log(f"[VDO] ✅ บันทึกวิดีโอ → {out_path.name}")
        return out_path

    # ── Sidecar metadata (so the clip can be posted later) ────

    def _save_sidecar(self, video_path: Path, product: dict, prompt: str):
        """Save product info next to the clip → posting later can build the caption."""
        import json
        bi = product.get("basic_info", {})
        meta = {
            "video":       video_path.name,
            "product_id":  product.get("product_id", ""),
            "name":        bi.get("name", ""),
            "price":       bi.get("price", ""),
            "sold_count":  bi.get("sold_count", ""),
            "commission":  product.get("commission", {}).get("rate", ""),
            "link":        (product.get("links", {}).get("affiliate_link", "") or
                            product.get("links", {}).get("product_url", "")),
            "prompt":      prompt,
            "profile":     {k: self.settings.get(k) for k in
                            ("duration", "age_group", "personality", "style",
                             "background", "generate_audio", "vdo_model")},
            "created_at":  int(time.time()),
            "status":      "ready",   # ready → posted
        }
        try:
            sidecar = video_path.with_suffix(".json")
            sidecar.write_text(json.dumps(meta, ensure_ascii=False, indent=2),
                               encoding="utf-8")
        except Exception as e:
            self.log(f"[VDO] บันทึก metadata ไม่ได้: {e}")

    # ── Full flow ─────────────────────────────────────────────

    def process(self, product: dict) -> Optional[Path]:
        pid  = product.get("product_id", f"p{int(time.time())}")
        name = product.get("basic_info", {}).get("name", "")[:40]

        try:
            img = self._get_product_image(product)
            if img:
                image_bytes, mime = img
                self.log(f"[VDO] ใช้รูปสินค้าจริง ({len(image_bytes)//1024}KB, {mime})")
            else:
                image_bytes, mime = None, None
                self.log("[VDO] ⚠ ไม่พบรูปสินค้า — fallback เป็น text-to-video")

            self._progress(pid, "prompt", name)
            self.log(f"[VDO] เขียน prompt: {name}")
            try:
                prompt = self.generate_prompt(product, image_bytes, mime)
            except Exception as e:
                msg = self.friendly_error(e)
                self.log(f"[VDO] ❌ เขียน prompt ไม่สำเร็จ: {msg}")
                self._progress(pid, "error", msg)
                return None
            self.log(f"[VDO] Prompt: {prompt[:100]}...")

            path = self.generate_video(prompt, pid, image_bytes, mime)
            if path:
                self._progress(pid, "done", path.name)
                self._save_sidecar(path, product, prompt)
            return path
        except Exception as e:
            msg = self.friendly_error(e)
            self.log(f"[VDO] ❌ {msg}")
            self._progress(pid, "error", msg)
            return None
