import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import config as cfg
from services.adb.manager import ADBManager
from services.web_server   import WebServer
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

    # Wire up cross-references (desktop = post-only: ไม่มี worker สร้างคลิปแล้ว)
    server.adb    = adb
    server.db     = store
    server.budget = BudgetGuard(store)                   # คุมงบ (A1.4)

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

    url = f"http://localhost:{server.port}"
    print("\n" + "─" * 50)
    print("  VDO Gen Auto Pilot — Web UI Mode")
    print("─" * 50)
    print(f"  เปิดใช้งาน → {url}")
    print(f"  Jobs DB    → {cfg.DB_FILE.name}  "
          f"(resumed {resumed}, imported {imported}, total {store.count()})")
    print("─" * 50 + "\n")

    # โหมดพกพา (โฟลเดอร์ดับเบิลคลิก): เปิดเบราว์เซอร์ให้อัตโนมัติเมื่อ server พร้อม
    if os.getenv("VGAP_OPEN_BROWSER"):
        import threading, webbrowser
        threading.Timer(2.0, lambda: webbrowser.open(url)).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down…")
        adb.stop_watch()


if __name__ == "__main__":
    main()
