"""
FREE product video generator — no AI cost.

Builds a 9:16 promo clip from the REAL product image (what the scraper captured)
using PIL for layout/Thai text and ffmpeg for a smooth Ken-Burns zoom + music.
Perfect for Shopee affiliate: the actual product is shown, costs nothing, instant.

Same interface as VideoGenerator (process(product) -> Path) so GenWorker can use
either engine.
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

# Thai-capable font (RAQM shaping enabled at runtime)
FONT_CANDIDATES = [
    "/System/Library/Fonts/Thonburi.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Ayuthaya.ttf",
]


def _font(size: int):
    from PIL import ImageFont
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)
            except Exception:
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    continue
    from PIL import ImageFont
    return ImageFont.load_default()


class TemplateGenerator:
    def __init__(self, settings: dict):
        self.settings = settings
        self.log: Callable = print
        self.on_progress: Optional[Callable] = None

    def _progress(self, pid, stage, detail=""):
        if self.on_progress:
            try: self.on_progress(pid, stage, detail)
            except Exception: pass

    # ── product image (same sources as VideoGenerator) ────────

    def _get_image(self, product: dict):
        from PIL import Image
        import io
        for b64 in (product.get("images_b64") or []):
            if b64 and b64.startswith("data:"):
                try:
                    _, data = b64.split(",", 1)
                    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
                except Exception:
                    continue
        for url in (product.get("images") or []):
            if url and url.startswith("http"):
                try:
                    import httpx
                    r = httpx.get(url, timeout=20, follow_redirects=True,
                                  headers={"Referer": "https://shopee.co.th/"})
                    if r.status_code == 200:
                        return Image.open(io.BytesIO(r.content)).convert("RGB")
                except Exception:
                    continue
        return None

    # ── compositing ───────────────────────────────────────────

    def _build_layers(self, product: dict, img) -> Tuple[Path, Path]:
        """Return (background.png with product, overlay.png transparent text)."""
        from PIL import Image, ImageDraw, ImageFilter

        # ── Layer A: blurred fill + centered sharp product ──
        bg = img.copy()
        # cover-fill blurred background
        scale = max(W / bg.width, H / bg.height)
        fill = bg.resize((int(bg.width * scale), int(bg.height * scale)))
        left = (fill.width - W) // 2
        top  = (fill.height - H) // 2
        fill = fill.crop((left, top, left + W, top + H)).filter(ImageFilter.GaussianBlur(40))
        fill = Image.eval(fill, lambda p: int(p * 0.55))   # darken

        # centered sharp product (fit in upper area)
        prod = img.copy()
        box_w, box_h = int(W * 0.86), int(H * 0.56)
        fit = min(box_w / prod.width, box_h / prod.height)
        prod = prod.resize((int(prod.width * fit), int(prod.height * fit)))
        canvas = fill
        px = (W - prod.width) // 2
        py = int(H * 0.07)
        # rounded white card behind product
        card = Image.new("RGBA", (prod.width + 40, prod.height + 40), (255, 255, 255, 235))
        canvas.paste(card, (px - 20, py - 20), card)
        canvas.paste(prod, (px, py))

        bg_path = Path(tempfile.mktemp(suffix="_bg.png"))
        canvas.save(bg_path)

        # ── Layer B: transparent overlay with gradient + text ──
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)

        # bottom gradient
        grad_top = int(H * 0.60)
        for y in range(grad_top, H):
            a = int(255 * ((y - grad_top) / (H - grad_top)) ** 1.3)
            d.line([(0, y), (W, y)], fill=(7, 7, 16, min(a, 245)))

        bi   = product.get("basic_info", {})
        name = (bi.get("name") or "สินค้า Shopee").strip()
        price = bi.get("price")
        comm = product.get("commission", {}).get("rate")
        sold = bi.get("sold_count")

        # product name (wrap to 2 lines)
        fname = _font(52)
        name = self._wrap(d, name, fname, W - 120, max_lines=2)
        ny = int(H * 0.66)
        for line in name:
            d.text((60, ny), line, font=fname, fill=(255, 255, 255, 255))
            ny += 64

        # price (big accent)
        if price not in (None, ""):
            fprice = _font(96)
            ptxt = f"฿{int(float(price)):,}" if str(price).replace('.','').isdigit() else f"฿{price}"
            d.text((60, ny + 10), ptxt, font=fprice, fill=(124, 92, 252, 255))

            # sold / commission line
            meta = []
            if sold: meta.append(f"ขายแล้ว {sold}")
            if comm: meta.append(f"คอม {comm}%")
            if meta:
                fmeta = _font(38)
                d.text((64, ny + 120), "   •   ".join(meta), font=fmeta, fill=(200, 200, 210, 255))

        # CTA pill
        fcta = _font(42)
        cta = "ช้อปเลย — ลิงก์ในโปรไฟล์"
        tw = d.textlength(cta, font=fcta)
        pill_w, pill_h = int(tw + 70), 86
        px2 = (W - pill_w) // 2
        py2 = H - 150
        d.rounded_rectangle([px2, py2, px2 + pill_w, py2 + pill_h], radius=43,
                            fill=(124, 92, 252, 255))
        d.text((px2 + 35, py2 + 18), cta, font=fcta, fill=(255, 255, 255, 255))

        ov_path = Path(tempfile.mktemp(suffix="_ov.png"))
        ov.save(ov_path)
        return bg_path, ov_path

    def _wrap(self, draw, text, font, max_w, max_lines=2):
        words = text.split()
        lines, cur = [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=font) <= max_w:
                cur = t
            else:
                if cur: lines.append(cur)
                cur = w
                if len(lines) == max_lines - 1:
                    # last line — truncate with ellipsis if needed
                    while draw.textlength(cur + "…", font=font) > max_w and len(cur) > 1:
                        cur = cur[:-1]
                    break
        if cur and len(lines) < max_lines:
            lines.append(cur)
        return lines[:max_lines]

    # ── music (optional, drop files in data/music/) ───────────

    def _music(self) -> Optional[Path]:
        mdir = cfg.DATA_DIR / "music"
        if mdir.exists():
            tracks = list(mdir.glob("*.mp3")) + list(mdir.glob("*.m4a"))
            if tracks:
                import random
                return random.choice(tracks)
        return None

    # ── ffmpeg render ─────────────────────────────────────────

    def _render(self, bg: Path, ov: Path, out: Path, duration: int) -> bool:
        music = self._music()
        frames = duration * FPS
        # Ken Burns: upscale then slow zoom-in, overlay static text, add music
        vf = (
            f"[0:v]scale={W*2}:{H*2},"
            f"zoompan=z='min(zoom+0.0006,1.25)':d={frames}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}[bg];"
            f"[bg][1:v]overlay=0:0[v]"
        )
        cmd = ["ffmpeg", "-y",
               "-loop", "1", "-t", str(duration), "-i", str(bg),
               "-loop", "1", "-t", str(duration), "-i", str(ov)]
        if music:
            cmd += ["-i", str(music)]
        cmd += ["-filter_complex", vf, "-map", "[v]"]
        if music:
            cmd += ["-map", "2:a", "-shortest", "-c:a", "aac", "-b:a", "128k"]
        cmd += ["-t", str(duration), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-r", str(FPS), str(out)]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            self.log(f"[TPL] ffmpeg error: {r.stderr.decode(errors='ignore')[-300:]}")
            return False
        return True

    # ── sidecar (same shape as VideoGenerator) ────────────────

    def _save_sidecar(self, video_path: Path, product: dict):
        import json
        bi = product.get("basic_info", {})
        meta = {
            "video": video_path.name,
            "product_id": product.get("product_id", ""),
            "name": bi.get("name", ""),
            "price": bi.get("price", ""),
            "sold_count": bi.get("sold_count", ""),
            "commission": product.get("commission", {}).get("rate", ""),
            "link": (product.get("links", {}).get("affiliate_link", "") or
                     product.get("links", {}).get("product_url", "")),
            "engine": "template",
            "created_at": int(time.time()),
            "status": "ready",
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
        duration = int(self.settings.get("duration", 8))

        try:
            self._progress(pid, "prompt", name)
            self.log(f"[TPL] เตรียมรูป + เลย์เอาต์: {name}")
            img = self._get_image(product)
            if img is None:
                self.log("[TPL] ❌ ไม่พบรูปสินค้า — template ต้องมีรูป")
                self._progress(pid, "error", "ไม่มีรูปสินค้า")
                return None

            bg, ov = self._build_layers(product, img)

            self._progress(pid, "rendering", "0")
            self.log(f"[TPL] เรนเดอร์วิดีโอ {duration}s (Ken Burns + ข้อความ)...")
            out = cfg.PENDING_DIR / f"{pid}_{int(time.time())}.mp4"
            cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
            ok = self._render(bg, ov, out, duration)

            for tmp in (bg, ov):
                try: tmp.unlink()
                except Exception: pass

            if not ok or not out.exists():
                self._progress(pid, "error", "render ไม่สำเร็จ")
                return None

            self._save_sidecar(out, product)
            self._progress(pid, "done", out.name)
            self.log(f"[TPL] ✅ เสร็จ → {out.name} ({out.stat().st_size//1024}KB)")
            return out
        except Exception as e:
            self.log(f"[TPL] ❌ Error: {e}")
            self._progress(pid, "error", str(e)[:150])
            return None
