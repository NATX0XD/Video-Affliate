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


def _open_app_window(url: str):
    """เปิดเป็น 'หน้าต่างแอป' ด้วย Chrome --app (ไม่มีแถบเบราว์เซอร์ = เหมือนแอปจริง)
    ถ้าหา Chrome ไม่เจอ → fallback เปิดเบราว์เซอร์ปกติ. รองรับ Mac + Windows + Linux."""
    import shutil, subprocess, webbrowser
    candidates = []
    if sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            shutil.which("google-chrome"), shutil.which("chromium"),
        ]
    elif os.name == "nt":
        pf   = os.environ.get("ProgramFiles",      r"C:\Program Files")
        pfx  = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        lad  = os.environ.get("LOCALAPPDATA", "")
        candidates = [
            pf  + r"\Google\Chrome\Application\chrome.exe",
            pfx + r"\Google\Chrome\Application\chrome.exe",
            (lad + r"\Google\Chrome\Application\chrome.exe") if lad else None,
            pf  + r"\Microsoft\Edge\Application\msedge.exe",   # Edge = chromium, รองรับ --app เช่นกัน
            shutil.which("chrome"),
        ]
    else:
        candidates = [shutil.which("google-chrome"), shutil.which("chromium"),
                      shutil.which("chromium-browser")]
    chrome = next((c for c in candidates if c and os.path.exists(c)), None)
    if chrome:
        try:
            import config as cfg
            from pathlib import Path as _P
            # โปรไฟล์ Chrome แยกเฉพาะแอป — งานขับ Google Flow (chrome.debugger/CDP) + สตรีมจอ
            # จะไม่แชร์ GPU/browser process กับ Chrome ที่ผู้ใช้เปิด google/แท็บอื่น → ไม่ลากให้หน่วง
            # เปิดเป็น "แท็บ" ในหน้าต่าง Chrome เดิม (ไม่ใช่ --app และไม่ใช่ --new-window)
            # เหตุผล: background TAB (แท็บที่ไม่ใช่แท็บ active) Chrome throttle + document.hidden=true
            # แต่ background WINDOW (active tab ของหน้าต่างที่อยู่หลัง) ยัง "visible" → ไม่ throttle → แล็ค
            # ส่ง url เป็น arg เฉยๆ = เปิดแท็บใหม่ในหน้าต่างที่รันอยู่
            subprocess.Popen([chrome, url])
            return
        except Exception:
            pass
    webbrowser.open(url)   # fallback: แท็บเบราว์เซอร์ปกติ


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

    # เปิดเป็น "หน้าต่างแอป" (Chrome --app) เมื่อ server พร้อม — เหมือนแอปจริง ไม่ใช่แท็บ
    if os.getenv("VGAP_OPEN_BROWSER"):
        import threading
        threading.Timer(2.0, lambda: _open_app_window(url)).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down…")
        adb.stop_watch()


if __name__ == "__main__":
    main()
