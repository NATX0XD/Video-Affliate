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
from services.platforms import make_poster, ready_enabled
from services.db import GENERATED, POSTING


class PostWorker:
    def __init__(self, settings: dict, adb_manager):
        self.settings = settings
        self.adb = adb_manager
        self.log: Callable = print
        self.db = None              # JobStore (A1.2c) — injected by main.py

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
        """Clips ready to post = jobs in 'generated' (DB).
        Fallback: scan pending/ folder when db is unavailable."""
        if self.db:
            return self.db.list(GENERATED, limit=9999)
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
        poster = AutoPoster(self.adb, log_cb=self.log, settings=self.settings)
        if not self.db:
            return self._run_legacy(poster)   # legacy จบงาน + on_finished เอง
        else:
            self.log(f"[POST-ALL] เริ่มโพสต์ (คลังพร้อม {self.db.count(GENERATED)}) → {self._serial}")
            while self._running:
                if not self._can_post_now():              # ตารางเวลา/โควต้า (ยืดหยุ่น)
                    break
                job = self.db.claim(GENERATED, POSTING)   # atomic
                if not job:
                    break
                jid     = job["id"]
                product = job["product"]
                pid     = product.get("product_id") or str(jid)
                name    = (product.get("basic_info", {}) or {}).get("name", "")[:35]
                video   = Path(job["video_path"]) if job.get("video_path") else None

                self._status(pid, "posting")
                if not video or not video.exists():
                    self.db.mark_error(jid, "ไฟล์วิดีโอหาย")
                    self.err_count += 1
                    self._status(pid, "error")
                    self._stats(self.db.count(GENERATED))
                    continue

                # โพสต์ทุกแพลตฟอร์มที่เปิดอยู่ (multi-platform)
                plats = ready_enabled(self.settings)
                self.log(f"[POST-ALL] {name} → {', '.join(plats)}")
                results = []
                for pk in plats:
                    p = make_poster(pk, self.adb, self.log, self.settings)
                    r = p.process(self._serial, video, product)
                    if r is None:           # ข้าม (ยังไม่พร้อม)
                        continue
                    results.append(bool(r))
                ok = bool(results) and all(results)

                if ok:
                    new_path = self._move(video, cfg.DONE_DIR)
                    self.db.mark_posted(jid, video_path=str(new_path))
                    self.done_count += 1
                    self._status(pid, "done")
                else:
                    # auto-retry: คลิปอยู่ pending/ เหมือนเดิม รอ backoff แล้วโพสต์ใหม่เอง
                    res = self.db.record_failure(jid, GENERATED, "โพสต์ไม่สำเร็จ")
                    if res["retrying"]:
                        self.log(f"[POST-ALL] {name} พลาด — ลองใหม่ครั้งที่ "
                                 f"{res['attempts']+1} ใน {res['retry_in']}s")
                        self._status(pid, "retry")
                    else:
                        new_path = self._move(video, cfg.ERROR_DIR)
                        self.db.update(jid, video_path=str(new_path))
                        self.err_count += 1
                        self._status(pid, "error")
                        self.log(f"[POST-ALL] {name} ล้มเหลวถาวร (ครบ {res['attempts']} ครั้ง)")
                self._stats(self.db.count(GENERATED))

                if self._running and self.db.has_due(GENERATED):
                    self._delay()

        self._running = False
        self.log(f"[POST-ALL] จบ ✅ สำเร็จ {self.done_count} ผิดพลาด {self.err_count}")
        if self.on_finished:
            self.on_finished()

    def _can_post_now(self) -> bool:
        """เช็กตารางเวลาโพสต์ + โควต้าต่อวัน (ความยืดหยุ่น)."""
        from datetime import datetime
        s = self.settings
        hr = datetime.now().hour
        fr = int(s.get("post_active_from", 0) or 0)
        to = int(s.get("post_active_to", 24) or 24)
        if not (fr <= hr < to):
            self.log(f"[POST-ALL] นอกช่วงเวลาโพสต์ ({fr:02d}:00–{to:02d}:00) — หยุดไว้ก่อน")
            return False
        cap = int(s.get("post_max_per_day", 0) or 0)
        if cap and self.db and self.db.count_posted_today() >= cap:
            self.log(f"[POST-ALL] ครบโควต้าวันนี้แล้ว ({cap} คลิป) — หยุด")
            return False
        return True

    def _move(self, video: Path, dest_dir: Path) -> Path:
        """ย้ายคลิป + sidecar ไปโฟลเดอร์ปลายทาง คืน path ใหม่ (หรือ path เดิมถ้าย้ายไม่ได้)."""
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

    def _delay(self):
        delay = random.randint(int(self.settings.get("post_delay_min", 30)),
                               int(self.settings.get("post_delay_max", 120)))
        self.log(f"[POST-ALL] รอ {delay}s ก่อนคลิปต่อไป...")
        for _ in range(delay):
            if not self._running:
                break
            time.sleep(1)

    # ── legacy folder-based loop (db ไม่พร้อม) ──
    def _run_legacy(self, poster):
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
