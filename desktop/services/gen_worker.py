"""
Generation-only worker — turns products into AI video clips, no device/posting.

Decoupled from the posting Worker so users can batch-generate clips, preview
them in the web, then decide what to post. Each product runs through
VideoGenerator (Gemini prompt → Veo image-to-video) and the result is saved to
data/output/pending/.
"""
import threading
import time
from typing import Optional, Callable
import config as cfg
from services.video_generator import VideoGenerator
from services.template_generator import TemplateGenerator
from services.avatar_review_generator import AvatarReviewGenerator


class GenWorker:
    def __init__(self, settings: dict):
        self.settings = settings
        self.log: Callable = print

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._queue: list = []

        self.done_count = 0
        self.err_count  = 0

        # callbacks (pid, status) / (done, err, queue_len) / (pid, filename)
        self.on_status_change: Optional[Callable] = None
        self.on_stats_update:  Optional[Callable] = None
        self.on_video_ready:   Optional[Callable] = None
        self.on_progress:      Optional[Callable] = None   # (pid, stage, detail)
        self.on_finished:      Optional[Callable] = None

    # ── queue ─────────────────────────────────────────────────

    def add_products(self, products: list):
        for p in products:
            pid = p.get("product_id") or f"p{int(time.time()*1000)}"
            p["product_id"] = pid
            self._queue.append(p)

    @property
    def queue(self) -> list:
        return self._queue

    @property
    def is_running(self) -> bool:
        return self._running

    # ── control ───────────────────────────────────────────────

    def start(self, products: Optional[list] = None,
              profile: Optional[dict] = None) -> bool:
        if self._running:
            self.log("[GEN] กำลังสร้างอยู่แล้ว")
            return False

        # Per-batch profile overrides the saved settings just for this run
        self._run_settings = {**self.settings}
        if profile:
            self._run_settings.update({k: v for k, v in profile.items() if v is not None})
            self.log(f"[GEN] Profile: {profile.get('engine','template')} · "
                     f"{profile.get('duration','?')}s · {profile.get('style','?')}")

        # Veo / Avatar need keys; Template (free) does not
        eng = self._run_settings.get("engine")
        if eng == "veo" and not self._run_settings.get("google_api_key"):
            self.log("[GEN] engine Veo ต้องใส่ Google API Key (Settings) ก่อน")
            return False
        if eng == "avatar":
            if not self._run_settings.get("google_api_key"):
                self.log("[GEN] engine Avatar ต้องใส่ Google API Key (สำหรับเขียนสคริปต์)")
                return False
            if not self._run_settings.get("did_api_key"):
                self.log("[GEN] engine Avatar ต้องใส่ D-ID API Key")
                return False

        if products:
            self.add_products(products)
        if not self._queue:
            self.log("[GEN] ไม่มีสินค้าให้สร้าง")
            return False

        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self.log(f"[GEN] เริ่มสร้างคลิป {len(self._queue)} รายการ")
        return True

    def stop(self):
        self._running = False
        self.log("[GEN] หยุดสร้างคลิป")

    # ── loop ──────────────────────────────────────────────────

    def _run(self):
        run_settings = getattr(self, "_run_settings", self.settings)
        engine = run_settings.get("engine", "template")

        if engine == "veo":
            gen = VideoGenerator(google_key=run_settings.get("google_api_key", ""),
                                 settings=run_settings)
            self.log("[GEN] engine: Veo (AI, paid)")
        elif engine == "avatar":
            gen = AvatarReviewGenerator(run_settings)
            self.log("[GEN] engine: Avatar Review (D-ID + Gemini)")
        else:
            gen = TemplateGenerator(run_settings)
            self.log("[GEN] engine: Template (ฟรี, ffmpeg)")
        gen.log = self.log
        gen.on_progress = self.on_progress

        while self._running and self._queue:
            product = self._queue.pop(0)
            pid  = product["product_id"]
            name = product.get("basic_info", {}).get("name", "")[:35]

            self._status(pid, "generating")
            self.log(f"[GEN] สร้างคลิป: {name}  (เหลือ {len(self._queue)})")
            path = gen.process(product)

            if path:
                self.done_count += 1
                self._status(pid, "done")
                if self.on_video_ready:
                    self.on_video_ready(pid, path.name)
                self.log(f"[GEN] เสร็จ → {path.name}")
            else:
                self.err_count += 1
                self._status(pid, "error")

            self._stats()

        self._running = False
        self.log(f"[GEN] จบงาน ✅ สำเร็จ {self.done_count} ผิดพลาด {self.err_count}")
        if self.on_finished:
            self.on_finished()

    def _status(self, pid, status):
        if self.on_status_change:
            self.on_status_change(pid, status)

    def _stats(self):
        if self.on_stats_update:
            self.on_stats_update(self.done_count, self.err_count, len(self._queue))
