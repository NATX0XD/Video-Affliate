"""
Auto-post loop — หัวใจ near-zero-touch ของ desktop.

วนทำงานตลอดเวลา: คลิปไหนพร้อม (generated) + เงื่อนไขผ่าน → โพสต์เองทันที
เคารพ: โหมดอนุมัติ (auto/hold), ตารางเวลา, โควต้า/วัน, มีมือถือต่อ
สถานะเปิด/ปิดเก็บใน DB (app_config) → เปิดเครื่องมาก็ทำงานต่อเอง (always-on)
"""
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
        self.done_count = 0
        self.err_count  = 0

    # ── control ───────────────────────────────────────────────

    @property
    def enabled(self) -> bool:
        return self._enabled

    def restore(self):
        """อ่านสถานะที่เคยเปิดไว้จาก DB (always-on หลังรีสตาร์ท)."""
        self._enabled = (self.db.get_config("autopilot_on") == "1") if self.db else False
        if self._enabled:
            self.log("[AUTO] เปิดโหมดอัตโนมัติต่อจากครั้งก่อน")

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
        serial = self._pick_device()
        if not serial:
            self.log("[AUTO] โพสต์ไม่ได้ — ไม่มีมือถือเชื่อมต่อ")
            return False
        self.db.set_status(job_id, POSTING)
        job = self.db.get(job_id)
        threading.Thread(target=lambda: self._post_one(job, serial, cfg.load()),
                         daemon=True).start()
        return True

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
            job = self.db.claim(GENERATED, POSTING)   # atomic → ไม่ชนกับเครื่องอื่น
            if not job:
                time.sleep(4); continue
            self._post_one(job, serial, s)
            self._sleep_delay(s)

    def _device_online(self, serial: str) -> bool:
        if not self.adb:
            return False
        d = self.adb.devices.get(serial)
        return bool(d and d.status == "device")

    def _sleep_delay(self, s):
        delay = random.randint(int(s.get("post_delay_min", 30)), int(s.get("post_delay_max", 120)))
        for _ in range(delay):
            if self._stop or not self._enabled:
                break
            time.sleep(1)

    def _post_one(self, job, serial, s):
        jid = job["id"]; product = job["product"]
        pid = product.get("product_id") or str(jid)
        name = (product.get("basic_info", {}) or {}).get("name", "")[:35]
        video = Path(job["video_path"]) if job.get("video_path") else None

        self._status(pid, "posting")
        if not video or not video.exists():
            self.db.mark_error(jid, "ไฟล์วิดีโอหาย")
            self.err_count += 1; self._status(pid, "error"); self._stats(); return

        plats = ready_enabled(s)
        self.log(f"[AUTO] โพสต์: {name} → {', '.join(plats)}")
        results = []
        for pk in plats:
            p = make_poster(pk, self.adb, self.log, s)
            r = p.process(serial, video, product)
            if r is None:
                continue
            results.append(bool(r))
        ok = bool(results) and all(results)

        if ok:
            new_path = self._move(video, cfg.DONE_DIR)
            self.db.mark_posted(jid, video_path=str(new_path))
            self.done_count += 1; self._status(pid, "done")
        else:
            res = self.db.record_failure(jid, GENERATED, "โพสต์ไม่สำเร็จ")
            if res["retrying"]:
                self.log(f"[AUTO] {name} พลาด — ลองใหม่ใน {res['retry_in']}s")
                self._status(pid, "retry")
            else:
                new_path = self._move(video, cfg.ERROR_DIR)
                self.db.update(jid, video_path=str(new_path))
                self.err_count += 1; self._status(pid, "error")
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
            side = video.with_suffix(".json")
            if side.exists():
                side.rename(dest_dir / side.name)
            return new_path
        except Exception:
            return video

    def _status(self, pid, status):
        if self.on_status_change:
            self.on_status_change(pid, status)

    def _stats(self):
        if self.on_stats_update:
            self.on_stats_update(self.done_count, self.err_count, self.db.count(GENERATED))
