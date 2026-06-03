import threading
import time
import random
from pathlib import Path
from typing import Optional, Callable
import config as cfg
from services.video_generator import VideoGenerator
from services.adb.autoposter import AutoPoster


class Worker:
    def __init__(self, settings: dict, adb_manager):
        self.settings   = settings
        self.adb        = adb_manager
        self.log: Callable = print

        self._running  = False
        self._thread: Optional[threading.Thread] = None
        self._serial   = ""

        self._queue: list  = []
        self._statuses: dict = {}

        self.done_count = 0
        self.err_count  = 0

        # UI callbacks
        self.on_status_change: Optional[Callable] = None  # (pid, status)
        self.on_stats_update:  Optional[Callable] = None  # (done, err, queue_len)
        self.on_finished:      Optional[Callable] = None

    # ── Queue management ──────────────────────────────────────

    def add_products(self, products: list):
        for p in products:
            pid = p.get("product_id") or f"p{int(time.time() * 1000)}"
            p["product_id"] = pid
            self._queue.append(p)
            self._statuses[pid] = "pending"

    def clear_queue(self):
        self._queue.clear()
        self._statuses.clear()

    @property
    def queue(self) -> list:
        return self._queue

    @property
    def statuses(self) -> dict:
        return self._statuses

    @property
    def is_running(self) -> bool:
        return self._running

    # ── Control ───────────────────────────────────────────────

    def start(self, serial: str) -> bool:
        if self._running:
            self.log("[WORKER] กำลังทำงานอยู่แล้ว")
            return False
        if not serial:
            self.log("[WORKER] ไม่มีมือถือที่เชื่อมต่อ")
            return False
        if not self.settings.get("google_api_key"):
            self.log("[WORKER] ยังไม่ได้ใส่ Google API Key")
            return False
        if not self._queue:
            self.log("[WORKER] Queue ว่างเปล่า ส่งสินค้าจาก Extension ก่อน")
            return False

        self._serial  = serial
        self._running = True
        self._thread  = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self.log(f"[WORKER] เริ่ม Auto Pilot → {serial} ({len(self._queue)} รายการ)")
        return True

    def stop(self):
        self._running = False
        self.log("[WORKER] หยุด Auto Pilot")

    # ── Main loop ─────────────────────────────────────────────

    def _run(self):
        gen = VideoGenerator(
            google_key=self.settings["google_api_key"],
            settings=self.settings,
        )
        gen.log = self.log

        poster = AutoPoster(self.adb, log_cb=self.log, settings=self.settings)

        while self._running and self._queue:
            product = self._queue.pop(0)
            pid     = product["product_id"]
            name    = product.get("basic_info", {}).get("name", "")[:35]

            # Generate video
            self._set_status(pid, "generating")
            self.log(f"[WORKER] สร้างวิดีโอ: {name}  (เหลือ {len(self._queue)})")
            video_path = gen.process(product)

            if not video_path:
                self._set_status(pid, "error")
                self.err_count += 1
                self._emit_stats()
                continue

            # Post to Shopee
            self._set_status(pid, "posting")
            self.log(f"[WORKER] โพสต์: {name}")
            ok = poster.process(self._serial, video_path, product)

            dest_dir = cfg.DONE_DIR if ok else cfg.ERROR_DIR
            dest_dir.mkdir(parents=True, exist_ok=True)
            try:
                video_path.rename(dest_dir / video_path.name)
            except Exception:
                pass

            if ok:
                self._set_status(pid, "done")
                self.done_count += 1
            else:
                self._set_status(pid, "error")
                self.err_count += 1

            self._emit_stats()

            if self._running and self._queue:
                delay = random.randint(
                    int(self.settings.get("post_delay_min", 30)),
                    int(self.settings.get("post_delay_max", 120)),
                )
                self.log(f"[WORKER] รอ {delay}s ก่อนโพสต์ต่อ...")
                for _ in range(delay):
                    if not self._running:
                        break
                    time.sleep(1)

        self._running = False
        self.log(f"[WORKER] เสร็จสิ้น ✅  สำเร็จ {self.done_count}  ผิดพลาด {self.err_count}")
        if self.on_finished:
            self.on_finished()

    def _set_status(self, pid: str, status: str):
        self._statuses[pid] = status
        if self.on_status_change:
            self.on_status_change(pid, status)

    def _emit_stats(self):
        if self.on_stats_update:
            self.on_stats_update(self.done_count, self.err_count, len(self._queue))
