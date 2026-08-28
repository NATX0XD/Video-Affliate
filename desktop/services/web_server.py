"""
FastAPI web server — REST + WebSocket + MJPEG stream
Replaces the old HTTPServer-based APIServer for web UI integration
"""
import asyncio
import io
import json
import re
import secrets
import threading
import time
from typing import Optional, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Request
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
        self.db     = None        # JobStore (A1.2) — persistent flow queue
        self.budget = None        # BudgetGuard (A1.4)
        self.autopilot = None     # AutoPilot loop (auto-post)
        self._budget_blocked = False   # throttle log เตือนงบเต็ม
        self.mirrors: dict = {}   # serial → ScreenMirror (MJPEG เดิม — ใช้เป็น fallback)
        self.scrcpy = None        # ScrcpyManager (H.264 ดีเลย์ต่ำ) — สร้างเมื่อใช้ครั้งแรก

        # Pre-capture cache: background thread continuously screenshots each device
        # so /snapshot requests respond immediately (<10ms) with the latest frame
        self._snap_cache: dict = {}   # serial → {'jpeg': bytes|None, 'active': bool, 'lock': Lock}

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._started_at: Optional[float] = None   # uptime (A1.8)
        self._last_ext_ping: float = 0.0           # เวลาที่ extension ติดต่อล่าสุด (P2.1) — onboarding เช็ค "เชื่อมแล้ว"

        # Shared session token — สร้างใหม่ทุกครั้งที่เปิดโปรแกรม (in-memory เท่านั้น ไม่เขียนดิสก์).
        # extension ขอ token นี้ผ่าน /api/flow/config แล้วแนบใน header เวลาเรียก proxy sensitive
        # (แทนการรับ google_api_key ดิบ → key ไม่หลุดออกนอกเครื่อง).
        self.api_token: str = secrets.token_urlsafe(24)

        self.app = self._build_app()

    # ── App builder ───────────────────────────────────────────

    def _build_app(self) -> FastAPI:
        app = FastAPI(title="VDO Gen Auto Pilot API")

        # CORS: จำกัดเฉพาะหน้าเว็บ local (localhost/127.0.0.1 :3000/:3001) + extension
        # (chrome-extension://) — กันหน้าเว็บอื่นในเครื่องอ่าน API/ยิง proxy ได้ (เดิม "*" = ใครก็อ่านได้)
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=r"^(https?://(localhost|127\.0\.0\.1):(3000|3001)|chrome-extension://.*)$",
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # HTML shell = no-store → Chrome ไม่ cache หน้าเก่า (เดิมอัปเวอร์ชันแล้วยังเห็นหน้าเก่า/setup ไม่ขึ้น)
        # ไฟล์ JS/CSS ของ Next มี hash ในชื่อ (เปลี่ยนทุก build) → cache ได้ ไม่ต้องแตะ
        @app.middleware("http")
        async def _no_cache_html(request, call_next):
            resp = await call_next(request)
            if resp.headers.get("content-type", "").startswith("text/html"):
                resp.headers["Cache-Control"] = "no-store, must-revalidate"
            return resp

        # ── REST endpoints ──

        @app.get("/api/status")
        def status():
            devices = []
            if self.adb:
                import time as _t
                now = _t.time()
                for d in self.adb.devices.values():
                    cooling = bool(d.cooldown_reason)
                    activity = ("offline"  if d.status != "device" else
                                "cooldown" if cooling else
                                "posting"  if d.posting else "idle")
                    devices.append({
                        "serial":  d.serial,
                        "model":   d.model,
                        "brand":   getattr(d, "brand", ""),   # ยี่ห้อ (E)
                        "android": d.android,
                        "battery": d.battery,
                        "temp":    d.temp,            # °C อุณหภูมิแบต (E)
                        "charging": d.charging,       # กำลังชาร์จ (E)
                        "ram_total": d.ram_total,     # MB (E)
                        "ram_used":  d.ram_used,      # MB (E)
                        "storage_total": d.storage_total,  # GB (E)
                        "storage_free":  d.storage_free,   # GB (E)
                        "net":     d.net,             # wifi|mobile|offline (E)
                        "status":  d.status,
                        "activity": activity,         # idle|posting|cooldown|offline (E)
                        "cooldown": cooling,
                        "cooldown_reason": d.cooldown_reason,   # hot|battery
                        "cooldown_remaining": (max(0, int(d.cooldown_until - now))
                                               if d.cooldown_reason == "hot" else 0),
                        "label":   (self.db.get_config(f"dev_label:{d.serial}", "") if self.db else ""),
                        "platforms": ([p for p in (self.db.get_config(f"dev_platforms:{d.serial}", "") or "").split(",") if p]
                                      if self.db else []),
                        "streaming": d.serial in self.mirrors and
                                     self.mirrors[d.serial].is_running,
                    })
            running = bool(self.autopilot and self.autopilot.enabled)
            ext = self._extension_state()
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
                    "extension":     ext,               # {connected, last_ping_ts} (P2.1)
                    "jobs":          self.db.stats(),   # breakdown ละเอียดสำหรับค็อกพิต
                    "budget":        self.budget.snapshot() if self.budget else None,
                    "token":         self.api_token,    # ให้หน้าเว็บ/extension แนบเวลาเรียก proxy
                }
            return {
                "devices":    devices,
                "queue":      0,
                "done":       0,
                "errors":     0,
                "pilot_running": running,
                "extension":  ext,
                "token":      self.api_token,
            }

        @app.post("/api/scan")
        def scan():
            if not self.adb:
                return {"devices": []}
            devs = self.adb.scan()
            result = [{"serial": d.serial, "model": d.model,
                       "brand": getattr(d, "brand", ""),
                       "android": d.android, "battery": d.battery,
                       "temp": d.temp, "charging": d.charging,
                       "status": d.status} for d in devs]
            self.ws.broadcast_sync({"type": "devices", "devices": result})
            return {"devices": result}

        @app.get("/api/devices")
        def list_devices():
            """รายการมือถือที่ต่ออยู่ตอนนี้ + รุ่น/ยี่ห้อ — ให้หน้าเว็บดูว่าเจอเครื่องอะไรบ้าง."""
            devs = []
            if self.adb:
                for d in self.adb.devices.values():
                    devs.append({
                        "serial":  d.serial,
                        "model":   d.model,
                        "brand":   getattr(d, "brand", ""),
                        "android": d.android,
                        "battery": d.battery,
                        "status":  d.status,
                    })
            return {"devices": devs}

        @app.post("/api/devices/{serial}/label")
        async def set_device_label(serial: str, body: dict):
            if self.db:
                self.db.set_config(f"dev_label:{serial}", (body.get("label") or "").strip())
            return {"ok": True}

        @app.post("/api/devices/{serial}/platforms")
        async def set_device_platforms(serial: str, body: dict):
            if self.db:
                plats = [p for p in (body.get("platforms") or []) if p]
                self.db.set_config(f"dev_platforms:{serial}", ",".join(plats))
            return {"ok": True}

        # ── พิกัดโพสต์ต่อเครื่อง (calibrate) — override ตายตัวของ AutoPoster ──
        # additive: ไม่มี override ที่เซฟ → poster ใช้พิกัดเดิม 100%
        def _post_coords_defaults():
            from services.adb.autoposter import AutoPoster
            defaults = {k: [rx, ry] for k, (rx, ry) in AutoPoster.R.items()}
            keys = [{"key": k, "label": AutoPoster.LABELS.get(k, k)} for k in AutoPoster.R]
            return defaults, keys

        def _saved_coords(serial: str, key: str = "post_coords") -> dict:
            if not self.db:
                return {}
            raw = self.db.get_config(f"{key}:{serial}", "") or ""
            if not raw.strip():
                return {}
            try:
                d = json.loads(raw)
                return d if isinstance(d, dict) else {}
            except Exception:
                return {}

        def _device_resolution(serial: str):
            """(w,h) ของเครื่อง — จาก device attr ถ้ามี ไม่งั้น query wm size. คืน (None,None) ถ้าไม่รู้."""
            d = self.adb.devices.get(serial) if self.adb else None
            w = getattr(d, "phoneW", None)
            h = getattr(d, "phoneH", None)
            if not (w and h) and self.adb and d and getattr(d, "status", "") == "device":
                ok, out = self.adb._adb("shell", "wm", "size", serial=serial)
                m = re.search(r"(\d+)x(\d+)", out) if ok else None
                if m:
                    w, h = int(m.group(1)), int(m.group(2))
            return (w, h) if (w and h) else (None, None)

        @app.get("/api/devices/{serial}/coords")
        def get_device_coords(serial: str):
            from services.autopilot import _preset_coords
            defaults, keys = _post_coords_defaults()
            coords = _saved_coords(serial)                          # ผู้ใช้คาลิเบรตเอง
            auto   = _saved_coords(serial, "post_coords_auto")      # ระบบจำจากหน้าจอจริงตอนโพสต์
            preset = _preset_coords(serial) or {}                   # preset ที่มากับโค้ด
            # ค่าที่ใช้จริง = ซ้อนจากอ่อนไปแรง (ตรงกับ AutoPilot._coords_override)
            effective = {**preset, **auto, **coords}
            source = "db" if coords else ("auto" if auto else ("preset" if preset else "default"))
            w, h = _device_resolution(serial)
            is_tablet = False
            if w and h:
                aspect = max(w, h) / min(w, h)
                is_tablet = aspect < 1.9   # มือถือ ~2.16 · แท็บเล็ต ~1.6 (4:3/16:10)
            return {
                "ok": True,
                "coords": effective,                        # ค่าที่ใช้จริง (ผู้ใช้ > จำเอง > preset)
                "defaults": defaults,
                "keys": keys,
                "calibrated": bool(effective),              # มี preset/จำเองก็ถือว่าคาลิเบรตแล้ว
                "source": source,                           # db | auto | preset | default
                "auto_learned": len(auto),                  # ระบบจำเองได้กี่จุดจาก 18
                "resolution": [w, h] if (w and h) else None,
                "is_tablet": is_tablet,
            }

        @app.post("/api/devices/{serial}/coords")
        def set_device_coords(serial: str, body: dict):
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            defaults, _ = _post_coords_defaults()
            incoming = (body or {}).get("coords") or {}
            if not isinstance(incoming, dict):
                return {"ok": False, "error": "coords ต้องเป็น object {key:[rx,ry]}"}
            clean = {}
            for k, v in incoming.items():
                if k not in defaults:
                    return {"ok": False, "error": f"key ไม่ถูกต้อง: {k}"}
                # รับ 2 shape: [rx,ry] (array) หรือ {rx,ry} (object) → เก็บเป็น [rx,ry]
                if isinstance(v, dict):
                    rxv, ryv = v.get("rx"), v.get("ry")
                elif isinstance(v, (list, tuple)) and len(v) == 2:
                    rxv, ryv = v[0], v[1]
                else:
                    return {"ok": False, "error": f"{k}: ต้องเป็น [rx,ry] หรือ {{rx,ry}}"}
                try:
                    rx, ry = float(rxv), float(ryv)
                except (TypeError, ValueError):
                    return {"ok": False, "error": f"{k}: rx,ry ต้องเป็นตัวเลข"}
                if not (0.0 <= rx <= 1.0 and 0.0 <= ry <= 1.0):
                    return {"ok": False, "error": f"{k}: rx,ry ต้องอยู่ 0..1"}
                clean[k] = [rx, ry]
            merged = {**_saved_coords(serial), **clean}   # merge กับที่เซฟไว้
            self.db.set_config(f"post_coords:{serial}", json.dumps(merged, ensure_ascii=False))
            return {"ok": True}

        @app.delete("/api/devices/{serial}/coords")
        def delete_device_coords(serial: str):
            if self.db:
                self.db.set_config(f"post_coords:{serial}", "")
            return {"ok": True}

        # ── ชุดพิกัดที่บันทึกไว้ (ใช้ซ้ำข้ามเครื่องรุ่นเดียวกัน) ──────────────
        # builtin = ชุดที่มากับโปรแกรม (แยกตามความละเอียดจอ) · saved = ที่ผู้ใช้บันทึกเอง
        def _coord_sets() -> dict:
            if not self.db:
                return {}
            raw = self.db.get_config("coord_sets", "") or ""
            try:
                d = json.loads(raw) if raw.strip() else {}
                return d if isinstance(d, dict) else {}
            except Exception:
                return {}

        @app.get("/api/coords/presets")
        def list_coord_presets():
            from services.adb.autoposter import AutoPoster
            builtin = [
                {"id": f"builtin:{w}x{h}", "name": f"จอ {w}×{h} (มากับโปรแกรม)",
                 "coords": {k: list(v) for k, v in c.items()}, "builtin": True}
                for (w, h), c in AutoPoster.R_PRESETS.items()
            ]
            saved = [{"id": f"saved:{n}", "name": n, "coords": c, "builtin": False}
                     for n, c in _coord_sets().items()]
            return {"ok": True, "presets": builtin + saved}

        @app.post("/api/coords/presets")
        async def save_coord_preset(body: dict):
            """บันทึกชุดพิกัดปัจจุบันไว้ใช้กับเครื่องอื่น — {name, coords}"""
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            name = (body.get("name") or "").strip()
            coords = body.get("coords")
            if not name:
                return {"ok": False, "error": "ยังไม่ได้ตั้งชื่อชุดพิกัด"}
            if not isinstance(coords, dict) or not coords:
                return {"ok": False, "error": "ยังไม่มีพิกัดให้บันทึก"}
            sets = _coord_sets()
            replaced = name in sets
            sets[name] = coords
            self.db.set_config("coord_sets", json.dumps(sets, ensure_ascii=False))
            return {"ok": True, "replaced": replaced}

        @app.delete("/api/coords/presets/{name}")
        def delete_coord_preset(name: str):
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            sets = _coord_sets()
            sets.pop(name, None)
            self.db.set_config("coord_sets", json.dumps(sets, ensure_ascii=False))
            return {"ok": True}

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

        @app.post("/api/wifi_connect")
        async def wifi_connect(body: dict):
            # เชื่อม Wi-Fi แบบคืนผลจริง (เลิก fire-and-forget) — onboarding รู้ผลทันที
            if not self.adb:
                return {"ok": False, "error": "ระบบยังไม่พร้อม"}
            host = (body.get("ip") or body.get("host") or "").strip()
            if not host:
                return {"ok": False, "error": "กรอกที่อยู่ (IP) ของมือถือก่อน"}
            ok, msg = self.adb.connect_wifi(host)
            if ok:
                self.adb.scan()   # อัปเดตรายชื่อเครื่องทันที
            return {"ok": ok, "message": msg,
                    "error": "" if ok else self.adb._friendly_adb_error(msg)}

        @app.post("/api/adb/tcpip")
        async def adb_tcpip(body: dict):
            """เปิดโหมดเชื่อมมือถือผ่าน Wi-Fi — สั่งบนเครื่องที่เสียบสาย USB อยู่ (ต้องรู้ serial)."""
            if not self.adb:
                return {"ok": False, "error": "ระบบยังไม่พร้อม"}
            serial = (body.get("serial") or "").strip()
            if not serial:
                return {"ok": False, "error": "ยังไม่รู้ว่าจะสั่งเครื่องไหน — เสียบสาย USB ก่อน"}
            port = int(body.get("port", 5555) or 5555)
            ok, msg = self.adb.tcpip(serial, port)
            return {"ok": ok, "message": msg,
                    "error": "" if ok else self.adb._friendly_adb_error(msg)}

        @app.post("/api/adb/pair")
        async def adb_pair(body: dict):
            """จับคู่มือถือแบบไร้สาย (Android 11 ขึ้นไป) — host:port + รหัส 6 หลักที่มือถือแสดง."""
            if not self.adb:
                return {"ok": False, "error": "ระบบยังไม่พร้อม"}
            host = (body.get("host") or "").strip()
            port = body.get("port")
            code = str(body.get("code") or "").strip()
            if not host or not port or not code:
                return {"ok": False, "error": "กรอกให้ครบ: ที่อยู่ (host), พอร์ต และรหัสจับคู่ 6 หลัก"}
            try:
                port = int(port)
            except (TypeError, ValueError):
                return {"ok": False, "error": "พอร์ตต้องเป็นตัวเลข"}
            ok, msg = self.adb.pair(host, port, code)
            return {"ok": ok, "message": msg,
                    "error": "" if ok else self.adb._friendly_adb_error(msg)}

        @app.post("/api/adb/connect")
        async def adb_connect(body: dict):
            """เชื่อมมือถือผ่าน Wi-Fi (คืนผลจริง สำเร็จ/ไม่สำเร็จ) — รับ host หรือ ip."""
            if not self.adb:
                return {"ok": False, "error": "ระบบยังไม่พร้อม"}
            host = (body.get("host") or body.get("ip") or "").strip()
            if not host:
                return {"ok": False, "error": "กรอกที่อยู่ (IP) ของมือถือก่อน"}
            port = int(body.get("port", 5555) or 5555)
            ok, msg = self.adb.connect_wifi(host, port)
            if ok:
                self.adb.scan()
            return {"ok": ok, "message": msg,
                    "error": "" if ok else self.adb._friendly_adb_error(msg)}

        @app.post("/api/adb/test")
        async def adb_test(body: dict):
            """ตรวจว่ามือถือพร้อมใช้งานจริงไหม (สั่งงานได้ + ถ่ายภาพหน้าจอได้)."""
            if not self.adb:
                return {"ok": False, "ready": False, "error": "ระบบยังไม่พร้อม"}
            serial = (body.get("serial") or "").strip()
            if not serial:
                return {"ok": False, "ready": False, "error": "ยังไม่ได้เลือกเครื่อง"}
            res = self.adb.test_ready(serial)
            return {"ok": res["ready"], **res}

        @app.post("/api/pilot/start")
        async def pilot_start(body: dict):
            # เปิดโหมดโพสต์อัตโนมัติ (auto-post loop)
            if self.autopilot:
                self.autopilot.set_enabled(True)
            return {"ok": True, "enabled": True}

        @app.post("/api/pilot/stop")
        async def pilot_stop():
            if self.autopilot:
                self.autopilot.set_enabled(False)
            return {"ok": True, "enabled": False}

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
                            "id":     j["id"],
                            "name":   p.name,
                            "folder": folder,
                            "size":   p.stat().st_size if p.exists() else 0,
                            "mtime":  int(p.stat().st_mtime) if p.exists() else (j.get("updated_at") or 0),
                            "url":    f"/video/{folder}/{p.name}",
                            "product":    j.get("name") or bi.get("name", ""),
                            "price":      bi.get("price", ""),
                            "commission": (prod.get("commission", {}) or {}).get("rate", ""),
                            "link":       (prod.get("links", {}) or {}).get("affiliate_link", ""),
                            "cover":      prod.get("cover", ""),   # ← ปกคลิป (ไฟล์ในโฟลเดอร์เดียวกัน)
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
                        "link":       meta.get("link", ""),
                        "status":     meta.get("status", ""),
                    })
            return {"videos": vids}

        @app.post("/api/clips/upload")
        async def upload_clip(file: UploadFile = File(...), name: str = Form(""),
                              price: str = Form(""), link: str = Form(""), commission: str = Form("")):
            """เพิ่มคลิปที่ทำเอง → เซฟลง pending + import เข้า DB เป็น generated (พร้อมโพสต์)."""
            import config as cfg, time as _t, json as _json, re as _re
            cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
            pid  = f"up{int(_t.time() * 1000)}"
            base = _re.sub(r'[^A-Za-z0-9._-]', '_', (file.filename or 'clip.mp4').rsplit('/', 1)[-1])
            if not base.lower().endswith('.mp4'):
                base += '.mp4'
            dest = cfg.PENDING_DIR / f"{pid}_{base}"
            data = await file.read()
            if not data:
                return {"ok": False, "error": "ไฟล์ว่าง"}
            dest.write_bytes(data)
            sidecar = {
                "video": dest.name, "product_id": pid,
                "name": name, "price": price, "commission": commission, "link": link,
                "engine": "upload", "created_at": int(_t.time()), "status": "ready",
            }
            dest.with_suffix(".json").write_text(
                _json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
            if self.db:
                self.db.import_clip({
                    "product_id": pid,
                    "basic_info": {"name": name, "price": price},
                    "commission": {"rate": commission},
                    "links": {"affiliate_link": link},
                }, GENERATED, str(dest))
            self.emit_log(f"[UPLOAD] เพิ่มคลิป {name or dest.name} → pending")
            self.ws.broadcast_sync({"type": "flow_video", "pid": pid, "name": name})
            return {"ok": True, "pid": pid, "name": dest.name}

        @app.post("/api/clips/{jid}/meta")
        async def update_clip_meta(jid: int, body: dict):
            """แก้ข้อมูลคลิป (ชื่อ/ราคา/ค่าคอม/ลิงก์) — อัปเดต product_json ใน DB."""
            import json as _json
            if not self.db:
                return {"ok": False}
            j = self.db.get(jid)
            if not j:
                return {"ok": False, "error": "ไม่พบคลิป"}
            prod = j.get("product", {}) or {}
            if "name" in body:       prod.setdefault("basic_info", {})["name"]  = body["name"]
            if "price" in body:      prod.setdefault("basic_info", {})["price"] = body["price"]
            if "commission" in body: prod.setdefault("commission", {})["rate"]  = body["commission"]
            if "link" in body:       prod.setdefault("links", {})["affiliate_link"] = body["link"]
            self.db.update(jid,
                           product_json=_json.dumps(prod, ensure_ascii=False),
                           name=body.get("name", j["name"]),
                           caption=body.get("name", j.get("caption", "")))
            self.emit_log(f"[CLIP] แก้ข้อมูล: {body.get('name', j['name'])}")
            return {"ok": True}

        @app.post("/api/clips/{jid}/cover")
        async def upload_clip_cover(jid: int, file: UploadFile = File(...)):
            """เปลี่ยน/ตั้งปกคลิป — อัปโหลดรูปเอง → เซฟ <วิดีโอ>_cover.<ext> + อัปเดต product.cover."""
            import json as _json
            from pathlib import Path as _P
            if not self.db:
                return {"ok": False}
            j = self.db.get(jid)
            if not j or not j.get("video_path"):
                return {"ok": False, "error": "ไม่พบคลิป"}
            data = await file.read()
            if not data:
                return {"ok": False, "error": "ไฟล์ว่าง"}
            ext = _P(file.filename or "").suffix.lower()
            if ext not in (".jpg", ".jpeg", ".png", ".webp"):
                ext = ".jpg"
            vp = _P(j["video_path"])
            cover_path = vp.with_name(f"{vp.stem}_cover{ext}")
            cover_path.write_bytes(data)
            prod = j.get("product", {}) or {}
            prod["cover"] = cover_path.name
            self.db.update(jid, product_json=_json.dumps(prod, ensure_ascii=False))
            self.emit_log(f"[CLIP] เปลี่ยนปก: {j['name']} → {cover_path.name}")
            return {"ok": True, "cover": cover_path.name}

        @app.get("/video/{folder}/{name}")
        def serve_video(folder: str, name: str):
            import config as cfg
            dirs = {"pending": cfg.PENDING_DIR, "done": cfg.DONE_DIR, "error": cfg.ERROR_DIR}
            d = dirs.get(folder)
            # Prevent path traversal
            if not d or "/" in name or "\\" in name or ".." in name:
                return JSONResponse({"error": "bad path"}, status_code=400)
            path = d / name
            # fallback: ถ้าไม่เจอในโฟลเดอร์ที่ขอ ลองอีก 2 โฟลเดอร์ (กันไฟล์ย้าย/ปกค้าง → จอดำ)
            if not path.exists():
                for alt in (cfg.PENDING_DIR, cfg.DONE_DIR, cfg.ERROR_DIR):
                    if (alt / name).exists():
                        path = alt / name
                        break
            if not path.exists():
                return JSONResponse({"error": "not found"}, status_code=404)
            ext = path.suffix.lower()
            mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                    ".webp": "image/webp"}.get(ext, "video/mp4")
            from fastapi.responses import FileResponse
            return FileResponse(str(path), media_type=mime,
                                headers={"Access-Control-Allow-Origin": "*"})

        # ── First-run setup (ชื่อร้าน เก็บลง DB) ──

        @app.get("/api/setup")
        def setup_status():
            import config as cfg
            s = cfg.load()
            shop = (self.db.get_config("shop_name", "") if self.db else "") or s.get("shop_name", "")
            done = (self.db.get_config("setup_done", "") == "1") if self.db else bool(shop)
            return {
                "configured":          bool(done),
                "shop_name":           shop or "",
                "flow_email":          s.get("flow_email", ""),
                "platforms":           s.get("platforms", []),
                "review_mode":         s.get("review_mode", "auto"),
                "google_api_key_set":  bool(s.get("google_api_key")),
            }

        @app.post("/api/setup")
        async def setup_save(body: dict):
            """บันทึกค่าตั้งต้นทั้งหมดในครั้งเดียว: ชื่อร้าน + Google API key + อีเมล Flow
            + แพลตฟอร์ม/โหมดรีวิว (ถ้าส่งมา) แล้ว mark setup_done."""
            import config as cfg
            shop = (body.get("shop_name") or "").strip()
            if not shop:
                return {"ok": False, "error": "กรุณาใส่ชื่อร้าน"}

            # โหลดค่าปัจจุบัน แล้วเติมค่าจาก onboarding ลง settings.json (worker อ่านจากนี่)
            s = cfg.load()
            s["shop_name"] = shop
            if "flow_email" in body:
                s["flow_email"] = (body.get("flow_email") or "").strip()
            if isinstance(body.get("platforms"), list):
                s["platforms"] = [p for p in body["platforms"] if p]
            if body.get("review_mode") in ("auto", "hold"):
                s["review_mode"] = body["review_mode"]
            cfg.save(s)   # ตัด secrets ออกก่อนเขียนไฟล์เสมอ

            # Google API key → .env (ข้ามค่า mask กันทับ key เดิม)
            key = (body.get("google_api_key") or "").strip()
            if key and key != cfg.MASK:
                cfg.set_secret("google_api_key", key)

            # DB = แหล่งความจริงของสถานะ setup
            if self.db:
                self.db.set_config("shop_name", shop)
                if "flow_email" in body:
                    self.db.set_config("flow_email", s.get("flow_email", ""))
                self.db.set_config("setup_done", "1")

            self.emit_log(f"[SETUP] ตั้งค่าร้าน '{shop}' เรียบร้อย")
            return {"ok": True, "shop_name": shop, "setup_done": True}

        # ── License ──

        @app.get("/api/license/status")
        def license_status():
            from services.license import check
            return check()

        @app.get("/api/license/machine-id")
        def license_machine_id():
            from services.license import machine_id as mid
            return {"machine_id": mid()}

        @app.post("/api/license/activate")
        async def license_activate(body: dict):
            from services.license import activate
            key = (body.get("key") or "").strip()
            if not key:
                return {"ok": False, "reason": "กรุณากรอก License Key"}
            return activate(key)

        # ── งาน/คิว (job tracker + รีวิว) ──

        @app.get("/api/jobs")
        def list_jobs():
            import config as cfg
            if not self.db:
                return {"jobs": []}
            from pathlib import Path as _P
            FOLDER = {"generated": "pending", "posted": "done", "error": "error"}
            out = []
            for j in self.db.list(limit=500):
                prod  = j.get("product", {}) or {}
                bi    = prod.get("basic_info", {}) or {}
                links = prod.get("links", {}) or {}
                link  = links.get("affiliate_link") or links.get("product_url") or ""
                vp    = j["video_path"] or ""
                out.append({
                    "id": j["id"], "name": j["name"] or bi.get("name", ""),
                    "status": j["status"], "attempts": j["attempts"],
                    "error": j["error"],
                    "folder": FOLDER.get(j["status"], "pending"),  # โฟลเดอร์ของไฟล์ (สำหรับรูปย่อ)
                    "file": _P(vp).name if vp else "",
                    "cover": prod.get("cover", ""),    # ปกคลิป (ไฟล์ในโฟลเดอร์เดียวกับวิดีโอ)
                    "price": bi.get("price", ""),
                    "commission": (prod.get("commission", {}) or {}).get("rate", ""),
                    "link": link,                      # ตะกร้า (affiliate short link)
                    # M1: เครื่องที่ล็อกให้คลิปนี้ ('' = auto) + label เครื่อง (ถ้าตั้งไว้)
                    "assigned_serial": (j.get("assigned_serial") or ""),
                    "assigned_label": (self.db.get_config(f"dev_label:{j.get('assigned_serial')}", "")
                                       if (j.get("assigned_serial") or "") else ""),
                    "created_at": j["created_at"], "updated_at": j["updated_at"],
                })
            return {"jobs": out, "review_mode": cfg.load().get("review_mode", "auto")}

        @app.post("/api/videos/delete_nolink")
        def delete_nolink():
            """ลบคลิปที่ไม่มีลิงก์ตะกร้า (affiliate link ว่าง) — DB row + ไฟล์ mp4/json."""
            from pathlib import Path as _P
            deleted = 0
            if self.db:
                for st in (GENERATED, POSTED, ERROR):
                    for j in self.db.list(st, limit=9999):
                        prod = j.get("product", {}) or {}
                        link = (prod.get("links", {}) or {}).get("affiliate_link", "")
                        if (link or "").strip():
                            continue
                        vp = j.get("video_path")
                        if vp and _P(vp).name == "test_video.mp4":
                            continue   # กันลบไฟล์ทดสอบ
                        self.db.delete(j["id"])
                        if vp:
                            try:
                                p = _P(vp); p.unlink(missing_ok=True)
                                p.with_suffix(".json").unlink(missing_ok=True)
                            except Exception:
                                pass
                        deleted += 1
            else:
                import config as cfg, json as _json
                for d in (cfg.PENDING_DIR, cfg.DONE_DIR, cfg.ERROR_DIR):
                    if not d.exists():
                        continue
                    for f in list(d.glob("*.mp4")):
                        if f.name == "test_video.mp4":
                            continue
                        side = f.with_suffix(".json")
                        meta = {}
                        if side.exists():
                            try: meta = _json.loads(side.read_text(encoding="utf-8"))
                            except Exception: meta = {}
                        if (meta.get("link") or "").strip():
                            continue
                        try:
                            f.unlink(missing_ok=True); side.unlink(missing_ok=True); deleted += 1
                        except Exception:
                            pass
            self.emit_log(f"[CLEANUP] ลบคลิปไม่มีลิงก์ตะกร้า {deleted} คลิป")
            return {"ok": True, "deleted": deleted}

        @app.delete("/api/jobs/{jid}")
        def delete_job(jid: int):
            if self.db:
                j = self.db.delete(jid)
                if j and j.get("video_path"):
                    from pathlib import Path as _P
                    try:
                        p = _P(j["video_path"]); p.unlink(missing_ok=True)
                        p.with_suffix(".json").unlink(missing_ok=True)
                    except Exception:
                        pass
            return {"ok": True}

        @app.post("/api/jobs/{jid}/post")
        def post_job(jid: int):
            if self.autopilot:
                return {"ok": self.autopilot.post_job_now(jid)}
            return {"ok": False}

        @app.post("/api/jobs/{jid}/dryrun")
        def dry_post_job(jid: int):
            """ทดสอบโพสต์ (dry) — รัน ADB flow ถึง caption ไม่โพสต์จริง ไม่เปลี่ยนสถานะ."""
            if self.autopilot:
                return {"ok": self.autopilot.dry_post_job(jid)}
            return {"ok": False}

        @app.post("/api/jobs/{jid}/cancel")
        def cancel_job(jid: int):
            """ยกเลิกงานที่ค้าง (posting/generating) → รีเซ็ตกลับ generated เพื่อลองใหม่ได้
            (thread โพสต์ที่รันอยู่จะจบเองแล้วเห็นสถานะเปลี่ยน — งานไม่ค้างในหน้าจอ)"""
            if self.db:
                self.db.set_status(jid, GENERATED, error="ยกเลิกโดยผู้ใช้")
            return {"ok": True}

        # ── M1: assign คลิป → เครื่อง (serial="" = auto) ──
        def _known_serial(serial: str) -> bool:
            """serial ต้องเป็น '' (auto) หรือเครื่องที่ระบบรู้จัก (เคย scan เห็น)."""
            if not serial:
                return True
            return bool(self.adb and serial in self.adb.devices)

        @app.post("/api/jobs/{jid}/assign")
        def assign_job(jid: int, body: dict):
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            serial = ((body or {}).get("serial") or "").strip()
            if not _known_serial(serial):
                return {"ok": False, "error": f"ไม่รู้จักเครื่อง: {serial}"}
            if not self.db.get(jid):
                return {"ok": False, "error": "ไม่พบคลิป"}
            self.db.set_job_assignment(jid, serial)
            return {"ok": True, "id": jid, "assigned_serial": serial}

        @app.post("/api/jobs/assign")
        def assign_jobs_bulk(body: dict):
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            serial = ((body or {}).get("serial") or "").strip()
            ids = [i for i in ((body or {}).get("ids") or []) if isinstance(i, int)]
            if not _known_serial(serial):
                return {"ok": False, "error": f"ไม่รู้จักเครื่อง: {serial}"}
            if not ids:
                return {"ok": False, "error": "ids ว่าง"}
            n = 0
            for jid in ids:
                if self.db.get(jid):
                    self.db.set_job_assignment(jid, serial)
                    n += 1
            return {"ok": True, "assigned": n, "serial": serial}

        @app.get("/api/reports")
        def reports():
            if not self.db:
                return {}
            st = self.db.stats(); by = st["by_status"]
            posted = by.get(POSTED, 0); err = by.get(ERROR, 0)
            done_total = posted + err
            return {
                "totals": {
                    "all":       st["total"],
                    "posted":    posted,
                    "error":     err,
                    "generated": by.get(GENERATED, 0),
                    "queued":    by.get(QUEUED, 0) + by.get(GENERATING, 0) + by.get(POSTING, 0),
                },
                "success_rate": round(posted / done_total * 100, 1) if done_total else 0,
                "cost": {
                    "total":      round(st["total_cost"], 2),
                    "this_month": round(self.budget.spend_month(), 2) if self.budget else 0,
                    "avg":        round(st["total_cost"] / posted, 2) if posted else 0,
                },
                "daily":            self.db.posts_by_day(14),
                "errors":           self.db.error_list(15),
                "budget":           self.budget.snapshot() if self.budget else None,
                "usage_daily":      self.db.usage_by_day(14),
                "platform_revenue": self.db.platform_revenue_by_day(14),
                "platform_summary": self.db.platform_summary(),
            }

        @app.get("/api/platforms")
        def list_platforms():
            from services.platforms import PLATFORMS
            stats = self.db.platform_summary() if self.db else {}
            return {"platforms": [
                {"key": k, "label": v["label"], "ready": v["ready"],
                 "tuned": v.get("tuned", False),
                 "stats": stats.get(k, {})}    # {today, month, success_rate, last_ts} (F)
                for k, v in PLATFORMS.items()
            ]}

        @app.get("/api/post-results")
        def post_results():
            from services.platforms import PLATFORMS
            summary = self.db.platform_summary() if self.db else {}
            recent  = self.db.recent_platform_posts(100) if self.db else []
            return {
                "summary": {
                    k: {"label": v["label"], **summary.get(k, {})}
                    for k, v in PLATFORMS.items()
                },
                "recent": recent,
            }

        @app.get("/api/settings")
        def get_settings():
            import config as cfg
            return cfg.public_load()   # secrets masked — never sent to browser

        @app.post("/api/settings")
        async def save_settings(body: dict):
            import config as cfg
            # ตั้ง Google API key ลง .env ถ้าผู้ใช้กรอกค่าจริง (ข้ามค่า mask ******** เพื่อไม่ทับ key เดิม)
            key = (body.get("google_api_key") or "").strip()
            if key and key != cfg.MASK:
                cfg.set_secret("google_api_key", key)
                self.emit_log("[SETTINGS] อัปเดต Google API key แล้ว")
            cfg.save(body)             # strips secrets; masked values are ignored
            # AutoPoster/AutoPilot อ่าน cfg.load() สดทุกครั้ง — ไม่ต้อง push เข้า worker
            return {"ok": True}

        @app.post("/api/settings/test-key")
        async def test_google_key(body: dict):
            """ทดสอบ Google API key ว่าใช้งานได้จริงไหม — ยิงคำขอเบาสุด (list models) ไป Gemini.
            รับ key จาก body ถ้าเป็นค่าจริง ไม่งั้นใช้ key ที่บันทึกไว้. ไม่ทำให้เซิร์ฟเวอร์ล่ม."""
            import config as cfg
            import httpx
            key = (body.get("google_api_key") or "").strip()
            if not key or key == cfg.MASK:
                key = (cfg.load().get("google_api_key") or "").strip()
            if not key:
                return {"ok": False, "error": "ยังไม่ได้ใส่รหัส Google API key"}
            url = "https://generativelanguage.googleapis.com/v1beta/models"
            try:
                r = httpx.get(url, params={"key": key, "pageSize": 1}, timeout=12)
            except httpx.TimeoutException:
                return {"ok": False, "error": "เชื่อมต่อ Google ไม่ทัน (หมดเวลา) — ลองใหม่อีกครั้ง"}
            except Exception as e:
                return {"ok": False, "error": f"เชื่อมต่ออินเทอร์เน็ตไม่ได้: {e}"}
            if r.status_code == 200:
                return {"ok": True}
            detail = ""
            try:
                detail = ((r.json() or {}).get("error", {}) or {}).get("message", "")
            except Exception:
                detail = (r.text or "")[:200]
            if r.status_code in (400, 403):
                msg = "รหัส Google API key ไม่ถูกต้อง หรือยังไม่ได้เปิดสิทธิ์ใช้งาน Gemini"
            elif r.status_code == 429:
                msg = "ใช้งานเกินโควตาชั่วคราว — รอสักครู่แล้วลองใหม่"
            else:
                msg = f"ทดสอบไม่สำเร็จ (รหัส {r.status_code})"
            return {"ok": False, "error": msg, "detail": detail}

        # ── ส่วนขยาย (onboarding): path โฟลเดอร์ + เปิด chrome://extensions ให้ผู้ใช้ ──
        @app.get("/api/ext/path")
        def ext_path():
            from pathlib import Path
            p = Path(__file__).resolve().parents[2] / "extension"
            return {"ok": True, "path": str(p), "exists": p.exists()}

        @app.post("/api/ext/open")
        def ext_open():
            return self._open_extensions_page()

        # ── อัปเดต extension เอง (ปุ่มในหน้า Settings) — ดึงล่าสุดจาก GitHub ลงโฟลเดอร์ extension ──
        # ใช้คำสั่งเดียวกับที่ผู้ใช้พิมพ์ใน Terminal (curl|tar) แต่รันให้จากเซิร์ฟเวอร์
        # ── อัปเดตตัวโปรแกรม ────────────────────────────────────────────────
        # โฟลเดอร์ติดตั้งเป็น git clone อยู่แล้ว → เทียบ commit ที่รันอยู่กับ main บน GitHub
        def _app_root():
            from pathlib import Path
            return Path(__file__).resolve().parents[2]

        def _git(*args, timeout=25):
            import subprocess
            try:
                r = subprocess.run(["git", *args], cwd=str(_app_root()), timeout=timeout,
                                   capture_output=True, text=True)
                return r.returncode == 0, (r.stdout or r.stderr or "").strip()
            except Exception as e:
                return False, str(e)[:200]

        @app.get("/api/app/update-check")
        def app_update_check():
            import httpx
            root = _app_root()
            if not (root / ".git").exists():
                return {"ok": True, "supported": False,
                        "reason": "โฟลเดอร์นี้ไม่ได้ติดตั้งผ่าน git — อัปเดตด้วยการโหลดตัวติดตั้งใหม่"}
            ok, cur = _git("rev-parse", "HEAD")
            if not ok:
                return {"ok": True, "supported": False, "reason": "อ่านเวอร์ชันในเครื่องไม่ได้"}
            try:
                r = httpx.get("https://api.github.com/repos/NATX0XD/Video-Affliate/commits/main",
                              timeout=12, headers={"Accept": "application/vnd.github+json"})
                data = r.json()
                latest = data.get("sha") or ""
                msg = ((data.get("commit") or {}).get("message") or "").split("\n")[0]
            except Exception as e:
                return {"ok": False, "supported": True, "error": f"เช็กอัปเดตไม่ได้: {str(e)[:120]}"}
            if not latest:
                return {"ok": False, "supported": True, "error": "GitHub ไม่ตอบข้อมูลเวอร์ชัน"}
            return {"ok": True, "supported": True, "current": cur[:7], "latest": latest[:7],
                    "update_available": cur[:40] != latest[:40], "message": msg}

        @app.post("/api/app/update")
        def app_update():
            """ดึงโค้ดล่าสุดจาก main — ต้องปิดเปิดโปรแกรมเองหลังอัปเดต"""
            root = _app_root()
            if not (root / ".git").exists():
                return {"ok": False, "error": "โฟลเดอร์นี้ไม่ได้ติดตั้งผ่าน git — ต้องโหลดตัวติดตั้งใหม่"}
            ok, out = _git("status", "--porcelain")
            if ok and out.strip():
                return {"ok": False, "error": "มีไฟล์ที่แก้ค้างไว้ในโฟลเดอร์ติดตั้ง — อัปเดตอัตโนมัติไม่ได้ (กันงานหาย)"}
            ok, out = _git("fetch", "--depth", "1", "origin", "main", timeout=90)
            if not ok:
                return {"ok": False, "error": f"ดึงข้อมูลไม่สำเร็จ: {out[:180]}"}
            ok, out = _git("reset", "--hard", "origin/main", timeout=60)
            if not ok:
                return {"ok": False, "error": f"อัปเดตไม่สำเร็จ: {out[:180]}"}
            _, ver = _git("rev-parse", "--short", "HEAD")
            self.emit_log(f"[UPDATE] อัปเดตโปรแกรมเป็น {ver} แล้ว — ปิดแล้วเปิดโปรแกรมใหม่เพื่อใช้เวอร์ชันใหม่")
            return {"ok": True, "version": ver, "restart_required": True}

        # ดึงโฟลเดอร์ extension ล่าสุดจาก GitHub — ต้องทำงานได้ทั้ง mac/linux และ Windows
        # เดิมใช้ `curl | tar ... 'path'` ผ่าน shell: cmd.exe ไม่รู้จัก single quote และไม่มี pipe แบบเดียวกัน
        # → บน Windows ล้มเงียบทุกครั้ง. เปลี่ยนมาโหลดไฟล์แล้วแตกด้วย Python เอง (ไม่พึ่ง shell)
        def _pull_ext(root, timeout=90):
            import io, tarfile, shutil, tempfile, urllib.request
            from types import SimpleNamespace
            url = "https://github.com/NATX0XD/Video-Affliate/archive/refs/heads/main.tar.gz"
            try:
                with urllib.request.urlopen(url, timeout=timeout) as resp:
                    blob = resp.read()
            except Exception as e:
                return SimpleNamespace(returncode=1, stderr=f"โหลดไฟล์ไม่ได้: {str(e)[:160]}")
            prefix = "Video-Affliate-main/extension/"
            tmp = tempfile.mkdtemp(prefix="vgap-ext-")
            try:
                with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
                    members = [m for m in tf.getmembers() if m.name.startswith(prefix)]
                    if not members:
                        return SimpleNamespace(returncode=1, stderr="ไม่พบโฟลเดอร์ extension ในไฟล์ที่โหลดมา")
                    for m in members:
                        rel = m.name[len(prefix):]
                        if not rel or ".." in rel.split("/"):   # กัน path traversal
                            continue
                        m2 = tf.getmember(m.name)
                        m2.name = rel
                        tf.extract(m2, tmp)
                dest = root / "extension"
                for item in Path(tmp).iterdir():               # ทับทีละไฟล์ ไม่ลบทั้งโฟลเดอร์ก่อน
                    target = dest / item.name
                    if item.is_dir():
                        shutil.copytree(item, target, dirs_exist_ok=True)
                    else:
                        dest.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(item, target)
                return SimpleNamespace(returncode=0, stderr="")
            except Exception as e:
                return SimpleNamespace(returncode=1, stderr=f"แตกไฟล์ไม่สำเร็จ: {str(e)[:160]}")
            finally:
                shutil.rmtree(tmp, ignore_errors=True)

        @app.post("/api/ext/update")
        def ext_update():
            import subprocess, json as _json
            from pathlib import Path
            root = Path(__file__).resolve().parents[2]      # โฟลเดอร์ติดตั้ง (มี extension/ อยู่ข้างใน)
            try:
                r = _pull_ext(root, timeout=90)
                if r.returncode != 0:
                    return {"ok": False, "error": (r.stderr or "ดึงไฟล์ไม่สำเร็จ").strip()[:300]}
                ver = _json.loads((root / "extension" / "manifest.json").read_text())["version"]
                self._ext_reload_to = ver          # ตั้ง flag ให้ background reload ตัวเองเมื่อ poll เจอ
                return {"ok": True, "version": ver}
            except Exception as e:
                return {"ok": False, "error": str(e)[:300]}

        # ── auto-pull extension ล่าสุด "ตอนเปิดแอป" (best-effort, ไม่บล็อก) ──
        # เปิดแอปครั้งใด = ได้ extension ล่าสุด → background reload เอง (ไม่ต้องลบ+Load unpacked ทุกรอบ)
        def _auto_pull_ext():
            import os as _os, subprocess
            from pathlib import Path
            # รันจากซอร์ส (แก้ extension อยู่) → ตั้ง VGAP_NO_EXT_PULL=1 กันดึงของ main มาทับงานที่ยังไม่ push
            if _os.environ.get("VGAP_NO_EXT_PULL") == "1":
                return
            root = Path(__file__).resolve().parents[2]
            try:
                _pull_ext(root, timeout=90)
            except Exception:
                pass
        try:
            if not getattr(self, "_ext_autopull_started", False):
                self._ext_autopull_started = True
                import threading as _th
                _th.Thread(target=_auto_pull_ext, daemon=True).start()
        except Exception:
            pass

        # background poll เทียบเวอร์ชัน "ไฟล์บนดิสก์" กับที่รันอยู่ → ต่างเมื่อไหร่ reload ตัวเอง
        # (ครอบทุกวิธีอัป: ปุ่ม Settings / dmg / curl / auto-pull ตอนเปิดแอป → ไม่ต้องลบ+Load unpacked เอง)
        @app.get("/api/ext/latest")
        def ext_latest():
            import json as _json
            from pathlib import Path
            ver = None
            try:
                ver = _json.loads((Path(__file__).resolve().parents[2] / "extension" / "manifest.json").read_text())["version"]
            except Exception:
                pass
            return {"ok": True, "reload_to": ver}

        # ── Google Flow pipeline (extension สร้างคลิป + เขียน prompt เองในเบราว์เซอร์) ──

        @app.get("/api/flow/config")
        def flow_config():
            """ส่งค่าที่ extension ใช้เขียน prompt เอง — local-only.
            เลิกส่ง google_api_key ดิบแล้ว (กันรั่ว) → ส่ง token + flag ว่ามี key แทน.
            extension เรียก Gemini ผ่าน proxy POST /api/ai/gemini (แนบ token) ให้ desktop ถือ key เอง."""
            self._touch_extension()
            import config as cfg
            s = cfg.load()
            return {
                "ok": True,
                "token":              self.api_token,               # แนบใน header เวลาเรียก proxy
                "google_api_key_set": bool(s.get("google_api_key")),# มี key แล้วไหม (ไม่ส่งค่าดิบ)
                "prompt_mode":       s.get("prompt_mode", "ai"),
                "prompt_template":   s.get("prompt_template", ""),
                "prompt_style_note": s.get("prompt_style_note", ""),
                "prompt_model":      s.get("prompt_model", "gemini-2.0-flash"),
                "duration":          s.get("duration", 8),
                "shop_name":         s.get("shop_name", ""),
                "background":        s.get("background", "สตูดิโอ"),
                "personality":       s.get("personality", "สนุกสนาน"),
                "budget":            self.budget.snapshot() if self.budget else None,
            }

        # ── AI proxy: เรียก Gemini ฝั่ง server (key ไม่หลุดออกนอกเครื่อง) ──
        # extension แนบ token (จาก /api/flow/config) ใน header X-VGAP-Token → desktop ถือ GOOGLE_API_KEY เอง.
        # รองรับทั้ง passthrough (contents/generationConfig — คงพฤติกรรมเดิมของ extension เป๊ะ)
        # และแบบง่าย (prompt). คืน JSON รูปเดียวกับ Gemini (candidates/usageMetadata/error) ไม่แปลง.
        @app.post("/api/ai/gemini")
        async def ai_gemini(body: dict, request: Request):
            self._touch_extension()
            tok = (request.headers.get("x-vgap-token")
                   or request.headers.get("authorization", "").removeprefix("Bearer ").strip())
            if not tok or not secrets.compare_digest(tok, self.api_token):
                return JSONResponse({"error": {"message": "unauthorized"}}, status_code=401)
            import config as cfg
            import httpx
            key = (cfg.load().get("google_api_key") or "").strip()
            if not key:
                return JSONResponse(
                    {"error": {"message": "ยังไม่ได้ใส่รหัส Google API key ใน desktop"}},
                    status_code=400)
            model = (body.get("model") or cfg.load().get("prompt_model")
                     or "gemini-2.0-flash").strip()
            import re as _re
            if not _re.fullmatch(r"[A-Za-z0-9._\-]{1,64}", model):
                return JSONResponse({"error": {"message": "ชื่อโมเดลไม่ถูกต้อง"}}, status_code=400)
            # contents ตรงจาก extension (รองรับรูป/JSON mode) ถ้าไม่มีค่อยห่อจาก prompt เดี่ยว
            if isinstance(body.get("contents"), list):
                payload = {"contents": body["contents"]}
            else:
                prompt = (body.get("prompt") or "").strip()
                if not prompt:
                    return JSONResponse({"error": {"message": "ไม่มี prompt"}}, status_code=400)
                payload = {"contents": [{"parts": [{"text": prompt}]}]}
            if isinstance(body.get("generationConfig"), dict):
                payload["generationConfig"] = body["generationConfig"]
            if isinstance(body.get("systemInstruction"), dict):
                payload["systemInstruction"] = body["systemInstruction"]
            url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                   f"{model}:generateContent")
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    r = await client.post(url, params={"key": key}, json=payload)
            except httpx.TimeoutException:
                return JSONResponse(
                    {"error": {"message": "เชื่อมต่อ Gemini ไม่ทัน (หมดเวลา) — ลองใหม่อีกครั้ง"}},
                    status_code=504)
            except Exception as e:
                return JSONResponse(
                    {"error": {"message": f"เรียก Gemini ไม่สำเร็จ: {e}"}}, status_code=502)
            try:
                data = r.json()
            except Exception:
                data = {"error": {"message": (r.text or "")[:300]}}
            return JSONResponse(data, status_code=r.status_code)

        # ── Flow adapter: ชั้น override selector/behavior ของ Google Flow ──
        # GET = adapter ปัจจุบัน (bundled default หรือ remote ล่าสุด, มี version).
        # POST update = ดึงจาก flow_adapter_url → validate → cache ~/.vgap/flow-adapter.json.
        # remote ล้ม → error อ่านง่าย + คงตัวเดิม (ไม่ทับ). ไม่แตะ logic gen/credit ใน flow.js.
        @app.get("/api/flow/adapter")
        def flow_adapter():
            self._touch_extension()
            import config as cfg
            a = cfg.load_flow_adapter()
            return {"ok": True, "adapter": a, "version": a.get("version", "")}

        @app.post("/api/flow/adapter/update")
        async def flow_adapter_update(body: dict = None):
            import config as cfg
            import httpx
            cur_ver = cfg.load_flow_adapter().get("version", "")
            # ใช้เฉพาะ URL ที่ตั้งไว้ในตั้งค่า (flow_adapter_url) เท่านั้น
            # กัน SSRF: ไม่รับ url ที่ client ส่งมาเอง (จะยิงไปที่ไหนก็ได้)
            url = (cfg.load().get("flow_adapter_url", "") or "").strip()
            if not url:
                return JSONResponse(
                    {"ok": False, "error": "ยังไม่ได้ตั้ง URL ของ adapter (flow_adapter_url) ในตั้งค่า",
                     "version": cur_ver}, status_code=400)
            try:
                r = httpx.get(url, timeout=15, follow_redirects=True)
            except httpx.TimeoutException:
                return JSONResponse(
                    {"ok": False, "error": "ดึง adapter ไม่ทัน (หมดเวลา) — ใช้ตัวเดิมต่อ",
                     "version": cur_ver}, status_code=504)
            except Exception as e:
                return JSONResponse(
                    {"ok": False, "error": f"ดึง adapter ไม่ได้: {e} — ใช้ตัวเดิมต่อ",
                     "version": cur_ver}, status_code=502)
            if r.status_code != 200:
                return JSONResponse(
                    {"ok": False, "error": f"ปลายทางตอบรหัส {r.status_code} — ใช้ตัวเดิมต่อ",
                     "version": cur_ver}, status_code=502)
            try:
                data = r.json()
            except Exception:
                return JSONResponse(
                    {"ok": False, "error": "ไฟล์ adapter ไม่ใช่ JSON ที่ถูกต้อง — ใช้ตัวเดิมต่อ",
                     "version": cur_ver}, status_code=422)
            if not isinstance(data, dict) or "version" not in data:
                return JSONResponse(
                    {"ok": False, "error": "adapter ต้องเป็น object และต้องมี field 'version' — ใช้ตัวเดิมต่อ",
                     "version": cur_ver}, status_code=422)
            data.setdefault("source", "remote")
            try:
                cfg.save_flow_adapter(data)
            except Exception as e:
                return JSONResponse(
                    {"ok": False, "error": f"บันทึก adapter ไม่ได้: {e}", "version": cur_ver},
                    status_code=500)
            self.emit_log(f"[FLOW] อัปเดต adapter → version {data.get('version')}")
            return {"ok": True, "version": data.get("version", ""), "adapter": data}

        @app.get("/api/usage")
        def usage_overview():
            """ข้อมูลภาพรวมหน้า dashboard: กราฟ 7 วัน + สรุปงบเดือนนี้ — local-only."""
            import datetime as _dt
            now = _dt.datetime.now()
            month_start = int(_dt.datetime(now.year, now.month, 1).timestamp())
            return {
                "ok": True,
                "daily":   self.db.usage_by_day(7),
                "summary": self.db.usage_summary(month_start),
                "budget":  self.budget.snapshot() if self.budget else None,
            }

        @app.get("/api/overview")
        def overview():
            """ข้อมูลรวมหน้า 'ภาพรวม' ใน dashboard — ของจริงล้วน ไม่มี dummy (local-only)."""
            import time as _t
            import datetime as _dt
            from services.platforms import PLATFORMS
            import config as cfg

            now_ts      = _t.time()
            n           = _dt.datetime.now()
            day_start   = int(_dt.datetime(n.year, n.month, n.day).timestamp())
            month_start = int(_dt.datetime(n.year, n.month, 1).timestamp())

            # ── วันนี้ ──
            posted_today = self.db.count_posted_today() if self.db else 0
            by = self.db.stats()["by_status"] if self.db else {}
            queued = (by.get(QUEUED, 0) + by.get(GENERATING, 0) +
                      by.get(GENERATED, 0) + by.get(POSTING, 0))
            # อัตราสำเร็จเฉพาะโพสต์ของ "วันนี้"
            recent_all = self.db.recent_platform_posts(200) if self.db else []
            today_posts = [r for r in recent_all if (r.get("ts") or 0) >= day_start]
            ok_today = sum(1 for r in today_posts if r.get("ok"))
            success_rate = round(ok_today / len(today_posts) * 100) if today_posts else None

            # ── ระบบ ──
            running = bool(self.autopilot and self.autopilot.enabled)
            online = hot = cooldown = 0
            for d in (self.adb.devices.values() if self.adb else []):
                if d.status == "device":
                    online += 1
                if d.cooldown_reason == "hot":
                    hot += 1
                elif d.cooldown_reason:
                    cooldown += 1

            settings  = cfg.load()
            enabled   = set(settings.get("platforms") or [])
            psummary  = self.db.platform_summary() if self.db else {}
            platforms = [
                {"key": k, "label": v["label"],
                 "enabled": k in enabled,
                 "today": psummary.get(k, {}).get("today", 0)}
                for k, v in PLATFORMS.items()
            ]

            # ── ต้องลงมือ (alerts) ──
            alerts = []
            errs = self.db.error_list(20) if self.db else []
            if errs:
                alerts.append({
                    "level": "error", "icon": "alert",
                    "title": f"{len(errs)} งานล้มเหลว",
                    "detail": (errs[0].get("error") or errs[0].get("name") or "")[:80],
                })
            if hot:
                alerts.append({
                    "level": "warn", "icon": "thermo",
                    "title": f"เครื่องร้อน {hot} เครื่อง",
                    "detail": "ระบบพักเครื่องอัตโนมัติจนกว่าจะเย็นลง",
                })
            if cooldown:
                alerts.append({
                    "level": "info", "icon": "thermo",
                    "title": f"พักเครื่อง {cooldown} เครื่อง",
                    "detail": "แบตต่ำ/รอชาร์จ — จะกลับมาทำงานเองเมื่อพร้อม",
                })
            snap = self.budget.snapshot() if self.budget else None
            if snap and snap.get("alert") == "over":
                alerts.append({
                    "level": "error", "icon": "alert",
                    "title": "งบ AI เกินกำหนดแล้ว",
                    "detail": f"ใช้ไป {snap.get('spent', 0):.0f}฿ จาก {snap.get('budget', 0):.0f}฿ เดือนนี้",
                })
            elif snap and snap.get("alert") == "warn":
                alerts.append({
                    "level": "warn", "icon": "alert",
                    "title": "งบ AI ใกล้เต็ม",
                    "detail": f"ใช้ไปแล้ว {snap.get('percent', 0)}% ของงบเดือนนี้",
                })
            if not online and not running:
                alerts.append({
                    "level": "info", "icon": "phone",
                    "title": "ยังไม่พบเครื่องที่เชื่อมต่อ",
                    "detail": "เสียบมือถือ/เปิด ADB เพื่อเริ่มโพสต์อัตโนมัติ",
                })

            return {
                "ok": True,
                "today": {"posted": posted_today, "success_rate": success_rate, "queued": queued},
                "system": {
                    "autopilot": running,
                    "devices": {"online": online, "hot": hot, "cooldown": cooldown},
                    "platforms": platforms,
                },
                "alerts": alerts,
                "posts_daily": self.db.posts_by_day(7) if self.db else [],
                "budget": snap,
                "usage": self.db.usage_summary(month_start) if self.db else None,
                "recent": [
                    {"ts": r.get("ts"), "platform": r.get("platform"),
                     "ok": bool(r.get("ok")), "name": r.get("job_name", "")}
                    for r in (recent_all[:8])
                ],
            }

        @app.post("/api/flow/usage")
        async def flow_usage(body: dict):
            """extension รายงานการใช้ Gemini ตอนเขียน prompt (J) → ลง usage ledger."""
            self._touch_extension()
            tokens = int(body.get("tokens", 0) or 0)
            qty    = int(body.get("qty", 1) or 1)
            kind   = body.get("kind", "prompt")
            cost   = self.budget.gemini_cost(tokens) if self.budget else 0
            self.db.add_usage("gemini", kind, qty=qty, tokens=tokens, cost=cost)
            return {"ok": True}

        @app.post("/api/flow/video")
        async def flow_video(body: dict):
            """รับวิดีโอที่ extension สร้างเสร็จ → เซฟลง pending + sidecar(link) พร้อมโพสต์.
            รองรับหลายคลิป (files[]) → ต่อด้วย ffmpeg เป็นไฟล์เดียว (เช่น 2×10วิ = 20วิ)."""
            self._touch_extension()
            import config as cfg, base64, json, shutil, subprocess, time as _t
            from pathlib import Path

            pid = body.get("product_id") or f"flow{int(_t.time()*1000)}"
            cfg.PENDING_DIR.mkdir(parents=True, exist_ok=True)
            out_mp4 = cfg.PENDING_DIR / f"{pid}.mp4"
            dl_dir = Path.home() / "Downloads" / "flow"

            # แหล่งวิดีโอ 3 แบบ (เรียงความสำคัญ):
            #   files_b64[] / video_b64 = bytes ส่งตรงจาก extension (bypass chrome.downloads = ไม่มี save dialog)
            #   files[] / filename       = ชื่อไฟล์ใน ~/Downloads/flow (chrome.downloads แบบเดิม)
            files    = body.get("files") or ([body["filename"]] if body.get("filename") else [])
            files_b64 = body.get("files_b64") or ([body["video_b64"]] if body.get("video_b64") else [])
            srcs = []
            if files_b64:
                for i, b in enumerate(files_b64):
                    raw = (b or "").split(",", 1)[-1]
                    p = cfg.PENDING_DIR / f"{pid}_part{i + 1}.mp4"
                    p.write_bytes(base64.b64decode(raw))
                    srcs.append(p)
            elif files:
                srcs = [dl_dir / f for f in files]
                missing = [str(s) for s in srcs if not s.exists()]
                if missing:
                    return {"ok": False, "error": f"ไม่พบไฟล์: {missing}"}
            else:
                return {"ok": False, "error": "ไม่มีไฟล์วิดีโอ"}

            if True:
                if len(srcs) == 1:
                    shutil.move(str(srcs[0]), str(out_mp4))   # ย้ายเข้าโปรเจ็กต์ (ลบตัวต้นทาง)
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

            # ปกคลิป = เฟรมแรกของวิดีโอ — ดึงด้วย ffmpeg เป็น <pid>_cover.jpg (ไม่ gen, ฟรี)
            cover_name = ""
            try:
                cover_path = cfg.PENDING_DIR / f"{pid}_cover.jpg"
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(out_mp4), "-frames:v", "1", "-q:v", "2",
                     str(cover_path)],
                    capture_output=True, timeout=30)
                if cover_path.exists() and cover_path.stat().st_size > 0:
                    cover_name = cover_path.name
                    self.emit_log(f"[FLOW] ปกคลิป = เฟรมแรก → {cover_name}")
            except Exception as e:
                self.emit_log(f"[FLOW] ดึงเฟรมแรกเป็นปกไม่สำเร็จ: {e}")

            sidecar = {
                "video":      out_mp4.name,
                "product_id": pid,
                "name":       body.get("name", ""),
                "price":      body.get("price", ""),
                "sold_count": body.get("sold", ""),
                "commission": body.get("commission", ""),
                "link":       body.get("link", ""),   # ← ตะกร้า (affiliate/product_url)
                "cover":      cover_name,             # ← ปกคลิป (ไฟล์ในโฟลเดอร์เดียวกัน)
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
                    prod = job.get("product", {}) or {}
                    prod["cover"] = cover_name
                    self.db.update(jid, status=GENERATED, video_path=str(out_mp4),
                                   caption=sidecar["name"],
                                   product_json=json.dumps(prod, ensure_ascii=False))
                else:
                    # extension คุมคิวเอง → คลิปมาตรง สร้าง record ใหม่เป็น generated
                    jid = self.db.import_clip({
                        "product_id": pid,
                        "basic_info": {"name": sidecar["name"], "price": sidecar["price"],
                                       "sold_count": sidecar["sold_count"]},
                        "commission": {"rate": sidecar["commission"]},
                        "links": {"affiliate_link": sidecar["link"]},
                        "cover": cover_name,
                    }, GENERATED, str(out_mp4))
                # บันทึกการใช้ Flow (J): 1 คลิป Flow = qty คลิปย่อยที่ต่อกัน
                qty = max(1, len(files) if files else 1)
                cost = (self.budget.cost_per_clip() * qty) if self.budget else 0
                if jid:
                    self.db.add_usage("flow", "clip", qty=qty, cost=cost, job_id=jid)
                    if cost:
                        self.db.add_cost(jid, cost)   # ต้นทุนต่อ job (โชว์ในรายการงาน)

            self.emit_log(f"[FLOW] รับวิดีโอ {pid} → pending (link={'มี' if sidecar['link'] else 'ไม่มี!'})")
            self.ws.broadcast_sync({"type": "flow_video", "pid": pid, "name": sidecar["name"]})
            ready = self.db.count(GENERATED)   # คลิปพร้อมโพสต์
            return {"ok": True, "pid": pid, "ready": ready}

        # ── บัญชี Google Flow (หมุนอัตโนมัติเมื่อเครดิตหมด) ─────────────────
        # เก็บแค่ "อีเมล" ไม่เก็บรหัสผ่าน — ผู้ใช้ล็อกอินเองใน Chrome ครั้งเดียวต่อบัญชี
        # extension ดึงรายการนี้ไปไว้ใน chrome.storage แล้วสลับด้วยเมนูบัญชีของ Google เอง
        def _flow_accounts() -> list:
            if not self.db:
                return []
            raw = self.db.get_config("flow_accounts", "") or ""
            try:
                d = json.loads(raw) if raw.strip() else []
                return d if isinstance(d, list) else []
            except Exception:
                return []

        def _flow_credits() -> dict:
            if not self.db:
                return {}
            raw = self.db.get_config("flow_credits", "") or ""
            try:
                d = json.loads(raw) if raw.strip() else {}
                return d if isinstance(d, dict) else {}
            except Exception:
                return {}

        @app.get("/api/flow/accounts")
        def list_flow_accounts():
            accts = _flow_accounts()
            credits = _flow_credits()
            per_clip = 15
            for a in accts:
                c = credits.get((a.get("email") or "").lower()) or {}
                a["credit"] = c.get("value")
                a["credit_at"] = c.get("at")
                a["usable"] = (not a.get("paused")) and (c.get("value") is None or c.get("value") >= per_clip)
            return {"ok": True, "accounts": accts, "per_clip": per_clip}

        @app.post("/api/flow/accounts")
        async def save_flow_accounts(body: dict):
            """บันทึกรายการบัญชีทั้งชุด — [{email, label, paused}]"""
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            accts = body.get("accounts")
            if not isinstance(accts, list):
                return {"ok": False, "error": "รูปแบบข้อมูลไม่ถูกต้อง"}
            clean, seen = [], set()
            for a in accts:
                if not isinstance(a, dict):
                    continue
                email = (a.get("email") or "").strip().lower()
                if not email or "@" not in email or email in seen:
                    continue
                seen.add(email)
                clean.append({"email": email,
                              "label": (a.get("label") or "").strip(),
                              "paused": bool(a.get("paused"))})
            self.db.set_config("flow_accounts", json.dumps(clean, ensure_ascii=False))
            self.emit_log(f"[FLOW] บัญชีสำหรับหมุนเครดิต: {len(clean)} บัญชี")
            return {"ok": True, "count": len(clean)}

        @app.post("/api/flow/credits")
        async def report_flow_credits(body: dict):
            """extension รายงานเครดิตที่อ่านได้จากหน้า Flow — {email, value}"""
            if not self.db:
                return {"ok": False, "error": "db ไม่พร้อม"}
            self._touch_extension()
            email = (body.get("email") or "").strip().lower()
            val = body.get("value")
            if not email:
                return {"ok": False, "error": "ไม่มีอีเมล"}
            credits = _flow_credits()
            credits[email] = {"value": val, "at": int(time.time())}
            self.db.set_config("flow_credits", json.dumps(credits, ensure_ascii=False))
            return {"ok": True}

        @app.get("/api/flow/status")
        def flow_status():
            # หมายเหตุ: ไม่เรียก _touch_extension() ที่นี่ (จะทำให้ ext_online เป็นจริงเสมอ)
            # ext_online = extension เพิ่งติดต่อเข้ามาภายใน 20 วิ (poller/ping) → ใช้เช็กก่อนสั่งสร้าง
            q = self.db.count(QUEUED)
            ext_online = (time.time() - self._last_ext_ping) < 20 if self._last_ext_ping else False
            out = {"ok": True, "queued": q, "ext_online": ext_online}
            if self.budget:
                out["budget"] = self.budget.snapshot()
            return out

        @app.post("/api/flow/progress")
        async def flow_progress(body: dict):
            """extension รายงานความคืบหน้าการสร้างคลิป → broadcast WS ให้หน้าเว็บโชว์ step checklist.
            stage มาตรฐาน: prompt | submit | rendering | downloading | done | error"""
            self._touch_extension()
            job_id = body.get("jobId")
            self.ws.broadcast_sync({
                "type":   "gen_progress",
                "stage":  (body.get("stage") or "").strip(),
                "detail": body.get("detail", ""),
                "pct":    body.get("pct"),
                "jobId":  job_id,
                "pid":    job_id,   # useStatus route อ่าน msg.pid — คงความเข้ากันได้
            })
            return {"ok": True}

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
                    "autopilot": bool(self.autopilot and self.autopilot.enabled),
                },
                "jobs":       self.db.stats() if self.db else None,
                "budget":     self.budget.snapshot() if self.budget else None,
                "logs":       self.db.log_stats() if self.db else {},
                "last_error": self.db.last_error() if self.db else None,
            }

        # ── Products (G3): แคตตาล็อกสินค้าที่ดูดมา → web เห็นครบ (เพิ่มควบคู่ ไม่แตะ flow) ──

        @app.post("/api/products")
        async def add_products(body: dict):
            """extension ดูดสินค้า → push เข้า DB. รองรับทั้งรายการเดียวและหลายรายการ (products[]).
            เก็บใน SQLite เท่านั้น — ไม่ยุ่งกับ flow gen/คิวใน extension."""
            self._touch_extension()
            if not self.db:
                return {"ok": False, "error": "db not ready"}
            items = body.get("products")
            if not isinstance(items, list):
                items = [body]                      # รายการเดียว = ตัว body เอง
            ids = []
            for p in items:
                if not isinstance(p, dict):
                    continue
                try:
                    ids.append(self.db.add_product(p))
                except Exception as e:
                    self.emit_log(f"[PRODUCTS] เพิ่มไม่สำเร็จ: {e}", level="warn")
            self.emit_log(f"[PRODUCTS] รับสินค้า {len(ids)} รายการ")
            return {"ok": True, "ids": ids, "count": len(ids)}

        @app.get("/api/products")
        def list_products(status: str = None, limit: int = 500, offset: int = 0):
            """รายการสินค้าในแคตตาล็อก (ล่าสุดก่อน)."""
            if not self.db:
                return {"products": []}
            return {"products": self.db.list_products(status, limit, offset)}

        # ── Queue (โครงคิวงานบน DB สำหรับอนาคต — วาง endpoint + เก็บใน DB เท่านั้น) ──

        @app.post("/api/queue/push")
        async def queue_push(body: dict):
            """วางงานลงคิวบน DB (payload อิสระ). รอบนี้ยังไม่บังคับ extension ใช้."""
            self._touch_extension()
            if not self.db:
                return {"ok": False, "error": "db not ready"}
            payload = body.get("payload") if isinstance(body.get("payload"), dict) else body
            qid = self.db.queue_push(payload or {}, int(body.get("priority", 0) or 0))
            return {"ok": True, "id": qid}

        @app.get("/api/queue/next")
        def queue_next():
            """ดูงานถัดไปในคิว (peek ไม่ claim)."""
            if not self.db:
                return {"ok": False, "item": None}
            return {"ok": True, "item": self.db.queue_next()}

        @app.post("/api/queue/claim")
        async def queue_claim(body: dict = None):
            """คว้างานถัดไปแบบ atomic (flip → claimed)."""
            self._touch_extension()
            if not self.db:
                return {"ok": False, "item": None}
            worker = (body or {}).get("worker", "") if isinstance(body, dict) else ""
            return {"ok": True, "item": self.db.queue_claim(worker)}

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
            import os, sys, tempfile, subprocess as sp
            from services.adb.adb_path import adb_bin
            results: dict = {"serial": serial, "adb_ready": bool(self.adb),
                             "python": sys.executable}
            if not self.adb:
                return JSONResponse(results)
            # ใช้ SNAP_REMOTE (/data/local/tmp) — เขียนลง /sdcard/screen_web.png จะไปโผล่ในคลังภาพ
            # ของผู้ใช้ และ cleanup ของ flow โพสต์ก็ลบไปแล้วก่อนหน้า (เขียนกลับซ้ำอีกไม่มีประโยชน์)
            from services.adb.manager import SNAP_REMOTE
            ok, msg = self.adb._adb("shell", "screencap", "-p", SNAP_REMOTE,
                                     serial=serial, timeout=12)
            results["screencap_ok"]  = ok
            results["screencap_msg"] = msg
            if ok:
                local_png = os.path.join(tempfile.gettempdir(), f"vgap_diag_{serial}.png")
                r = sp.run([adb_bin(self.adb.log), "-s", serial, "pull", SNAP_REMOTE,
                             local_png], capture_output=True, timeout=12)
                results["pull_ok"]     = r.returncode == 0
                results["pull_stderr"] = r.stderr.decode(errors="ignore").strip()
                if r.returncode == 0:
                    results["file_bytes"] = os.path.getsize(local_png)
                    try:
                        from PIL import Image
                        import io as _io
                        with Image.open(local_png) as img:
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

        # ── scrcpy live stream (H.264 ดิบ → เบราว์เซอร์ decode เองด้วย WebCodecs) ──

        @app.get("/api/scrcpy/available")
        def scrcpy_available():
            from services.adb.scrcpy_control import _find_server_jar
            return {"available": bool(_find_server_jar())}

        @app.websocket("/ws/scrcpy/{serial}")
        async def scrcpy_ws(ws: WebSocket, serial: str, max_size: int = 1024, max_fps: int = 30):
            await ws.accept()
            loop = asyncio.get_running_loop()
            mgr  = self._scrcpy_manager()

            # executor แยก: start() = adb push (30s) + handshake (20s) และถือ serial lock ทั้งช่วง
            # ถ้าใช้ default pool ร่วมกับ /snapshot และ /stream เปิดฟาร์ม 20 การ์ดพร้อมกัน
            # จะดันงานยาว 20 ตัวเข้าคิวจนสองอันนั้นหยุดตอบไปหลายสิบวินาที
            # pool มี 4 worker — เปิดฟาร์ม 20 การ์ดพร้อมกันแปลว่าการ์ดท้ายคิวต้องรอหลายรอบ
            # ฝั่งเว็บมี watchdog 12 วิ ("ต่อได้แต่ไม่มีภาพ") จึงต้องส่งสัญญาณระหว่างรอ
            # ไม่งั้นการ์ดที่ 5 ขึ้นไปจะขึ้น error แล้วต่อใหม่ → ต่อท้ายคิวใหม่ วนไปทั้งที่ backend ปกติ
            await ws.send_text(json.dumps({"type": "starting"}))
            fut = loop.run_in_executor(
                self._scrcpy_executor(),
                lambda: mgr.get_or_start(serial, max_size=max_size, max_fps=max_fps))
            while True:
                done_, _ = await asyncio.wait({fut}, timeout=3)
                if done_:
                    break
                await ws.send_text(json.dumps({"type": "starting", "queued": True}))
            try:
                sess = fut.result()
            except Exception as e:
                self.log(f"[scrcpy] เปิดสตรีม {serial} ล้มเหลว: {type(e).__name__}: {e}")
                sess = None
            if not sess:
                await ws.send_text(json.dumps({"type": "error",
                                               "message": "เปิดสตรีมไม่ได้ — ตรวจว่าติดตั้ง scrcpy แล้ว"}))
                await ws.close()
                return

            q: asyncio.Queue = asyncio.Queue(maxsize=300)
            state = {"need_key": False, "closed": False}

            def _put(item):
                if q.full():
                    # เน็ต/เบราว์เซอร์ตามไม่ทัน → ทิ้งคิวเก่าแล้วรอ key frame ใหม่ (กันภาพแตก)
                    while not q.empty():
                        try: q.get_nowait()
                        except Exception: break
                    state["need_key"] = True
                    sess.request_key_frame()
                try: q.put_nowait(item)
                except Exception: pass

            def on_event(kind, payload):
                try:
                    loop.call_soon_threadsafe(_put, (kind, payload))
                except RuntimeError:
                    pass

            sid = sess.subscribe(on_event)
            if sid < 0 or not sess.running:
                # session โดน stop ระหว่างช่องว่างระหว่าง get_or_start กับ subscribe
                # (คนอื่นขอความละเอียดสูงกว่า / timer ของ release ทำงานพอดี)
                # ต้องปิด ws ให้เบราว์เซอร์รู้ตัว ไม่งั้นค้างรอเฟรมที่ไม่มีวันมา = จอดำถาวร
                self.log(f"[scrcpy] ws {serial} เข้า session ที่ปิดไปแล้ว — ให้ต่อใหม่")
                if sid >= 0:
                    # ต้องถอน subscriber ออกก่อน ไม่งั้น subscriber_count ค้าง ≥ 1 ตลอดกาล
                    # → release()._later() ไม่มีวันผ่านเงื่อนไข = app_process/forward/thread ค้างยันปิดโปรแกรม
                    if sess.unsubscribe(sid) == 0:
                        mgr.release(serial, sess)
                await ws.send_text(json.dumps({"type": "error",
                                               "message": "สตรีมถูกปิดระหว่างเชื่อมต่อ — กดลองใหม่"}))
                await ws.close()
                return
            if sess.width:
                await ws.send_text(json.dumps({"type": "meta", "codec": sess.codec,
                                               "width": sess.width, "height": sess.height}))

            async def pump():
                """คนเดียวที่เขียน WebSocket — ASGI ไม่ serialize ให้ ถ้า recv() ส่งเองพร้อมกัน
                เฟรมจะสลับกันหรือได้ RuntimeError จาก ASGI layer"""
                while True:
                    kind, payload = await q.get()
                    if kind == "text":                 # ข้อความจาก recv() ฝากมาส่ง
                        await ws.send_text(json.dumps(payload))
                        continue
                    if kind == "meta":
                        if payload.get("closed"):
                            await ws.send_text(json.dumps({"type": "closed"}))
                            return
                        await ws.send_text(json.dumps({"type": "meta", **payload}))
                        continue
                    flags, data = payload
                    if state["need_key"]:
                        if not (flags & 0b11):      # ข้ามจนกว่าจะเจอ config/key frame
                            continue
                        state["need_key"] = False
                    await ws.send_bytes(bytes([flags]) + data)

            async def recv():
                while True:
                    msg = json.loads(await ws.receive_text())
                    t = msg.get("t")
                    if t == "touch":
                        sess.touch(int(msg.get("action", 0)),
                                   float(msg.get("x", 0)), float(msg.get("y", 0)),
                                   int(msg.get("pointerId", 0xFFFFFFFFFFFFFFFF)))
                    elif t == "scroll":
                        sess.scroll(float(msg.get("x", 0)), float(msg.get("y", 0)),
                                    float(msg.get("h", 0)), float(msg.get("v", 0)))
                    elif t == "key":
                        code = msg.get("code", "KEYCODE_HOME")
                        # sess.key() อาจตกไปเรียก adb (บล็อก) → ห้ามรันในลูป event
                        ok = await loop.run_in_executor(None, sess.key, code)
                        if not ok:
                            # เดิมเงียบสนิท — ผู้ใช้กดปุ่มบนเว็บแล้วไม่มีอะไรเกิดขึ้นและไม่มี log
                            self.log(f"[scrcpy] ส่งปุ่ม {code} ไม่สำเร็จ ({serial})")
                            _put(("text", {"type": "warn",
                                           "message": f"ส่งปุ่ม {code} ไม่สำเร็จ"}))
                    elif t == "key_frame":
                        sess.request_key_frame()

            tasks = [asyncio.create_task(pump()), asyncio.create_task(recv())]
            try:
                # asyncio.wait ไม่ raise — task ที่ตายเพราะ exception จริง (struct.error จาก
                # touch พิกัดเกิน, JSONDecodeError, ValueError) จะถูก cancel ทิ้งใน finally
                # แล้ว exception หายไปเลย → จอดับเงียบ log ว่างเปล่า จึงต้องอ่านออกมาก่อน
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for t in done:
                    if t.cancelled():
                        continue
                    exc = t.exception()
                    if exc and not isinstance(exc, (WebSocketDisconnect, asyncio.CancelledError)):
                        self.log(f"[scrcpy] ws {serial} หลุด: {type(exc).__name__}: {exc}")
            except Exception as e:
                self.log(f"[scrcpy] ws {serial} พัง: {type(e).__name__}: {e}")
            finally:
                for t in tasks:
                    t.cancel()
                if sess.unsubscribe(sid) == 0:
                    mgr.release(serial, sess)      # ส่ง session ที่ ws ตัวนี้ผูกอยู่ไปด้วย
                try: await ws.close()
                except Exception: pass

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

        # ── เสิร์ฟหน้าเว็บ (Next static export) จาก server เดียวกัน → เปิด http://localhost:PORT ใช้ได้ครบจบ ──
        # mount ท้ายสุด → /api, /video, /stream, /snapshot, /ws มาก่อนเสมอ ที่เหลือ fallback เป็นไฟล์เว็บ
        try:
            import sys as _sys
            from pathlib import Path as _P
            # หา web/out: โหมดพกพา (frozen exe) = ข้างไฟล์ .exe · โหมด source = ราก repo
            _cands = []
            if getattr(_sys, "frozen", False):
                _cands.append(_P(_sys.executable).resolve().parent / "web" / "out")
            _cands.append(_P(__file__).resolve().parents[2] / "web" / "out")
            web_out = next((c for c in _cands if (c / "index.html").exists()), _cands[-1])
            if web_out.is_dir() and (web_out / "index.html").exists():
                from fastapi.staticfiles import StaticFiles
                app.mount("/", StaticFiles(directory=str(web_out), html=True), name="web")
                print(f"[web] เสิร์ฟหน้าเว็บจาก {web_out} → http://localhost:{self.port}")
            else:
                print(f"[web] ยังไม่มี web/out (ยังไม่ได้ build หน้าเว็บ) — เปิดได้เฉพาะ API · "
                      f"build ครั้งเดียวด้วย: cd web && npm run build")
        except Exception as _e:
            print(f"[web] mount หน้าเว็บไม่สำเร็จ: {_e}")

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

    def _scrcpy_manager(self):
        """ScrcpyManager ตัวเดียวทั้งโปรแกรม — สร้างตอนใช้ครั้งแรก"""
        if self.scrcpy is None:
            from services.adb.scrcpy_stream import ScrcpyManager
            self.scrcpy = ScrcpyManager(log=self.log)
        return self.scrcpy

    def _scrcpy_executor(self):
        """pool แยกสำหรับ start สตรีม (งานยาว ~50 วิ) — ห้ามไปเบียด /snapshot กับ /stream"""
        ex = getattr(self, "_scrcpy_pool", None)
        if ex is None:
            from concurrent.futures import ThreadPoolExecutor
            ex = self._scrcpy_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="scrcpy-start")
        return ex

    def _ensure_mirror(self, serial: str):
        if serial not in self.mirrors and self.adb:
            from services.adb.mirror import ScreenMirror
            m = ScreenMirror(self.adb)
            self.mirrors[serial] = m

    # ── Extension presence (P2.1) ─────────────────────────────

    EXT_ONLINE_WINDOW = 90   # วินาที — ถ้า extension ติดต่อภายในนี้ ถือว่า "เชื่อมอยู่"

    def _chrome_last_profile(self):
        """อ่านชื่อโฟลเดอร์ profile ที่ Chrome ใช้ล่าสุด (Windows) จาก Local State — กัน profile picker."""
        import os, json
        from pathlib import Path
        try:
            base = Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "User Data"
            ls = base / "Local State"
            if not ls.exists():
                return None
            d = json.loads(ls.read_text(encoding="utf-8", errors="ignore"))
            prof = d.get("profile", {})
            last = prof.get("last_used") or (prof.get("last_active_profiles") or [None])[0]
            return last or "Default"
        except Exception:
            return None

    def _open_extensions_page(self) -> dict:
        """เปิด chrome://extensions + เผยโฟลเดอร์ extension ใน Finder/Explorer ให้ Load unpacked ง่าย."""
        import sys, os, shutil, subprocess
        from pathlib import Path
        ext = Path(__file__).resolve().parents[2] / "extension"
        if sys.platform == "darwin":
            cands = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                     "/Applications/Chromium.app/Contents/MacOS/Chromium",
                     shutil.which("google-chrome"), shutil.which("chromium")]
        elif os.name == "nt":
            pf  = os.environ.get("ProgramFiles",      r"C:\Program Files")
            pfx = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
            cands = [pf + r"\Google\Chrome\Application\chrome.exe",
                     pfx + r"\Google\Chrome\Application\chrome.exe", shutil.which("chrome")]
        else:
            cands = [shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chromium-browser")]
        chrome = next((c for c in cands if c and os.path.exists(c)), None)
        opened = False
        # Chrome เมิน URL chrome:// ที่ส่งทาง command-line เมื่อ Chrome เปิดอยู่แล้ว (แอปเปิด --app ไว้)
        # → Mac ใช้ osascript สั่ง Chrome เปิดแท็บใน profile ที่กำลังรัน (ไม่เด้ง profile picker)
        if sys.platform == "darwin":
            script = ('tell application "Google Chrome"\n'
                      '  activate\n'
                      '  if (count of windows) = 0 then\n'
                      '    make new window\n'
                      '    set URL of active tab of front window to "chrome://extensions/"\n'
                      '  else\n'
                      '    tell front window to make new tab with properties {URL:"chrome://extensions/"}\n'
                      '  end if\n'
                      'end tell')
            try:
                r = subprocess.run(["osascript", "-e", script], capture_output=True, timeout=8)
                opened = (r.returncode == 0)
            except Exception:
                opened = False
        # Windows/Linux: แอปเปิด Chrome เป็น "แท็บ" (Chrome รันอยู่แล้ว) → ยิง chrome://extensions/
        #   เข้าแท็บใหม่ในหน้าต่างเดิมได้เลย ไม่เด้ง profile picker (picker เด้งเฉพาะตอน Chrome ยังไม่เปิด)
        #   Windows เพิ่ม --profile-directory ตาม profile ที่เปิดล่าสุด ถ้าอ่านได้ (กัน picker กรณี Chrome เพิ่งปิด)
        if not opened and chrome:
            try:
                args = [chrome]
                if os.name == "nt":
                    prof = self._chrome_last_profile()
                    if prof:
                        args.append(f"--profile-directory={prof}")
                args.append("chrome://extensions/")
                subprocess.Popen(args); opened = True
            except Exception:
                opened = False
        try:                                      # เผยโฟลเดอร์ให้ลาก/เลือก
            if sys.platform == "darwin": subprocess.Popen(["open", "-R", str(ext)])
            elif os.name == "nt":        subprocess.Popen(["explorer", str(ext)])
            else:                        subprocess.Popen(["xdg-open", str(ext)])
        except Exception:
            pass
        hint = "" if opened else (
            "พิมพ์ chrome://extensions ในแถบที่อยู่ Chrome เอง → เปิด 'โหมดนักพัฒนา' (Developer mode) "
            "→ กด 'Load unpacked' แล้วเลือกโฟลเดอร์ที่เพิ่งเผยใน Explorer")
        return {"ok": True, "opened_chrome": opened, "path": str(ext), "hint": hint}

    def _touch_extension(self):
        """extension เพิ่งติดต่อเข้ามา (เรียก /api/flow/*) — จำเวลาไว้ให้ onboarding เช็ค 'เชื่อมแล้ว'."""
        self._last_ext_ping = time.time()

    def _extension_state(self) -> dict:
        ts = self._last_ext_ping
        connected = bool(ts and (time.time() - ts) < self.EXT_ONLINE_WINDOW)
        return {"connected": connected, "last_ping_ts": int(ts) if ts else 0}

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

    # ── Start/Stop ────────────────────────────────────────────

    def start(self):
        self._started_at = time.time()
        # กันพอร์ตชน: ถ้าพอร์ตที่ตั้งไว้ (3001) ไม่ว่าง → เลือกพอร์ตว่างถัดไป
        # หน้าเว็บใช้ origin ตัวเอง (window.location) จึงตามพอร์ตใหม่ได้เอง
        import socket as _sk
        _pref = self.port
        for _cand in [_pref] + list(range(_pref + 1, _pref + 21)):
            _s = _sk.socket(_sk.AF_INET, _sk.SOCK_STREAM)
            try:
                _s.bind(("127.0.0.1", _cand)); _s.close()
                self.port = _cand; break
            except OSError:
                _s.close(); continue
        if self.port != _pref:
            self.log(f"[WEB] พอร์ต {_pref} ไม่ว่าง → ใช้พอร์ต {self.port} แทน")

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
        if self.scrcpy:
            self.scrcpy.stop_all()
        pool = getattr(self, "_scrcpy_pool", None)
        if pool:
            pool.shutdown(wait=False)
            self._scrcpy_pool = None
