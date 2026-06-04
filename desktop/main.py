import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import config as cfg
from services.adb.manager import ADBManager
from services.web_server   import WebServer
from services.worker       import Worker
from services.gen_worker   import GenWorker
from services.post_worker  import PostWorker
from services.db           import JobStore, migrate_folders
from services.budget       import BudgetGuard
from services.autopilot    import AutoPilot


def main():
    settings = cfg.load()

    for d in [cfg.PRODUCTS_DIR, cfg.PENDING_DIR, cfg.DONE_DIR, cfg.ERROR_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    # SQLite job store (A1.1) — single source of truth, survives restarts
    store = JobStore(cfg.DB_FILE)
    resumed  = store.reset_stuck()              # rewind crash-interrupted jobs
    imported = migrate_folders(store, cfg.PENDING_DIR, cfg.DONE_DIR, cfg.ERROR_DIR)
    # ย้ายชื่อร้านเดิมจาก settings เข้า DB (กัน onboarding ซ้ำสำหรับผู้ใช้เดิม)
    if store.get_config("shop_name") is None and settings.get("shop_name"):
        store.set_config("shop_name", settings["shop_name"])
        store.set_config("setup_done", "1")

    adb    = ADBManager()
    server = WebServer(port=settings.get("server_port", 3001))
    worker = Worker(settings, adb)
    gen    = GenWorker(settings)
    poster = PostWorker(settings, adb)

    # Wire up cross-references
    server.adb    = adb
    server.worker = worker
    server.gen    = gen
    server.poster = poster
    server.db = worker.db = gen.db = poster.db = store   # workers adopt it in A1.2
    server.budget = BudgetGuard(store)                   # คุมงบ (A1.4)
    worker.log    = server.emit_log
    gen.log       = server.emit_log
    poster.log    = server.emit_log

    worker.on_status_change = server.emit_worker_status
    worker.on_stats_update  = lambda done, err, q: server.emit_stats(done, err, q)
    worker.on_finished      = lambda: server.emit_log("[Worker] Auto Pilot completed ✓")

    # Generation-only worker → emit progress + announce ready clips
    gen.on_status_change = server.emit_worker_status
    gen.on_stats_update  = lambda done, err, q: server.emit_stats(done, err, q)
    gen.on_video_ready   = server.emit_video_ready
    gen.on_progress      = server.emit_gen_progress
    gen.on_finished      = lambda: server.emit_log("[Gen] สร้างคลิปครบแล้ว ✓")

    # Post-all worker
    poster.on_status_change = server.emit_worker_status
    poster.on_stats_update  = lambda done, err, q: server.emit_stats(done, err, q)
    poster.on_finished      = lambda: server.emit_log("[Post] โพสต์ครบทุกคลิปแล้ว ✓")

    # Auto-post loop (near-zero-touch) — วนโพสต์เองตลอด
    autopilot = AutoPilot(store, adb)
    autopilot.log             = server.emit_log
    autopilot.on_status_change = server.emit_worker_status
    autopilot.on_stats_update  = lambda done, err, q: server.emit_stats(done, err, q)
    server.autopilot = autopilot

    adb.log = server.emit_log

    # Start services
    server.start()
    adb.start_watch(interval=5)
    autopilot.restore()        # คืนสถานะเปิด/ปิดจากครั้งก่อน
    autopilot.start()          # เริ่มลูป (ทำงานเมื่อ enabled)

    print("\n" + "─" * 50)
    print("  Shopee VDO Gen — Web UI Mode")
    print("─" * 50)
    print(f"  Backend  → http://localhost:{server.port}")
    print(f"  Web UI   → http://localhost:3000  (run: npm run dev)")
    print(f"  Jobs DB  → {cfg.DB_FILE.name}  "
          f"(resumed {resumed}, imported {imported}, total {store.count()})")
    print("─" * 50 + "\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down…")
        adb.stop_watch()


if __name__ == "__main__":
    main()
