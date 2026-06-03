"""
Post-only worker — posts already-generated clips (from data/output/pending/)
to Shopee, one by one, using each clip's sidecar metadata for the caption.

This is phase 2 of the campaign flow: GenWorker fills the library, PostWorker
publishes everything. No video generation here.
"""
import json
import threading
import time
import random
from pathlib import Path
from typing import Optional, Callable
import config as cfg
from services.adb.autoposter import AutoPoster


class PostWorker:
    def __init__(self, settings: dict, adb_manager):
        self.settings = settings
        self.adb = adb_manager
        self.log: Callable = print

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._serial = ""

        self.done_count = 0
        self.err_count  = 0

        self.on_status_change: Optional[Callable] = None  # (pid, status)
        self.on_stats_update:  Optional[Callable] = None  # (done, err, remaining)
        self.on_finished:      Optional[Callable] = None

    @property
    def is_running(self) -> bool:
        return self._running

    # ── Library scan ──────────────────────────────────────────

    def ready_clips(self) -> list:
        """List clips in pending/ that have sidecar metadata (ready to post)."""
        clips = []
        for mp4 in sorted(cfg.PENDING_DIR.glob("*.mp4"), key=lambda x: x.stat().st_mtime):
            side = mp4.with_suffix(".json")
            meta = {}
            if side.exists():
                try:
                    meta = json.loads(side.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
            clips.append({"video": mp4, "sidecar": side, "meta": meta})
        return clips

    # ── Control ───────────────────────────────────────────────

    def start(self, serial: str) -> bool:
        if self._running:
            self.log("[POST-ALL] กำลังโพสต์อยู่แล้ว")
            return False
        if not serial:
            self.log("[POST-ALL] ไม่มีมือถือที่เชื่อมต่อ")
            return False
        if not self.ready_clips():
            self.log("[POST-ALL] ไม่มีคลิปในคลัง (pending) ให้โพสต์")
            return False

        self._serial = serial
        self._running = True
        self.done_count = self.err_count = 0
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return True

    def stop(self):
        self._running = False
        self.log("[POST-ALL] หยุดโพสต์")

    # ── Loop ──────────────────────────────────────────────────

    def _run(self):
        poster = AutoPoster(self.adb, log_cb=self.log)
        clips = self.ready_clips()
        total = len(clips)
        self.log(f"[POST-ALL] เริ่มโพสต์ {total} คลิป → {self._serial}")

        for i, clip in enumerate(clips):
            if not self._running:
                break
            video = clip["video"]
            meta  = clip["meta"]
            pid   = meta.get("product_id") or video.stem
            name  = meta.get("name", video.name)[:35]

            # Rebuild a minimal product dict for the caption
            product = {
                "product_id": pid,
                "basic_info": {"name": meta.get("name", ""),
                               "price": meta.get("price", ""),
                               "sold_count": meta.get("sold_count", "")},
                "commission": {"rate": meta.get("commission", "")},
                "links": {"affiliate_link": meta.get("link", "")},
            }

            self._status(pid, "posting")
            self.log(f"[POST-ALL] ({i+1}/{total}) {name}")
            ok = poster.process(self._serial, video, product)

            dest = cfg.DONE_DIR if ok else cfg.ERROR_DIR
            dest.mkdir(parents=True, exist_ok=True)
            try:
                video.rename(dest / video.name)
                if clip["sidecar"].exists():
                    # mark posted + move sidecar alongside the clip
                    if ok:
                        try:
                            meta["status"] = "posted"
                            meta["posted_at"] = int(time.time())
                            clip["sidecar"].write_text(
                                json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                        except Exception:
                            pass
                    clip["sidecar"].rename(dest / clip["sidecar"].name)
            except Exception:
                pass

            if ok:
                self.done_count += 1
                self._status(pid, "done")
            else:
                self.err_count += 1
                self._status(pid, "error")
            self._stats(total - (i + 1))

            # delay before next clip
            if self._running and i < total - 1:
                delay = random.randint(int(self.settings.get("post_delay_min", 30)),
                                       int(self.settings.get("post_delay_max", 120)))
                self.log(f"[POST-ALL] รอ {delay}s ก่อนคลิปต่อไป...")
                for _ in range(delay):
                    if not self._running:
                        break
                    time.sleep(1)

        self._running = False
        self.log(f"[POST-ALL] จบ ✅ สำเร็จ {self.done_count} ผิดพลาด {self.err_count}")
        if self.on_finished:
            self.on_finished()

    def _status(self, pid, status):
        if self.on_status_change:
            self.on_status_change(pid, status)

    def _stats(self, remaining):
        if self.on_stats_update:
            self.on_stats_update(self.done_count, self.err_count, remaining)
