"""
FastAPI web server — REST + WebSocket + MJPEG stream
Replaces the old HTTPServer-based APIServer for web UI integration
"""
import asyncio
import io
import json
import re
import threading
import time
from typing import Optional, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
import uvicorn

from services.db import QUEUED, GENERATING, GENERATED, POSTING, POSTED, ERROR


# ── Log classification (A1.8) ─────────────────────────────────

_ERR_KW  = ("✗", "ไม่สำเร็จ", "พลาด", "ล้มเหลว", "ผิดพลาด", "ส่งไม่ได้", "error", "failed")
_OK_KW   = ("✓", "สำเร็จ", "เสร็จ", "ครบแล้ว")
_WARN_KW = ("⚠", "เตือน", "งบ", "หยุด", "ข้าม")

def _classify_level(msg: str) -> str:
    m = msg or ""
    if any(k in m for k in _ERR_KW):  return "error"
    if any(k in m for k in _OK_KW):   return "success"
    if any(k in m for k in _WARN_KW): return "warn"
    return "info"

def _source_of(msg: str) -> str:
    m = re.search(r"\[([^\]]+)\]", msg or "")
    return m.group(1) if m else ""


# ── WebSocket broadcast manager ───────────────────────────────

class WSManager:
    def __init__(self):
        self._clients: list[WebSocket] = []
        self._lock = asyncio.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._clients.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._clients = [c for c in self._clients if c is not ws]

    async def broadcast(self, data: dict):
        msg = json.dumps(data)
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    def broadcast_sync(self, data: dict):
        """Thread-safe broadcast from sync code."""
        loop = self._loop
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(data), loop)


# ── Main server class ─────────────────────────────────────────

class WebServer:
    def __init__(self, port: int = 8000):
        self.port   = port
        self.log: Callable = print
        self.ws     = WSManager()

        # Injected by main.py after creation
        self.adb    = None
        self.worker = None
        self.gen    = None        # GenWorker (generate-only)
        self.poster = None        # PostWorker (publish-only)
        self.db     = None        # JobStore (A1.2) — persistent flow queue
        self.budget = None        # BudgetGuard (A1.4)
        self._budget_blocked = False   # throttle log เตือนงบเต็ม
        self.flow_queue: list = []  # legacy fallback เมื่อ db ไม่พร้อม
        self.mirrors: dict = {}   # serial → ScreenMirror

        # Pre-capture cache: background thread continuously screenshots each device
        # so /snapshot requests respond immediately (<10ms) with the latest frame
        self._snap_cache: dict = {}   # serial → {'jpeg': bytes|None, 'active': bool, 'lock': Lock}

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._started_at: Optional[float] = None   # uptime (A1.8)

        self.app = self._build_app()

    # ── App builder ───────────────────────────────────────────

    def _build_app(self) -> FastAPI:
        app = FastAPI(title="Shopee VDO Gen API")

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # ── REST endpoints ──

        @app.get("/api/status")
        def status():
            devices = []
            if self.adb:
                for d in self.adb.devices.values():
                    devices.append({
                        "serial":  d.serial,
                        "model":   d.model,
                        "android": d.android,
                        "battery": d.battery,
                        "status":  d.status,
                        "streaming": d.serial in self.mirrors and
                                     self.mirrors[d.serial].is_running,
                    })
            running = bool(
                (self.worker and self.worker.is_running) or
                (self.gen    and self.gen.is_running) or
                (self.poster and self.poster.is_running)
            )
            if self.db:
                by = self.db.stats()["by_status"]
                queue = (by.get(QUEUED, 0) + by.get(GENERATING, 0) +
                         by.get(GENERATED, 0) + by.get(POSTING, 0))  # งานที่ยังไม่จบ
                return {
                    "devices":       devices,
                    "queue":         queue,
                    "done":          by.get(POSTED, 0),
                    "errors":        by.get(ERROR, 0),
                    "pilot_running": running,
                    "jobs":          self.db.stats(),   # breakdown ละเอียดสำหรับค็อกพิต
                    "budget":        self.budget.snapshot() if self.budget else None,
                }
            return {
                "devices":    devices,
                "queue":      len(self.worker.queue) if self.worker else 0,
                "done":       getattr(self.worker, "done_count", 0) if self.worker else 0,
                "errors":     getattr(self.worker, "err_count",  0) if self.worker else 0,
                "pilot_running": running,
            }

        @app.post("/api/scan")
        def scan():
            if not self.adb:
                return {"devices": []}
            devs = self.adb.scan()
            result = [{"serial": d.serial, "model": d.model,
                       "android": d.android, "battery": d.battery,
                       "status": d.status} for d in devs]
            self.ws.broadcast_sync({"type": "devices", "devices": result})
            return {"devices": result}

        @app.post("/api/mirror/start/{serial}")
        def mirror_start(serial: str):
            self._ensure_mirror(serial)
            m = self.mirrors.get(serial)
            if m and not m.is_running:
                m.start(serial)
            self.ws.broadcast_sync({"type": "mirror_state", "serial": serial, "running": True})
            return {"ok": True}

        @app.post("/api/mirror/stop/{serial}")
        def mirror_stop(serial: str):
            m = self.mirrors.get(serial)
            if m:
                m.stop()
            self._stop_snap_loop(serial)
            self.ws.broadcast_sync({"type": "mirror_state", "serial": serial, "running": False})
            return {"ok": True}

        @app.post("/api/mirror/start_all")
        def mirror_start_all():
            if not self.adb:
                return {"ok": False}
            for d in list(self.adb.devices.values()):
                if d.status == "device":
                    self._ensure_mirror(d.serial)
                    m = self.mirrors.get(d.serial)
                    if m and not m.is_running:
                        m.start(d.serial)
            return {"ok": True}

        @app.post("/api/mirror/stop_all")
        def mirror_stop_all():
            for m in list(self.mirrors.values()):
                m.stop()
            return {"ok": True}

        @app.post("/api/adb/tap/{serial}")
        async def adb_tap(serial: str, body: dict):
            if self.adb:
                self.adb.tap(serial, body.get("x", 0), body.get("y", 0))
            return {"ok": True}

        @app.post("/api/adb/swipe/{serial}")
        async def adb_swipe(serial: str, body: dict):
            if self.adb:
                self.adb._adb("shell", "input", "swipe",
                               str(body["x1"]), str(body["y1"]),
                               str(body["x2"]), str(body["y2"]),
                               str(body.get("ms", 300)), serial=serial)
            return {"ok": True}

        @app.post("/api/adb/key/{serial}")
        async def adb_key(serial: str, body: dict):
            if self.adb:
                self.adb._adb("shell", "input", "keyevent",
                               body.get("code", "KEYCODE_HOME"), serial=serial)
            return {"ok": True}

        @app.post("/api/adb/open_shopee/{serial}")
        def open_shopee(serial: str):
            ok = self.adb.open_shopee(serial) if self.adb else False
            return {"ok": ok}

        @app.post("/api/wifi_connect")
        async def wifi_connect(body: dict):
            if self.adb:
                threading.Thread(
                    target=lambda: self.adb.connect_wifi(body.get("ip", "")),
                    daemon=True
                ).start()
            return {"ok": True}

        @app.post("/api/generate")
        async def generate(body: dict):
            # Accept both {products:[...]} (web/popup) and {product:{...}} (extension)
            products = body.get("products")
            if products is None:
                one = body.get("product")
                products = [one] if one else []
            products = [p for p in products if p]
            if self.worker:
                self.worker.add_products(products)
            q = len(self.worker.queue) if self.worker else 0
            # Emit individual item details so frontend can show queue
            items = [{
                "pid":        p.get("product_id", ""),
                "name":       p.get("basic_info", {}).get("name", "")[:60],
                "price":      p.get("basic_info", {}).get("price", ""),
                "commission": p.get("commission", {}).get("rate", ""),
                "status":     "pending",
            } for p in products]
            self.ws.broadcast_sync({"type": "queue_items", "items": items})
            self.ws.broadcast_sync({"type": "queue", "count": q})
            self.emit_log(f"[API] Received {len(products)} products → queue {q}")
            if self.worker:
                self.emit_stats(self.worker.done_count, self.worker.err_count, q)
            return {"ok": True, "received": len(products), "queue": q}

        @app.post("/api/pilot/start")
        async def pilot_start(body: dict):
            serial = body.get("serial", "")
            if self.worker:
                self.worker.start(serial)
            return {"ok": True}

        @app.post("/api/pilot/stop")
        async def pilot_stop():
            if self.worker:
                self.worker.stop()
            return {"ok": True}

        @app.post("/api/test/post")
        async def test_post(body: dict):
            """Dry-run the Shopee posting flow with the test video (no Veo needed)."""
            serial = body.get("serial", "")
            if not (self.adb and serial):
                return {"ok": False, "error": "no device"}

            import config as cfg
            from services.adb.autoposter import AutoPoster
            from pathlib import Path

            video = cfg.PENDING_DIR / "test_video.mp4"
            if not video.exists():
                # Auto-generate a simple 8s vertical test clip via ffmpeg
                cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
                import subprocess as _sp
                r = _sp.run(
                    ["ffmpeg", "-y", "-f", "lavfi",
                     "-i", "color=c=0x7c3aed:s=1080x1920:d=8",
                     "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "8",
                     str(video)],
                    capture_output=True, timeout=60
                )
                if not video.exists():
                    return {"ok": False,
                            "error": "สร้าง test video ไม่สำเร็จ — ตรวจสอบ ffmpeg (brew install ffmpeg)"}

            test_product = {
                "basic_info": {"name": "สินค้าทดสอบ Auto Pilot", "price": "199"},
                "commission": {"rate": "5"},
                "links": {"affiliate_link": "https://shopee.co.th/test"},
            }

            dry = body.get("dry_run", True)   # default: don't actually publish

            def _run():
                poster = AutoPoster(self.adb, log_cb=self.emit_log)
                ok = poster.process(serial, video, test_product, dry_run=dry)
                tag = "DRY RUN" if dry else "โพสต์จริง"
                self.emit_log(f"[TEST] {tag} {'สำเร็จ ✓' if ok else 'ไม่สำเร็จ ✗'}")

            threading.Thread(target=_run, daemon=True).start()
            return {"ok": True, "dry_run": dry, "message": "test started — ดู System Log"}

        # ── Generate-only (clips, no posting) ──

        @app.post("/api/gen/start")
        async def gen_start(body: dict):
            products = body.get("products", [])
            profile  = body.get("profile") or {}
            if not self.gen:
                return {"ok": False, "error": "gen worker not ready"}
            # Emit queue items so the UI can track per-product status
            items = [{
                "pid":        p.get("product_id", ""),
                "name":       p.get("basic_info", {}).get("name", "")[:60],
                "price":      p.get("basic_info", {}).get("price", ""),
                "commission": p.get("commission", {}).get("rate", ""),
                "status":     "pending",
            } for p in products]
            if items:
                self.ws.broadcast_sync({"type": "queue_items", "items": items})
            ok = self.gen.start(products, profile=profile)
            return {"ok": ok, "count": len(self.gen.queue)}

        # ── Post-all (publish every ready clip) ──

        @app.post("/api/post/start")
        async def post_all_start(body: dict):
            serial = body.get("serial", "")
            if not self.poster:
                return {"ok": False, "error": "post worker not ready"}
            ok = self.poster.start(serial)
            return {"ok": ok, "clips": len(self.poster.ready_clips())}

        @app.post("/api/post/stop")
        async def post_all_stop():
            if self.poster:
                self.poster.stop()
            return {"ok": True}

        @app.get("/api/post/status")
        def post_all_status():
            p = self.poster
            return {
                "running": p.is_running if p else False,
                "ready":   len(p.ready_clips()) if p else 0,
                "done":    p.done_count if p else 0,
                "errors":  p.err_count if p else 0,
            }

        @app.post("/api/gen/stop")
        async def gen_stop():
            if self.gen:
                self.gen.stop()
            return {"ok": True}

        @app.get("/api/gen/status")
        def gen_status():
            g = self.gen
            return {
                "running": g.is_running if g else False,
                "queue":   len(g.queue) if g else 0,
                "done":    g.done_count if g else 0,
                "errors":  g.err_count if g else 0,
            }

        # ── Generated video library ──

        @app.get("/api/videos")
        def list_videos():
            import config as cfg, json
            from pathlib import Path

            # DB เป็น source of truth: map สถานะ → โฟลเดอร์เดิมที่ frontend รู้จัก
            if self.db:
                status_folder = {GENERATED: "pending", POSTED: "done", ERROR: "error"}
                vids = []
                for st, folder in status_folder.items():
                    for j in self.db.list(st, limit=9999):
                        vp = j.get("video_path")
                        if not vp:
                            continue
                        p = Path(vp)
                        prod = j.get("product", {}) or {}
                        bi   = prod.get("basic_info", {}) or {}
                        vids.append({
                            "name":   p.name,
                            "folder": folder,
                            "size":   p.stat().st_size if p.exists() else 0,
                            "mtime":  int(p.stat().st_mtime) if p.exists() else (j.get("updated_at") or 0),
                            "url":    f"/video/{folder}/{p.name}",
                            "product":    j.get("name") or bi.get("name", ""),
                            "price":      bi.get("price", ""),
                            "commission": (prod.get("commission", {}) or {}).get("rate", ""),
                            "status":     st,
                        })
                vids.sort(key=lambda v: v["mtime"], reverse=True)
                return {"videos": vids}

            # ── legacy folder scan (db ไม่พร้อม) ──
            vids = []
            for label, d in [("pending", cfg.PENDING_DIR),
                             ("done", cfg.DONE_DIR),
                             ("error", cfg.ERROR_DIR)]:
                if not d.exists():
                    continue
                for f in sorted(d.glob("*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True):
                    meta = {}
                    side = f.with_suffix(".json")
                    if side.exists():
                        try:
                            meta = json.loads(side.read_text(encoding="utf-8"))
                        except Exception:
                            meta = {}
                    vids.append({
                        "name":   f.name,
                        "folder": label,
                        "size":   f.stat().st_size,
                        "mtime":  int(f.stat().st_mtime),
                        "url":    f"/video/{label}/{f.name}",
                        "product":    meta.get("name", ""),
                        "price":      meta.get("price", ""),
                        "commission": meta.get("commission", ""),
                        "status":     meta.get("status", ""),
                    })
            return {"videos": vids}

        @app.get("/video/{folder}/{name}")
        def serve_video(folder: str, name: str):
            import config as cfg
            dirs = {"pending": cfg.PENDING_DIR, "done": cfg.DONE_DIR, "error": cfg.ERROR_DIR}
            d = dirs.get(folder)
            # Prevent path traversal
            if not d or "/" in name or ".." in name:
                return JSONResponse({"error": "bad path"}, status_code=400)
            path = d / name
            if not path.exists():
                return JSONResponse({"error": "not found"}, status_code=404)
            from fastapi.responses import FileResponse
            return FileResponse(str(path), media_type="video/mp4",
                                headers={"Access-Control-Allow-Origin": "*"})

        @app.get("/api/settings")
        def get_settings():
            import config as cfg
            return cfg.public_load()   # secrets masked — never sent to browser

        @app.post("/api/settings")
        async def save_settings(body: dict):
            import config as cfg
            cfg.save(body)             # strips secrets; masked values are ignored
            # Re-load with real secrets from .env so workers never get a masked key
            settings = cfg.load()
            if self.worker: self.worker.settings = settings
            if self.gen:    self.gen.settings    = settings
            if self.poster: self.poster.settings = settings
            return {"ok": True}

        # ── AI video: list models / test generation ──

        @app.get("/api/video/models")
        def video_models():
            """List Veo + Gemini models the configured Google key can access."""
            import config as cfg
            key = cfg.load().get("google_api_key", "")
            if not key:
                return {"ok": False, "error": "ยังไม่ได้ใส่ Google API Key"}
            try:
                from google import genai
                client = genai.Client(api_key=key)
                veo, gem = [], []
                for m in client.models.list():
                    name = (m.name or "").replace("models/", "")
                    if "veo" in name:
                        veo.append(name)
                    elif "gemini" in name and "embedding" not in name:
                        gem.append(name)
                return {"ok": True, "veo": sorted(set(veo)), "gemini": sorted(set(gem))}
            except Exception as e:
                return {"ok": False, "error": str(e)}

        @app.post("/api/video/test")
        async def video_test(body: dict):
            """Generate ONE test video from a sample (or first queued) product."""
            import config as cfg
            settings = cfg.load()
            if not settings.get("google_api_key"):
                return {"ok": False, "error": "ยังไม่ได้ใส่ Google API Key"}

            # Use first queued product if available, else a sample
            product = None
            if self.worker and self.worker.queue:
                product = self.worker.queue[0]
            if not product:
                product = {
                    "product_id": "test",
                    "basic_info": {"name": "หูฟังบลูทูธ ไร้สาย กันน้ำ", "price": "299", "sold_count": "1.2k"},
                    "commission": {"rate": "8"},
                    "images": ["https://down-th.img.susercontent.com/file/sg-11134201-7rbk5-lmxxxxxx"],
                    "images_b64": [],
                }

            def _run():
                from services.video_generator import VideoGenerator
                gen = VideoGenerator(google_key=settings["google_api_key"], settings=settings)
                gen.log = self.emit_log
                path = gen.process(product)
                if path:
                    self.emit_log(f"[VDO-TEST] สำเร็จ ✓ → {path.name}")
                else:
                    self.emit_log("[VDO-TEST] ไม่สำเร็จ ✗ — ดู error ด้านบน")

            threading.Thread(target=_run, daemon=True).start()
            return {"ok": True, "message": "เริ่มสร้างวิดีโอทดสอบ — ดู System Log"}

        # ── Google Flow pipeline (extension เป็นคนสร้างวิดีโอในเบราว์เซอร์) ──

        def _flow_prompt(product: dict) -> str:
            """ขอ Gemini เขียน prompt ภาษาไทยจากรูปสินค้า (ถ้าไม่มี key/รูป → fallback)."""
            import config as cfg, base64
            settings = cfg.load()
            key = settings.get("google_api_key", "")
            name = product.get("basic_info", {}).get("name", "สินค้า")
            dur  = settings.get("duration", 8)
            fallback = (f"สร้างวิดีโอโฆษณาแนวตั้ง 9:16 ความยาว {dur} วินาที ของ {name} "
                        f"กล้องค่อยๆ ซูมเข้า แสงสตูดิโอ สไตล์โฆษณาสินค้า")
            if not key:
                return fallback
            try:
                img_bytes, mime = None, None
                b64s = product.get("images_b64") or []
                if b64s:
                    raw = b64s[0].split(",", 1)[-1]
                    img_bytes = base64.b64decode(raw)
                    mime = "image/jpeg"
                from services.video_generator import VideoGenerator
                gen = VideoGenerator(google_key=key, settings=settings)
                gen.log = self.emit_log
                # prompt เดียวคุณภาพสูง ระบุ 20 วิ → agent แบ่งเอง ~2 คลิป → ต่อที่ desktop
                return gen.generate_prompt(product, img_bytes, mime, target="flow") or fallback
            except Exception as e:
                self.emit_log(f"[FLOW] เขียน prompt ไม่สำเร็จ: {e}")
                return fallback

        @app.post("/api/flow/enqueue")
        async def flow_enqueue(body: dict):
            products = body.get("products") or ([body["product"]] if body.get("product") else [])
            products = [p for p in products if p]
            if self.db:
                added = self.db.add_many(products)          # deduped, persistent
                q = self.db.count(QUEUED)
                self.emit_log(f"[FLOW] เข้าคิว {added} ชิ้น (รอสร้าง: {q})")
                return {"ok": True, "queued": q, "added": added}
            # fallback (db ไม่พร้อม)
            self.flow_queue.extend(products)
            self.emit_log(f"[FLOW] เข้าคิว {len(products)} ชิ้น (รอสร้าง: {len(self.flow_queue)})")
            return {"ok": True, "queued": len(self.flow_queue)}

        def _flow_payload(product: dict, remaining: int, job_id=None) -> dict:
            prompt = _flow_prompt(product)        # prompt เดียว ระบุ 20 วิ → agent แบ่งเอง
            return {
                "ok": True,
                "empty": False,
                "remaining": remaining,
                "job_id": job_id,
                "product": {
                    "product_id": product.get("product_id", ""),
                    "name":       product.get("basic_info", {}).get("name", ""),
                    "price":      product.get("basic_info", {}).get("price", ""),
                    "sold":       product.get("basic_info", {}).get("sold_count", ""),
                    "commission": product.get("commission", {}).get("rate", ""),
                    # ตะกร้า: affiliate_link ก่อน ถ้าไม่มีใช้ product_url
                    "link": (product.get("links", {}).get("affiliate_link")
                             or product.get("links", {}).get("product_url") or ""),
                    "images":     product.get("images", []),
                    "images_b64": product.get("images_b64", []),
                },
                "prompt": prompt,
            }

        @app.get("/api/flow/next")
        def flow_next():
            """extension ดึงงานถัดไป — ได้สินค้า + prompt ภาษาไทยพร้อมป้อน Flow."""
            if self.db:
                # คุมงบ (A1.4): งบเดือนนี้เต็ม → ไม่แจกงานสร้าง (หยุดเอง)
                if self.budget and not self.budget.can_generate():
                    if not self._budget_blocked:
                        self._budget_blocked = True
                        snap = self.budget.snapshot()
                        self.emit_log(f"[BUDGET] งบเดือนนี้เต็ม (ใช้ {snap['spent']}/{snap['budget']} บาท) "
                                      f"— หยุดสร้างชั่วคราว")
                        self.ws.broadcast_sync({"type": "budget_exceeded", **snap})
                    return {"ok": True, "empty": True, "budget_exceeded": True}
                self._budget_blocked = False
                # คิว DB ว่าง → ดูดสินค้าที่ดูดมา (worker.queue) เข้า DB ก่อน (persistent)
                if self.db.count(QUEUED) == 0 and self.worker and getattr(self.worker, "queue", None):
                    moved = self.db.add_many(list(self.worker.queue))
                    self.worker.queue.clear()
                    if moved:
                        self.emit_log(f"[FLOW] ดึงจากคิวสินค้าที่ดูดมา {moved} ชิ้น")
                job = self.db.claim(QUEUED, GENERATING)   # atomic: queued → generating
                if not job:
                    return {"ok": True, "empty": True}
                return _flow_payload(job["product"], self.db.count(QUEUED), job["id"])
            # ── legacy fallback (db ไม่พร้อม) ──
            if not self.flow_queue and self.worker and getattr(self.worker, "queue", None):
                self.flow_queue.extend(list(self.worker.queue))
                self.worker.queue.clear()
                self.emit_log(f"[FLOW] ดึงจากคิวสินค้าที่ดูดมา {len(self.flow_queue)} ชิ้น")
            if not self.flow_queue:
                return {"ok": True, "empty": True}
            product = self.flow_queue.pop(0)
            return _flow_payload(product, len(self.flow_queue))

        @app.post("/api/flow/prompt")
        async def flow_prompt_ep(body: dict):
            product = body.get("product") or body
            return {"ok": True, "prompt": _flow_prompt(product)}

        @app.post("/api/flow/video")
        async def flow_video(body: dict):
            """รับวิดีโอที่ extension สร้างเสร็จ → เซฟลง pending + sidecar(link) พร้อมโพสต์.
            รองรับหลายคลิป (files[]) → ต่อด้วย ffmpeg เป็นไฟล์เดียว (เช่น 2×10วิ = 20วิ)."""
            import config as cfg, base64, json, shutil, subprocess, time as _t
            from pathlib import Path

            pid = body.get("product_id") or f"flow{int(_t.time()*1000)}"
            cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
            out_mp4 = cfg.PENDING_DIR / f"{pid}.mp4"
            dl_dir = Path.home() / "Downloads" / "flow"

            # รวมรายชื่อไฟล์ (รองรับทั้ง files[] ใหม่ และ filename เดี่ยวแบบเก่า)
            files = body.get("files") or ([body["filename"]] if body.get("filename") else [])

            if body.get("video_b64"):
                raw = body["video_b64"].split(",", 1)[-1]
                out_mp4.write_bytes(base64.b64decode(raw))
            elif not files:
                return {"ok": False, "error": "ไม่มีไฟล์วิดีโอ"}
            else:
                srcs = [dl_dir / f for f in files]
                missing = [str(s) for s in srcs if not s.exists()]
                if missing:
                    return {"ok": False, "error": f"ไม่พบไฟล์: {missing}"}
                if len(srcs) == 1:
                    shutil.move(str(srcs[0]), str(out_mp4))   # ย้ายเข้าโปรเจ็กต์ (ลบตัวใน Downloads)
                else:
                    # ต่อหลายคลิปด้วย ffmpeg concat demuxer
                    listf = cfg.PENDING_DIR / f"{pid}_list.txt"
                    listf.write_text("".join(f"file '{s}'\n" for s in srcs), encoding="utf-8")
                    r = subprocess.run(
                        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listf),
                         "-c", "copy", str(out_mp4)],
                        capture_output=True, timeout=120)
                    if not out_mp4.exists():  # ถ้า copy ไม่ได้ (codec ต่าง) → re-encode
                        r = subprocess.run(
                            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listf),
                             "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", str(out_mp4)],
                            capture_output=True, timeout=300)
                    listf.unlink(missing_ok=True)
                    if not out_mp4.exists():
                        return {"ok": False, "error": f"ต่อคลิปไม่สำเร็จ: {r.stderr.decode()[-200:]}"}
                    for s in srcs:                       # ลบคลิปย่อยใน Downloads หลังต่อเสร็จ
                        try: s.unlink()
                        except Exception: pass
                    self.emit_log(f"[FLOW] ต่อ {len(srcs)} คลิป → {out_mp4.name}")

            sidecar = {
                "video":      out_mp4.name,
                "product_id": pid,
                "name":       body.get("name", ""),
                "price":      body.get("price", ""),
                "sold_count": body.get("sold", ""),
                "commission": body.get("commission", ""),
                "link":       body.get("link", ""),   # ← ตะกร้า (affiliate/product_url)
                "engine":     "flow",
                "created_at": int(_t.time()),
                "status":     "ready",
            }
            out_mp4.with_suffix(".json").write_text(
                json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")

            # อัปเดต DB: งานนี้สร้างคลิปเสร็จแล้ว → generated (พร้อมโพสต์) + บันทึกต้นทุน
            if self.db:
                job = self.db.get_by_product(pid)
                if job:
                    jid = job["id"]
                    self.db.update(jid, status=GENERATED,
                                   video_path=str(out_mp4), caption=sidecar["name"])
                else:
                    # คลิปที่ไม่ได้ผ่าน /flow/next (เช่นส่งมาตรง) → สร้าง record ใหม่
                    jid = self.db.import_clip({
                        "product_id": pid,
                        "basic_info": {"name": sidecar["name"], "price": sidecar["price"],
                                       "sold_count": sidecar["sold_count"]},
                        "commission": {"rate": sidecar["commission"]},
                        "links": {"affiliate_link": sidecar["link"]},
                    }, GENERATED, str(out_mp4))
                # บันทึกต้นทุนต่อคลิป (A1.4) — สะสมยอดใช้จ่ายเดือนนี้
                cost = self.budget.cost_per_clip() if self.budget else 0
                if jid and cost:
                    self.db.add_cost(jid, cost)

            self.emit_log(f"[FLOW] รับวิดีโอ {pid} → pending (link={'มี' if sidecar['link'] else 'ไม่มี!'})")
            self.ws.broadcast_sync({"type": "flow_video", "pid": pid, "name": sidecar["name"]})
            ready = len(self.poster.ready_clips()) if self.poster else 0
            return {"ok": True, "pid": pid, "ready": ready}

        @app.get("/api/flow/status")
        def flow_status():
            q = self.db.count(QUEUED) if self.db else len(self.flow_queue)
            out = {"ok": True, "queued": q}
            if self.budget:
                out["budget"] = self.budget.snapshot()
            return out

        # ── Logs + diagnostics (A1.8) ──

        @app.get("/api/logs")
        def get_logs(level: str = None, source: str = None,
                     limit: int = 200, since_id: int = 0):
            if not self.db:
                return {"logs": [], "stats": {}}
            return {"logs":  self.db.list_logs(level, source, limit, since_id),
                    "stats": self.db.log_stats()}

        @app.post("/api/logs/clear")
        def clear_logs():
            if self.db:
                self.db.clear_logs()
            return {"ok": True}

        @app.get("/api/diagnostics")
        def diagnostics():
            devices = []
            if self.adb:
                for d in self.adb.devices.values():
                    devices.append({"serial": d.serial, "model": d.model,
                                    "status": d.status, "battery": d.battery})
            return {
                "ok":         True,
                "db":         str(getattr(self.db, "path", "")) if self.db else None,
                "uptime_sec": int(time.time() - self._started_at) if self._started_at else 0,
                "devices":    devices,
                "workers": {
                    "pilot":  bool(self.worker and self.worker.is_running),
                    "gen":    bool(self.gen and self.gen.is_running),
                    "poster": bool(self.poster and self.poster.is_running),
                },
                "jobs":       self.db.stats() if self.db else None,
                "budget":     self.budget.snapshot() if self.budget else None,
                "logs":       self.db.log_stats() if self.db else {},
                "last_error": self.db.last_error() if self.db else None,
            }

        # ── Snapshot (pre-capture cache — responds instantly) ──

        @app.get("/snapshot/{serial}")
        async def snapshot(serial: str):
            if not self.adb:
                return JSONResponse({"error": "no adb"}, status_code=503)
            self._ensure_snap_loop(serial)
            state = self._snap_cache.get(serial)
            if state:
                with state['lock']:
                    data = state['jpeg']
                if data:
                    return Response(
                        content=data, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache, no-store",
                                 "Access-Control-Allow-Origin": "*"}
                    )
            # First request — wait for initial frame
            loop_ev = asyncio.get_running_loop()
            data = await loop_ev.run_in_executor(None, self.adb.fast_screenshot, serial)
            if not data:
                return JSONResponse({"error": "screenshot failed — check System Log"}, status_code=503)
            if serial in self._snap_cache:
                with self._snap_cache[serial]['lock']:
                    self._snap_cache[serial]['jpeg'] = data
            return Response(
                content=data, media_type="image/jpeg",
                headers={"Cache-Control": "no-cache, no-store",
                         "Access-Control-Allow-Origin": "*"}
            )

        @app.get("/debug/snapshot/{serial}")
        async def debug_snapshot(serial: str):
            import os, sys, subprocess as sp
            results: dict = {"serial": serial, "adb_ready": bool(self.adb),
                             "python": sys.executable}
            if not self.adb:
                return JSONResponse(results)
            ok, msg = self.adb._adb("shell", "screencap", "-p", "/sdcard/screen_web.png",
                                     serial=serial, timeout=12)
            results["screencap_ok"]  = ok
            results["screencap_msg"] = msg
            if ok:
                r = sp.run(["adb", "-s", serial, "pull", "/sdcard/screen_web.png",
                             "/tmp/screen_web.png"], capture_output=True, timeout=12)
                results["pull_ok"]     = r.returncode == 0
                results["pull_stderr"] = r.stderr.decode(errors="ignore").strip()
                if r.returncode == 0:
                    results["file_bytes"] = os.path.getsize("/tmp/screen_web.png")
                    try:
                        from PIL import Image
                        import io as _io
                        with Image.open("/tmp/screen_web.png") as img:
                            mode = img.mode
                            if img.mode in ("RGBA", "LA", "P"):
                                img = img.convert("RGB")
                            img2 = img.resize((540, int(img.height * 540 / img.width)),
                                              Image.LANCZOS)
                            buf = _io.BytesIO()
                            img2.save(buf, format="JPEG", quality=80)
                            results["pil_ok"]       = True
                            results["pil_mode"]     = mode
                            results["jpeg_bytes"]   = len(buf.getvalue())
                    except Exception as e:
                        results["pil_ok"]    = False
                        results["pil_error"] = str(e)
            return JSONResponse(results)

        # ── MJPEG stream ──

        @app.get("/stream/{serial}")
        async def stream(serial: str):
            self._ensure_mirror(serial)
            m = self.mirrors.get(serial)
            if m and not m.is_running:
                m.start(serial)

            async def generate():
                import queue as Q
                loop = asyncio.get_running_loop()
                while True:
                    try:
                        # Block until next frame arrives (up to 500ms)
                        frame = await loop.run_in_executor(
                            None, lambda: m._frame_queue.get(timeout=0.5)
                        )
                        yield (b"--frame\r\n"
                               b"Content-Type: image/jpeg\r\n\r\n" +
                               frame + b"\r\n")
                    except (Q.Empty, Exception):
                        if not (m and m.is_running):
                            break

            return StreamingResponse(
                generate(),
                media_type="multipart/x-mixed-replace; boundary=frame",
                headers={"Cache-Control": "no-cache",
                         "Access-Control-Allow-Origin": "*"}
            )

        # ── WebSocket ──

        @app.websocket("/ws")
        async def websocket_endpoint(ws: WebSocket):
            await self.ws.connect(ws)
            try:
                while True:
                    data = await ws.receive_text()
                    msg = json.loads(data)
                    await self._handle_ws_message(msg, ws)
            except WebSocketDisconnect:
                await self.ws.disconnect(ws)
            except Exception:
                await self.ws.disconnect(ws)

        return app

    async def _handle_ws_message(self, msg: dict, ws: WebSocket):
        t = msg.get("type")
        if t == "ping":
            await ws.send_text(json.dumps({"type": "pong"}))

    # ── Pre-capture loop ──────────────────────────────────────

    def _ensure_snap_loop(self, serial: str):
        """Start a background thread that continuously screenshots the device."""
        if serial in self._snap_cache and self._snap_cache[serial]['active']:
            return
        state = {'jpeg': None, 'active': True, 'lock': threading.Lock()}
        self._snap_cache[serial] = state

        def _loop():
            while state['active'] and self.adb:
                jpeg = self.adb.fast_screenshot(serial)
                if jpeg:
                    with state['lock']:
                        state['jpeg'] = jpeg

        threading.Thread(target=_loop, daemon=True, name=f"snap-{serial}").start()

    def _stop_snap_loop(self, serial: str):
        state = self._snap_cache.pop(serial, None)
        if state:
            state['active'] = False

    # ── Mirror management ─────────────────────────────────────

    def _ensure_mirror(self, serial: str):
        if serial not in self.mirrors and self.adb:
            from services.adb.mirror import ScreenMirror
            m = ScreenMirror(self.adb)
            self.mirrors[serial] = m

    # ── Broadcast helpers (call from threads) ─────────────────

    def emit_log(self, msg: str, level: str = None, source: str = None):
        lvl = level or _classify_level(msg)
        src = source if source is not None else _source_of(msg)
        if self.db:
            try:
                self.db.add_log(msg, lvl, src)        # เก็บถาวร (A1.8)
            except Exception:
                pass
        self.ws.broadcast_sync({"type": "log", "msg": msg, "level": lvl, "source": src})

    def emit_devices(self, devices: list):
        self.ws.broadcast_sync({"type": "devices", "devices": devices})

    def emit_stats(self, done: int, errors: int, queue: int):
        self.ws.broadcast_sync({
            "type": "stats", "done": done, "errors": errors, "queue": queue
        })

    def emit_worker_status(self, pid: str, status: str):
        self.ws.broadcast_sync({"type": "worker_status", "pid": pid, "status": status})

    def emit_video_ready(self, pid: str, filename: str):
        self.ws.broadcast_sync({"type": "video_ready", "pid": pid, "file": filename})

    def emit_gen_progress(self, pid: str, stage: str, detail: str):
        self.ws.broadcast_sync({"type": "gen_progress", "pid": pid,
                                "stage": stage, "detail": detail})

    # ── Start/Stop ────────────────────────────────────────────

    def start(self):
        self._started_at = time.time()

        async def _run():
            self._loop = asyncio.get_running_loop()
            self.ws._loop = self._loop
            config = uvicorn.Config(
                self.app, host="0.0.0.0", port=self.port,
                log_level="error"
            )
            server = uvicorn.Server(config)
            await server.serve()

        self._thread = threading.Thread(
            target=lambda: asyncio.run(_run()),
            daemon=True, name="WebServer"
        )
        self._thread.start()
        self.log(f"[WEB] Server → http://localhost:{self.port}")
        self.log(f"[WEB] Next.js UI → http://localhost:3000")

    def stop(self):
        pass
