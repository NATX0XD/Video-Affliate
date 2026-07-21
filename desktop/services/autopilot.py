"""
Auto-post loop — หัวใจ near-zero-touch ของ desktop.

วนทำงานตลอดเวลา: คลิปไหนพร้อม (generated) + เงื่อนไขผ่าน → โพสต์เองทันที
เคารพ: โหมดอนุมัติ (auto/hold), ตารางเวลา, โควต้า/วัน, มีมือถือต่อ
สถานะเปิด/ปิดเก็บใน DB (app_config) → เปิดเครื่องมาก็ทำงานต่อเอง (always-on)
"""
import json
import threading
import time
import random
from pathlib import Path
from datetime import datetime
from typing import Optional, Callable

import config as cfg
from services.db import GENERATED, POSTING
from services.platforms import make_poster, ready_enabled


class AutoPilot:
    def __init__(self, db, adb):
        self.db  = db
        self.adb = adb
        self.log: Callable = print
        self.on_status_change: Optional[Callable] = None   # (pid, status)
        self.on_stats_update:  Optional[Callable] = None   # (done, err, remaining)

        self._enabled = False
        self._thread: Optional[threading.Thread] = None
        self._stop = False
        self._workers = {}      # serial → thread (โพสต์ขนานต่อเครื่อง)
        self._device_locks = {}          # serial → Lock (T5: กันโพสต์ชนกันต่อเครื่อง)
        self._locks_guard = threading.Lock()
        self.done_count = 0
        self.err_count  = 0

    def _device_lock(self, serial: str) -> threading.Lock:
        """Lock ต่อ device serial — กันสองงาน (worker + ปุ่มโพสต์เลย/ทดสอบ) สั่งโพสต์
        เครื่องเดียวพร้อมกัน (T5). คนละเครื่อง = คนละ lock → ยังโพสต์ขนานได้."""
        with self._locks_guard:
            lk = self._device_locks.get(serial)
            if lk is None:
                lk = threading.Lock()
                self._device_locks[serial] = lk
            return lk

    # ── control ───────────────────────────────────────────────

    @property
    def enabled(self) -> bool:
        return self._enabled

    def restore(self):
        """คืนสถานะโหมดอัตโนมัติจากครั้งก่อน (จำค่าใน DB) — ครั้งแรก default ปิดเพื่อความปลอดภัย.
        (ปุ่ม โพสต์เลย/ทดสอบ ยังใช้ได้เสมอไม่ว่าออโต้เปิดหรือปิด)"""
        on = False
        if self.db:
            on = (self.db.get_config("autopilot_on", "0") == "1")
        self._enabled = on
        self.log(f"[AUTO] คืนสถานะโหมดอัตโนมัติ: {'เปิด' if on else 'ปิด'}")

    def set_enabled(self, on: bool):
        self._enabled = bool(on)
        if self.db:
            self.db.set_config("autopilot_on", "1" if on else "0")
        self.log(f"[AUTO] {'เปิด' if on else 'ปิด'}โหมดโพสต์อัตโนมัติ")

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._loop, daemon=True, name="AutoPilot")
        self._thread.start()

    def stop(self):
        self._stop = True

    def post_job_now(self, job_id: int) -> bool:
        """โพสต์คลิปนี้ทันที (จากหน้ารีวิว — ไม่สนตารางเวลา/โหมด)."""
        job = self.db.get(job_id)
        if not job or job["status"] != GENERATED:
            return False
        if not ready_enabled(cfg.load()):
            self.log("[AUTO] โพสต์ไม่ได้ — ยังไม่ได้เลือกแพลตฟอร์มปลายทาง (ตั้งค่า)")
            return False
        serial = self._pick_device()
        if not serial:
            self.log("[AUTO] โพสต์ไม่ได้ — ไม่มีมือถือเชื่อมต่อ")
            return False
        self.db.set_status(job_id, POSTING)
        job = self.db.get(job_id)
        threading.Thread(target=lambda: self._post_one(job, serial, cfg.load()),
                         daemon=True).start()
        return True

    def dry_post_job(self, job_id: int) -> bool:
        """ทดสอบโพสต์ (dry) — รัน ADB flow ถึง caption แล้วหยุดก่อนโพสต์จริง.
        ไม่เปลี่ยนสถานะคลิป ไม่ย้ายไฟล์ ไม่นับสถิติ — ใช้จูน flow ปลอดภัย."""
        job = self.db.get(job_id)
        if not job or job["status"] != GENERATED:
            self.log("[ทดสอบ] คลิปนี้ไม่พร้อม (ต้องเป็นสถานะ generated)")
            return False
        s = cfg.load()
        if not ready_enabled(s):
            self.log("[ทดสอบ] ยังไม่ได้เลือกแพลตฟอร์มปลายทาง (ตั้งค่า)")
            return False
        serial = self._pick_device()
        if not serial:
            self.log("[ทดสอบ] ไม่มีมือถือเชื่อมต่อ")
            return False
        threading.Thread(target=lambda: self._dry_post_one(job, serial, s),
                         daemon=True).start()
        return True

    def _dry_post_one(self, job, serial, s):
        with self._device_lock(serial):   # T5: ใช้ lock เดียวกับโพสต์จริง กันชนเครื่องเดียว
            product = job["product"]
            name = (product.get("basic_info", {}) or {}).get("name", "")[:35]
            video = Path(job["video_path"]) if job.get("video_path") else None
            if not video or not video.exists():
                self.log("[ทดสอบ] ไฟล์วิดีโอหาย — สร้างคลิปก่อน")
                return
            all_ready = ready_enabled(s)
            plats = [p for p in (self._device_platforms(serial) or []) if p in all_ready] or all_ready
            self.log(f"[ทดสอบ] โพสต์ (dry): {name} → {', '.join(plats)} — พิมพ์ caption แล้วหยุดก่อนโพสต์จริง")
            dev = self.adb.devices.get(serial) if self.adb else None
            if dev:
                dev.posting = True
            try:
                for pk in plats:
                    p = make_poster(pk, self.adb, self.log, s)
                    if hasattr(p, "usage_cb"):
                        p.usage_cb = self._record_usage
                    r = p.process(serial, video, product, dry_run=True,
                                  coords_override=self._coords_override(serial))   # ★ dry: หยุดก่อนกดโพสต์
                    self.log(f"[ทดสอบ] {pk}: " + ("ผ่าน flow ✓ (caption ติด หยุดก่อนโพสต์)" if r
                             else "ติดบางสเตป — ดู log ด้านบนว่าค้างปุ่มไหน"))
            finally:
                if dev:
                    dev.posting = False
            self.log("[ทดสอบ] เสร็จ — ไม่ได้โพสต์จริง สถานะคลิปไม่เปลี่ยน")

    # ── loop ──────────────────────────────────────────────────

    def _loop(self):
        """Manager: ดูแลให้ทุกเครื่องที่ต่ออยู่มี worker โพสต์ของตัวเอง (ขนาน)."""
        while not self._stop:
            try:
                if self._enabled and self.adb:
                    for d in list(self.adb.devices.values()):
                        if d.status != "device":
                            continue
                        w = self._workers.get(d.serial)
                        if not w or not w.is_alive():
                            t = threading.Thread(target=self._device_worker, args=(d.serial,),
                                                  daemon=True, name=f"AP-{d.serial}")
                            self._workers[d.serial] = t
                            t.start()
            except Exception as e:
                self.log(f"[AUTO] ข้อผิดพลาด manager: {e}")
            time.sleep(3)

    def _device_worker(self, serial: str):
        """โพสต์คลิปทีละตัวบนเครื่องนี้ ขนานกับเครื่องอื่น."""
        while not self._stop and self._enabled and self._device_online(serial):
            s = cfg.load()
            if s.get("review_mode") == "hold" or not self._can_post_now(s):
                time.sleep(4); continue
            if not ready_enabled(s):              # ยังไม่เลือกแพลตฟอร์มปลายทาง → ยังไม่โพสต์
                time.sleep(5); continue
            if not self._health_ok(serial, s):    # ร้อนเกิน/แบตต่ำ → พักเครื่อง (E)
                time.sleep(8); continue
            job = self.db.claim(GENERATED, POSTING)   # atomic → ไม่ชนกับเครื่องอื่น
            if not job:
                time.sleep(4); continue
            self._post_one(job, serial, s, self._device_platforms(serial))
            self._sleep_delay(s)

    # ── ดูแลเครื่องอัตโนมัติ: ร้อนเกิน/แบตต่ำ → พักเครื่อง (E) ──
    def _health_ok(self, serial: str, s) -> bool:
        """ด่านสุขภาพก่อนรับงาน. คืน True ถ้าเครื่องพร้อมโพสต์, False = กำลังพัก."""
        d = self.adb.devices.get(serial) if self.adb else None
        if not d:
            return True
        if not bool(s.get("cooldown_enabled", True)):
            if d.cooldown_reason:                     # เพิ่งปิดระบบ → ล้างสถานะพักค้าง
                d.cooldown_reason = ""; d.cooldown_until = 0.0
            return True
        now = time.time()
        temp_max = float(s.get("temp_max", 0) or 0)
        temp_res = float(s.get("temp_resume", 0) or 0)
        bat_min  = int(s.get("battery_min", 0) or 0)
        bat_res  = int(s.get("battery_resume", 0) or 0)
        cd_secs  = int(s.get("cooldown_minutes", 10) or 10) * 60

        # กำลังพักอยู่ → เช็คเงื่อนไขฟื้น (hysteresis)
        if d.cooldown_reason == "hot":
            if now < d.cooldown_until:
                return False                          # ยังไม่ครบเวลาพักขั้นต่ำ
            if temp_max and d.temp >= temp_res:       # ครบเวลาแล้วแต่ยังร้อน → พักต่อ
                d.cooldown_until = now + cd_secs
                return False
            self._resume(d, f"เย็นลงแล้ว {d.temp}°C")
        elif d.cooldown_reason == "battery":
            if bat_min and d.battery < bat_res:       # ยังชาร์จไม่ถึงเกณฑ์ฟื้น
                return False
            self._resume(d, f"ชาร์จถึง {d.battery}% แล้ว")

        # ตรวจ trigger ใหม่
        if temp_max and d.temp >= temp_max:
            d.cooldown_reason = "hot"; d.cooldown_until = now + cd_secs
            self.log(f"[ดูแล] {self._dname(d)} ร้อน {d.temp}°C ≥ {temp_max:g}°C → "
                     f"พักเครื่อง {cd_secs // 60} นาที")
            return False
        if bat_min and d.battery <= bat_min:
            d.cooldown_reason = "battery"; d.cooldown_until = now + cd_secs
            tail = f"พักจนชาร์จถึง {bat_res}%" if d.charging else "พัก — เสียบชาร์จด่วน"
            self.log(f"[ดูแล] {self._dname(d)} แบตต่ำ {d.battery}% ≤ {bat_min}% → {tail}")
            return False
        return True

    def _resume(self, d, why: str):
        d.cooldown_reason = ""; d.cooldown_until = 0.0
        self.log(f"[ดูแล] {self._dname(d)} กลับมาโพสต์ต่อ ({why})")

    def _dname(self, d) -> str:
        label = self.db.get_config(f"dev_label:{d.serial}", "") if self.db else ""
        return label or d.model or d.serial

    def _record_usage(self, service: str, kind: str, qty: int, tokens: int):
        """บันทึกการใช้ AI ลง usage ledger (J) — Gemini verify ตอนโพสต์."""
        try:
            s = cfg.load()
            cost = ((tokens / 1000.0) * float(s.get("gemini_cost_per_1k", 0) or 0)
                    if service == "gemini" else 0)
            self.db.add_usage(service, kind, qty=qty, tokens=tokens, cost=round(cost, 4))
        except Exception:
            pass

    def _device_platforms(self, serial: str) -> list:
        raw = self.db.get_config(f"dev_platforms:{serial}", "") or ""
        return [p for p in raw.split(",") if p]

    def _coords_override(self, serial: str):
        """พิกัด calibrate ต่อเครื่อง (JSON {key:[rx,ry]}) — poster เอาไปทับ default.
        ไม่มี/พังก็คืน None → poster ใช้พิกัดเดิม 100%."""
        if not self.db:
            return None
        raw = self.db.get_config(f"post_coords:{serial}", "") or ""
        if not raw.strip():
            return None
        try:
            d = json.loads(raw)
            return d if isinstance(d, dict) and d else None
        except Exception:
            return None

    def _device_online(self, serial: str) -> bool:
        if not self.adb:
            return False
        d = self.adb.devices.get(serial)
        return bool(d and d.status == "device")

    def _sleep_delay(self, s):
        max_per_day  = int(s.get("post_max_per_day", 0) or 0)
        active_from  = int(s.get("post_active_from", 0) or 0)
        active_to    = int(s.get("post_active_to", 24) or 24)
        active_secs  = max(1, active_to - active_from) * 3600
        base = int(active_secs / max_per_day) if max_per_day > 0 else 60
        base = max(10, base)
        delay = random.randint(max(5, int(base * 0.8)), int(base * 1.2))
        for _ in range(delay):
            if self._stop or not self._enabled:
                break
            time.sleep(1)

    def _post_one(self, job, serial, s, dev_plats=None):
        with self._device_lock(serial):   # T5: กันโพสต์ชนกันบนเครื่องเดียว
            jid = job["id"]; product = job["product"]
            pid = product.get("product_id") or str(jid)
            name = (product.get("basic_info", {}) or {}).get("name", "")[:35]
            video = Path(job["video_path"]) if job.get("video_path") else None

            self._status(pid, "posting")
            dev = self.adb.devices.get(serial) if self.adb else None
            if dev:
                dev.posting = True                    # เครื่องนี้กำลังทำงาน (E)
            if not video or not video.exists():
                self.db.mark_error(jid, "ไฟล์วิดีโอหาย")
                if dev: dev.posting = False
                self.err_count += 1; self._status(pid, "error"); self._stats(); return

            all_ready = ready_enabled(s)
            # เครื่องนี้รับเฉพาะแพลตฟอร์มที่กำหนด (ถ้าไม่ตั้ง → ทั้งหมด)
            plats = [p for p in (dev_plats or []) if p in all_ready] or all_ready
            self.log(f"[AUTO] โพสต์: {name} → {', '.join(plats)}")
            results = []   # แต่ละตัว: True=สำเร็จ · False=ล้มจริง · "unverified"=ยืนยันไม่ได้ (T4)
            try:
                for pk in plats:
                    p = make_poster(pk, self.adb, self.log, s)
                    if hasattr(p, "usage_cb"):
                        p.usage_cb = self._record_usage   # บันทึกการใช้ Gemini ตอน verify (J)
                    r = p.process(serial, video, product,
                                  coords_override=self._coords_override(serial))
                    if r is None:
                        continue
                    if r == "unverified":     # T4: โพสต์แล้วแต่ยืนยันผลไม่ได้ — ไม่นับเป็นสถิติ (ไม่รู้ผล)
                        results.append("unverified")
                        continue
                    try:
                        _price = float((product.get("basic_info", {}) or {}).get("price", 0) or 0)
                        _comm  = float((product.get("commission", {}) or {}).get("rate", 0) or 0)
                        self.db.add_platform_post(pk, bool(r), jid, price=_price, commission=_comm)
                    except Exception:
                        pass
                    results.append(bool(r))
            finally:
                if dev:
                    dev.posting = False

            # ตัดสินผลรวม (ลำดับความสำคัญ): ล้มจริง > ยืนยันไม่ได้ > สำเร็จ (T4)
            if not results or any(r is False for r in results):
                res = self.db.record_failure(jid, GENERATED, "โพสต์ไม่สำเร็จ")
                if res["retrying"]:
                    self.log(f"[AUTO] {name} พลาด — ลองใหม่ใน {res['retry_in']}s")
                    self._status(pid, "retry")
                else:
                    new_path = self._move(video, cfg.ERROR_DIR)
                    self.db.update(jid, video_path=str(new_path))
                    self.err_count += 1; self._status(pid, "error")
            elif any(r == "unverified" for r in results):
                # ยืนยันไม่ได้ → ห้าม move เข้า DONE เงียบ, ห้าม retry อัตโนมัติ (กัน double-post)
                # → พักไว้ที่ error (terminal) + แจ้ง user ให้เปิดแอปตรวจเอง
                new_path = self._move(video, cfg.ERROR_DIR)
                self.db.mark_error(jid, "โพสต์แล้วแต่ยืนยันผลไม่ได้ — โปรดเปิดแอปตรวจว่าโพสต์ขึ้นจริงไหม")
                self.db.update(jid, video_path=str(new_path))
                self.err_count += 1
                self.log(f"[AUTO] ⚠ {name}: ยืนยันผลไม่ได้ — ไม่ย้ายเข้า 'เสร็จสิ้น' อัตโนมัติ โปรดตรวจเอง")
                self._status(pid, "error")
            else:
                new_path = self._move(video, cfg.DONE_DIR)
                self.db.mark_posted(jid, video_path=str(new_path))
                self.done_count += 1; self._status(pid, "done")
            self._stats()

    # ── helpers ───────────────────────────────────────────────

    def _can_post_now(self, s) -> bool:
        hr = datetime.now().hour
        fr = int(s.get("post_active_from", 0) or 0)
        to = int(s.get("post_active_to", 24) or 24)
        if not (fr <= hr < to):
            return False
        cap = int(s.get("post_max_per_day", 0) or 0)
        if cap and self.db.count_posted_today() >= cap:
            return False
        return True

    def _pick_device(self) -> str:
        if not self.adb:
            return ""
        for d in self.adb.devices.values():
            if d.status == "device":
                return d.serial
        return ""

    def _move(self, video: Path, dest_dir: Path) -> Path:
        dest_dir.mkdir(parents=True, exist_ok=True)
        new_path = dest_dir / video.name
        try:
            video.rename(new_path)
            # ย้าย sidecar ทั้งหมด: .json + ปก _cover.* (ไม่งั้นรูปปกค้างใน pending → จอดำหลังโพสต์)
            sides = [video.with_suffix(".json")] + list(video.parent.glob(f"{video.stem}_cover.*"))
            for side in sides:
                if side.exists():
                    try: side.rename(dest_dir / side.name)
                    except Exception: pass
            return new_path
        except Exception:
            return video

    def _status(self, pid, status):
        if self.on_status_change:
            self.on_status_change(pid, status)

    def _stats(self):
        if self.on_stats_update:
            self.on_stats_update(self.done_count, self.err_count, self.db.count(GENERATED))
