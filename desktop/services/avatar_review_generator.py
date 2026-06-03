"""
Avatar Review video engine — a person (AI avatar) reviewing the product.

Pipeline:
  1. Gemini writes a natural Thai review script (free tier)
  2. D-ID generates a talking-head avatar that speaks it (Thai voice + lip-sync)
  3. ffmpeg composites: product image (Ken Burns) as the stage + avatar in a
     corner circle + name/price overlay; audio = the avatar's narration

Same interface as the other engines (process / log / on_progress) so GenWorker
can switch to it via settings.engine == "avatar".

Needs: Google API key (Gemini, free) + D-ID API key (14-day free trial).
"""
import time
import base64
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Callable, Tuple
import config as cfg

W, H = 1080, 1920
FPS  = 30
DID_BASE = "https://api.d-id.com"


class AvatarReviewGenerator:
    def __init__(self, settings: dict):
        self.settings = settings
        self.log: Callable = print
        self.on_progress: Optional[Callable] = None

    def _progress(self, pid, stage, detail=""):
        if self.on_progress:
            try: self.on_progress(pid, stage, detail)
            except Exception: pass

    # ── reuse helpers from the other generators ───────────────

    def _get_image(self, product: dict):
        from services.template_generator import TemplateGenerator
        return TemplateGenerator(self.settings)._get_image(product)

    # ── 1. Gemini review script (Thai, spoken) ────────────────

    def generate_script(self, product: dict) -> str:
        from google import genai
        bi = product.get("basic_info", {})
        name  = bi.get("name", "สินค้า")
        price = bi.get("price", "")
        sold  = bi.get("sold_count", "")
        comm  = product.get("commission", {}).get("rate", "")
        secs  = int(self.settings.get("review_seconds", 18))

        instruction = f"""เขียนสคริปต์พูดรีวิวสินค้าภาษาไทย สำหรับคลิปสั้น TikTok/Shopee
สินค้า: {name}
ราคา: {price} บาท   ขายแล้ว: {sold}

ข้อกำหนด:
- โทนเป็นกันเอง สนุก เหมือนรีวิวเวอร์พูดจริง ชวนซื้อ
- ความยาวพูดประมาณ {secs} วินาที (สั้นกระชับ)
- เปิดด้วยฮุกดึงดูด → จุดเด่นสินค้า → ราคา/คุ้ม → ปิดด้วยชวนกดลิงก์ในโปรไฟล์
- ตอบเฉพาะบทพูด ภาษาไทยล้วน ไม่ต้องมีหัวข้อ/คำกำกับ/อิโมจิ"""

        model = self.settings.get("prompt_model", "gemini-2.0-flash")
        client = genai.Client(api_key=self.settings["google_api_key"])
        resp = client.models.generate_content(model=model, contents=[instruction])
        script = (resp.text or "").strip()
        return script or f"{name} ราคาแค่ {price} บาท คุ้มมาก กดลิงก์ในโปรไฟล์เลยนะคะ"

    # ── 2. D-ID talking avatar ────────────────────────────────

    def _did_headers(self):
        key = self.settings.get("did_api_key", "").strip()
        # D-ID accepts the dashboard key directly as Basic auth
        return {"Authorization": f"Basic {key}", "Content-Type": "application/json"}

    def create_avatar_talk(self, script: str, pid: str) -> Optional[Path]:
        import httpx
        avatar = self.settings.get("avatar_url")
        voice  = self.settings.get("avatar_voice", "th-TH-PremwadeeNeural")

        body = {
            "source_url": avatar,
            "script": {
                "type": "text",
                "input": script,
                "provider": {"type": "microsoft", "voice_id": voice},
            },
            "config": {"stitch": True},
        }
        try:
            with httpx.Client(timeout=60) as c:
                r = c.post(f"{DID_BASE}/talks", headers=self._did_headers(), json=body)
                if r.status_code >= 400:
                    self.log(f"[AVATAR] ❌ {self._did_error(r)}")
                    self._progress(pid, "error", self._did_error(r))
                    return None
                talk_id = r.json().get("id")
                if not talk_id:
                    self._progress(pid, "error", "D-ID ไม่คืน talk id")
                    return None

                # poll
                for i in range(60):
                    time.sleep(4)
                    g = c.get(f"{DID_BASE}/talks/{talk_id}", headers=self._did_headers())
                    data = g.json()
                    status = data.get("status")
                    self._progress(pid, "rendering", str((i + 1) * 4))
                    if status == "done":
                        url = data.get("result_url")
                        out = Path(tempfile.mktemp(suffix="_avatar.mp4"))
                        vid = c.get(url, timeout=120)
                        out.write_bytes(vid.content)
                        return out
                    if status in ("error", "rejected"):
                        msg = self._did_error_data(data)
                        self.log(f"[AVATAR] ❌ {msg}")
                        self._progress(pid, "error", msg)
                        return None
                self._progress(pid, "error", "D-ID timeout")
                return None
        except Exception as e:
            self.log(f"[AVATAR] ❌ D-ID error: {e}")
            self._progress(pid, "error", str(e)[:150])
            return None

    def _did_error(self, resp) -> str:
        try: return self._did_error_data(resp.json())
        except Exception: return f"D-ID HTTP {resp.status_code}"

    def _did_error_data(self, data: dict) -> str:
        msg = (data.get("description") or data.get("message") or
               (data.get("error") or {}).get("description") or str(data))[:200]
        low = msg.lower()
        if "credit" in low or "quota" in low or "insufficient" in low:
            return "เครดิต D-ID หมด — ต่ออายุ trial หรือ upgrade plan"
        if "unauthorized" in low or "401" in low or "forbidden" in low:
            return "D-ID API key ไม่ถูกต้อง — ตรวจ key ใน Settings"
        return f"D-ID: {msg}"

    # ── 3. composite: product stage + avatar corner + overlay ─

    def _composite(self, product: dict, avatar_mp4: Path, img, out: Path) -> bool:
        from services.template_generator import TemplateGenerator, _font
        from PIL import Image, ImageDraw, ImageFilter

        # product stage (blurred fill + sharp product, upper area) — reuse template look
        tg = TemplateGenerator(self.settings)
        bg_path, _ov = tg._build_layers(product, img)   # bg has product; ignore its overlay

        # text overlay (name/price in lower-third, dark gradient for readability)
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        # gradient panel behind text (y 1140→1480)
        gt, gb = 1140, 1500
        for y in range(gt, gb):
            a = int(210 * ((y - gt) / (gb - gt)))
            d.line([(0, y), (W, y)], fill=(7, 7, 16, min(a, 200)))
        bi = product.get("basic_info", {})
        name = (bi.get("name") or "").strip()
        price = bi.get("price")
        fname = _font(46)
        for i, line in enumerate(tg._wrap(d, name, fname, W - 120, max_lines=2)):
            # text shadow then white
            d.text((62, 1182 + i * 58), line, font=fname, fill=(0, 0, 0, 200))
            d.text((60, 1180 + i * 58), line, font=fname, fill=(255, 255, 255, 255))
        if price not in (None, ""):
            d.text((62, 1302), f"฿{price}", font=_font(80), fill=(0, 0, 0, 180))
            d.text((60, 1300), f"฿{price}", font=_font(80), fill=(167, 139, 250, 255))
        ov_path = Path(tempfile.mktemp(suffix="_txt.png"))
        ov.save(ov_path)

        # ffmpeg: bg Ken Burns + avatar circle bottom-right + text, audio from avatar
        # avatar scaled to ~440px, circular mask via geq alpha
        AV = 460
        vf = (
            f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.0004,1.18)':d=99999:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}[bg];"
            f"[2:v]scale={AV}:{AV},format=rgba,"
            f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
            f"a='if(lte(hypot(X-{AV/2},Y-{AV/2}),{AV/2}),255,0)'[av];"
            f"[bg][1:v]overlay=0:0[s1];"
            f"[s1][av]overlay=W-w-40:H-h-60[v]"
        )
        cmd = ["ffmpeg", "-y",
               "-loop", "1", "-i", str(bg_path),     # 0 bg
               "-loop", "1", "-i", str(ov_path),     # 1 text overlay
               "-i", str(avatar_mp4),                # 2 avatar (video+audio)
               "-filter_complex", vf,
               "-map", "[v]", "-map", "2:a",
               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-shortest", "-r", str(FPS), str(out)]
        r = subprocess.run(cmd, capture_output=True, timeout=180)
        for tmp in (bg_path, _ov, ov_path):
            try: tmp.unlink()
            except Exception: pass
        if r.returncode != 0:
            self.log(f"[AVATAR] ffmpeg error: {r.stderr.decode(errors='ignore')[-300:]}")
            return False
        return True

    # ── sidecar ───────────────────────────────────────────────

    def _save_sidecar(self, video_path: Path, product: dict, script: str):
        import json
        bi = product.get("basic_info", {})
        meta = {
            "video": video_path.name,
            "product_id": product.get("product_id", ""),
            "name": bi.get("name", ""), "price": bi.get("price", ""),
            "sold_count": bi.get("sold_count", ""),
            "commission": product.get("commission", {}).get("rate", ""),
            "link": (product.get("links", {}).get("affiliate_link", "") or
                     product.get("links", {}).get("product_url", "")),
            "engine": "avatar", "script": script,
            "created_at": int(time.time()), "status": "ready",
        }
        try:
            video_path.with_suffix(".json").write_text(
                json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    # ── full flow ─────────────────────────────────────────────

    def process(self, product: dict) -> Optional[Path]:
        pid  = product.get("product_id", f"p{int(time.time())}")
        name = product.get("basic_info", {}).get("name", "")[:40]

        if not self.settings.get("did_api_key"):
            self.log("[AVATAR] ยังไม่ได้ใส่ D-ID API Key (Settings)")
            self._progress(pid, "error", "ยังไม่ได้ใส่ D-ID API Key")
            return None

        try:
            img = self._get_image(product)
            if img is None:
                self.log("[AVATAR] ⚠ ไม่พบรูปสินค้า")
                self._progress(pid, "error", "ไม่มีรูปสินค้า")
                return None

            self._progress(pid, "prompt", name)
            self.log(f"[AVATAR] เขียนสคริปต์รีวิว: {name}")
            script = self.generate_script(product)
            self.log(f"[AVATAR] สคริปต์: {script[:80]}…")

            self._progress(pid, "submit", "D-ID")
            self.log("[AVATAR] สร้าง avatar คนพูด (D-ID)…")
            avatar_mp4 = self.create_avatar_talk(script, pid)
            if not avatar_mp4:
                return None

            self._progress(pid, "downloading", "")
            self.log("[AVATAR] ประกอบวิดีโอ (avatar + สินค้า)…")
            out = cfg.PENDING_DIR / f"{pid}_{int(time.time())}.mp4"
            cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
            ok = self._composite(product, avatar_mp4, img, out)
            try: avatar_mp4.unlink()
            except Exception: pass

            if not ok or not out.exists():
                self._progress(pid, "error", "composite ไม่สำเร็จ")
                return None

            self._save_sidecar(out, product, script)
            self._progress(pid, "done", out.name)
            self.log(f"[AVATAR] ✅ เสร็จ → {out.name}")
            return out
        except Exception as e:
            self.log(f"[AVATAR] ❌ Error: {e}")
            self._progress(pid, "error", str(e)[:150])
            return None
