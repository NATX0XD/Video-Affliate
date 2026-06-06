import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

@dataclass
class Device:
    serial: str
    status: str = "offline"   # offline | online | unauthorized
    model: str = ""
    android: str = ""
    battery: int = 0
    temp: float = 0.0         # °C — อุณหภูมิแบต (จาก dumpsys battery) (E)
    charging: bool = False    # กำลังชาร์จอยู่ไหม (E)
    posting: bool = False     # กำลังโพสต์อยู่ (จาก autopilot)
    cooldown_until: float = 0.0   # ts — พักเครื่องถึงเมื่อไร (0 = ไม่พัก) (E)
    cooldown_reason: str = ""     # "hot" | "battery" — สาเหตุพัก
    # ทรัพยากรเครื่อง (อ่าน throttle ทุก ~20 วิ) (E)
    ram_total: int = 0        # MB — RAM ทั้งหมด
    ram_used: int = 0         # MB — RAM ที่ใช้อยู่
    storage_total: float = 0.0   # GB — พื้นที่ /data ทั้งหมด
    storage_free: float = 0.0    # GB — พื้นที่ /data ที่เหลือ
    net: str = ""             # "wifi" | "mobile" | "offline"
    meta_at: float = 0.0      # ts ของการอ่าน meta ครั้งล่าสุด (throttle)

class ADBManager:
    def __init__(self, log_cb: Optional[Callable] = None):
        self.devices: dict[str, Device] = {}
        self.log = log_cb or print
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # ── ADB command ──────────────────────────────────────────
    def _adb(self, *args, serial: str = None, timeout: int = 10) -> tuple[bool, str]:
        cmd = ["adb"]
        if serial:
            cmd += ["-s", serial]
        cmd += list(args)
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            out = (r.stdout + r.stderr).strip()
            return r.returncode == 0, out
        except FileNotFoundError:
            return False, "ADB not found — install: brew install android-platform-tools"
        except subprocess.TimeoutExpired:
            return False, "timeout"
        except Exception as e:
            return False, str(e)

    # ── Scan devices ─────────────────────────────────────────
    def scan(self) -> list[Device]:
        ok, out = self._adb("devices", "-l")
        if not ok:
            self.log(f"[ADB] {out}")
            return []

        found = {}
        for line in out.splitlines()[1:]:
            line = line.strip()
            if not line or "List of" in line:
                continue
            parts = line.split()
            if len(parts) < 2:
                continue

            serial = parts[0]
            status = parts[1]

            dev = self.devices.get(serial) or Device(serial=serial)
            dev.status = status

            if status == "device":
                # ดึง model
                _, model = self._adb("shell", "getprop", "ro.product.model", serial=serial)
                dev.model = model.strip() or serial
                # ดึง Android version
                _, ver = self._adb("shell", "getprop", "ro.build.version.release", serial=serial)
                dev.android = ver.strip()
                # ดึง battery + อุณหภูมิ + สถานะชาร์จ (ครั้งเดียว) (E)
                self._read_power(dev)
                # ดึง RAM/storage/net (throttle ทุก ~20 วิ — ไม่ critical เท่า temp) (E)
                self._read_meta(dev)
            elif status == "unauthorized":
                dev.model = "⚠ ต้องอนุญาต USB Debugging"
            else:
                dev.model = serial

            found[serial] = dev

        self.devices = found
        return list(self.devices.values())

    # ── Power: battery % + อุณหภูมิ + ชาร์จ (1 call) (E) ─────────
    def _read_power(self, dev: Device):
        """อ่าน `dumpsys battery` ครั้งเดียว → level, temperature(°C), charging."""
        ok, out = self._adb("shell", "dumpsys", "battery", serial=dev.serial)
        if not ok:
            return
        info = {}
        for line in out.splitlines():
            if ":" in line:
                k, _, v = line.strip().partition(":")
                info[k.strip().lower()] = v.strip()
        try:
            dev.battery = int(info.get("level", dev.battery))
        except Exception:
            pass
        try:
            # temperature เป็นหน่วยสิบเท่าของ °C เช่น 350 = 35.0°C
            dev.temp = round(int(info["temperature"]) / 10.0, 1)
        except Exception:
            dev.temp = 0.0
        # status: 2=charging, 5=full ; หรือเสียบไฟอยู่ (ac/usb/wireless powered)
        st = info.get("status", "")
        powered = any(info.get(k, "").lower() == "true"
                      for k in ("ac powered", "usb powered", "wireless powered"))
        dev.charging = st in ("2", "5") or powered

    # ── RAM / storage / network (1 call, throttle ~20 วิ) (E) ───
    META_INTERVAL = 20   # วินาที — ไม่ต้องอ่านบ่อยเท่า temp

    def _read_meta(self, dev: Device):
        """อ่าน RAM(/proc/meminfo) + storage(df /data) + net(operstate) ใน call เดียว."""
        if (time.time() - dev.meta_at) < self.META_INTERVAL and dev.ram_total:
            return
        cmd = ("cat /proc/meminfo; echo @@DF@@; df /data; echo @@NET@@; "
               "for f in /sys/class/net/*/operstate; do "
               'echo "$(basename $(dirname $f)):$(cat $f 2>/dev/null)"; done')
        ok, out = self._adb("shell", cmd, serial=dev.serial, timeout=12)
        if not ok or not out:
            return
        dev.meta_at = time.time()
        mem, df, net = out, "", ""
        if "@@DF@@" in out:
            mem, _, rest = out.partition("@@DF@@")
            df, _, net = rest.partition("@@NET@@")

        # RAM (kB → MB): used = total - available
        mt = ma = 0
        for line in mem.splitlines():
            if line.startswith("MemTotal:"):
                mt = self._first_int(line)
            elif line.startswith("MemAvailable:"):
                ma = self._first_int(line)
        if mt:
            dev.ram_total = round(mt / 1024)
            dev.ram_used  = round(max(0, mt - ma) / 1024)

        # Storage (df /data → แถวข้อมูล: total used avail ในหน่วย 1K-block)
        for line in df.splitlines():
            parts = line.split()
            if len(parts) >= 4 and parts[1].isdigit() and parts[3].isdigit():
                dev.storage_total = round(int(parts[1]) / 1048576, 1)   # KB → GB
                dev.storage_free  = round(int(parts[3]) / 1048576, 1)
                break

        # Network: wlan* up → wifi ; rmnet/ccmni up → mobile ; ไม่งั้น offline
        up = {ln.split(":", 1)[0] for ln in net.splitlines()
              if ":" in ln and ln.rsplit(":", 1)[1].strip() == "up"}
        if any(i.startswith("wlan") for i in up):
            dev.net = "wifi"
        elif any(i.startswith(("rmnet", "ccmni", "radio")) for i in up):
            dev.net = "mobile"
        else:
            dev.net = "offline"

    @staticmethod
    def _first_int(line: str) -> int:
        for tok in line.split():
            if tok.isdigit():
                return int(tok)
        return 0

    # ── Auto scan loop ────────────────────────────────────────
    def start_watch(self, interval: int = 5):
        self._running = True
        def _loop():
            while self._running:
                self.scan()
                time.sleep(interval)
        self._thread = threading.Thread(target=_loop, daemon=True)
        self._thread.start()
        self.log("[ADB] เริ่มตรวจจับมือถือ...")

    def stop_watch(self):
        self._running = False

    # ── Push file ─────────────────────────────────────────────
    def push_file(self, serial: str, local: str, remote: str = "/sdcard/DCIM/ShopeeVDO/") -> bool:
        ok, msg = self._adb("shell", "mkdir", "-p", remote, serial=serial)
        ok, msg = self._adb("push", local, remote, serial=serial, timeout=60)
        if not ok:
            self.log(f"[ADB][{serial}] push failed: {msg}")
        return ok

    # ── Open Shopee ───────────────────────────────────────────
    def open_shopee(self, serial: str) -> bool:
        # Use monkey to launch — most reliable, works across all Shopee versions
        ok, out = self._adb(
            "shell", "monkey", "-p", "com.shopee.th",
            "-c", "android.intent.category.LAUNCHER", "1",
            serial=serial
        )
        return "Events injected: 1" in out

    # ── Tap ──────────────────────────────────────────────────
    def tap(self, serial: str, x: int, y: int) -> bool:
        ok, _ = self._adb("shell", "input", "tap", str(x), str(y), serial=serial)
        return ok

    # ── Type text ────────────────────────────────────────────
    def type_text(self, serial: str, text: str) -> bool:
        safe = text.replace(" ", "%s").replace("'", "")
        ok, _ = self._adb("shell", "input", "text", safe, serial=serial)
        return ok

    # ── Unicode text input via ADBKeyboard ───────────────────
    ADB_IME = "com.android.adbkeyboard/.AdbIME"

    def get_default_ime(self, serial: str) -> str:
        _, out = self._adb("shell", "settings", "get", "secure",
                           "default_input_method", serial=serial)
        return out.strip()

    def has_adb_keyboard(self, serial: str) -> bool:
        _, out = self._adb("shell", "ime", "list", "-s", serial=serial)
        return "adbkeyboard" in out.lower()

    def set_ime(self, serial: str, ime: str):
        self._adb("shell", "ime", "set", ime, serial=serial)

    def type_unicode(self, serial: str, text: str) -> bool:
        """Type Unicode/Thai text via ADBKeyboard base64 broadcast.
        Caller is responsible for enabling/restoring the IME."""
        import base64
        b64 = base64.b64encode(text.encode("utf-8")).decode("ascii")
        ok, _ = self._adb("shell", "am", "broadcast", "-a", "ADB_INPUT_B64",
                          "--es", "msg", b64, serial=serial)
        return ok

    # ── Fast screenshot (shell screencap + pull → JPEG) ──────────────────────
    def fast_screenshot(self, serial: str) -> Optional[bytes]:
        """Wake screen → screencap → pull → resize → JPEG."""
        # Wake screen so it's not black
        self._adb("shell", "input", "keyevent", "KEYCODE_WAKEUP", serial=serial)

        # Step 1: screencap on device
        ok, msg = self._adb("shell", "screencap", "-p", "/sdcard/screen_web.png",
                             serial=serial, timeout=12)
        if not ok:
            self.log(f"[Snapshot] screencap failed: {msg}")
            return None

        # Step 2: pull to local
        r = subprocess.run(
            ["adb", "-s", serial, "pull", "/sdcard/screen_web.png", "/tmp/screen_web.png"],
            capture_output=True, timeout=12
        )
        if r.returncode != 0:
            self.log(f"[Snapshot] pull failed: {r.stderr.decode(errors='ignore').strip()}")
            return None

        # Step 3: resize & encode as JPEG (convert RGBA→RGB, JPEG has no alpha)
        try:
            from PIL import Image
            import io as _io
            with Image.open("/tmp/screen_web.png") as img:
                if img.mode in ("RGBA", "LA", "P"):
                    img = img.convert("RGB")
                w, h = img.size
                img = img.resize((540, int(h * 540 / w)), Image.LANCZOS)
                buf = _io.BytesIO()
                img.save(buf, format="JPEG", quality=80)
                return buf.getvalue()
        except Exception as e:
            self.log(f"[Snapshot] PIL error: {e}")
            return None

    # ── Screenshot ───────────────────────────────────────────
    def screenshot(self, serial: str) -> Optional[bytes]:
        ok, _ = self._adb("shell", "screencap", "-p", "/sdcard/screen_tmp.png", serial=serial)
        if not ok:
            return None
        try:
            r = subprocess.run(
                ["adb", "-s", serial, "pull", "/sdcard/screen_tmp.png", "/tmp/screen_tmp.png"],
                capture_output=True, timeout=10
            )
            if r.returncode == 0:
                with open("/tmp/screen_tmp.png", "rb") as f:
                    return f.read()
        except Exception:
            pass
        return None

    # ── WiFi ADB ─────────────────────────────────────────────
    def connect_wifi(self, ip: str, port: int = 5555) -> bool:
        ok, msg = self._adb("connect", f"{ip}:{port}")
        self.log(f"[ADB] WiFi connect {ip}:{port} → {msg}")
        return ok

    def disconnect(self, serial: str):
        self._adb("disconnect", serial)
        self.devices.pop(serial, None)
