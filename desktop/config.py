import os
import sys
import json
from pathlib import Path

# โค้ด/รีซอร์สอ่านอย่างเดียว — frozen exe ชี้ไปที่ PyInstaller แตกไฟล์ (_MEIPASS)
BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))

# ข้อมูลที่ต้อง "เขียน + คงอยู่ข้ามการเปิด-ปิด/อัปเดต" (settings/.env/db/คลิป)
# เก็บนอก repo เสมอ (ทุกโหมด) → update.ps1 (git reset --hard) ลบข้อมูลผู้ใช้ไม่ได้.
#   VGAP_DATA_DIR ถ้าตั้งไว้ ไม่งั้น = ~/.vgap
DATA_ROOT = Path(os.environ.get("VGAP_DATA_DIR") or (Path.home() / ".vgap"))


def _migrate_legacy_data(new_root: Path):
    """ผู้ใช้เดิม (โหมด source) เคยเก็บ settings.json/.env/data ไว้ใน desktop/ ซึ่งถูก
    update.ps1 (git reset --hard) ลบทับได้ → ก็อปมา new_root ครั้งเดียว กันของหาย.
    ก็อป (ไม่ย้าย) เพื่อไม่ทำลายของเดิม; ทำเฉพาะไอเท็มที่ปลายทางยังไม่มี."""
    if getattr(sys, "frozen", False):
        return
    old_root = Path(__file__).parent
    try:
        if old_root.resolve() == new_root.resolve():
            return
    except Exception:
        return
    try:
        new_root.mkdir(parents=True, exist_ok=True)
    except Exception:
        return
    import shutil
    for name in ("settings.json", ".env", "data"):
        src, dst = old_root / name, new_root / name
        try:
            if dst.exists() or not src.exists():
                continue
            if src.is_dir():
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
        except Exception:
            pass


_migrate_legacy_data(DATA_ROOT)

try:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

DATA_DIR  = DATA_ROOT / "data"
PRODUCTS_DIR = DATA_DIR / "products"
OUTPUT_DIR   = DATA_DIR / "output"
PENDING_DIR  = OUTPUT_DIR / "pending"
DONE_DIR     = OUTPUT_DIR / "done"
ERROR_DIR    = OUTPUT_DIR / "error"

DB_FILE      = DATA_DIR / "app.db"      # SQLite job store (A1.1)

CONFIG_FILE = DATA_ROOT / "settings.json"
ENV_FILE    = DATA_ROOT / ".env"

# settings field  ->  environment variable name
# API keys/secrets live in .env (git-ignored), not settings.json
ENV_KEYS = {
    "claude_api_key": "CLAUDE_API_KEY",
    "google_api_key": "GOOGLE_API_KEY",
    "did_api_key":    "DID_API_KEY",
}

def _load_dotenv():
    """Parse .env into os.environ (dependency-free). Existing env vars win."""
    if not ENV_FILE.exists():
        return
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception:
        pass

DEFAULT = {
    "claude_api_key": "",
    "google_api_key": "",
    "server_port": 3001,
    "adb_host": "localhost",
    "adb_port": 5037,
    "post_delay_min": 30,
    "post_delay_max": 120,
    "verify_post": True,         # ยืนยันโพสต์สำเร็จด้วย Gemini Vision (A1.3b)
    # ความยืดหยุ่นการโพสต์ (ผู้ใช้คุมเองได้)
    "caption_template": "{name} ราคา {price} บาท {link}",  # แคปชันตอนโพสต์
    "post_active_from": 0,       # ชั่วโมงเริ่มโพสต์ได้ (0-23)
    "post_active_to":   24,      # ชั่วโมงสิ้นสุด (1-24); 0-24 = ทั้งวัน
    "post_max_per_day": 0,       # โพสต์สูงสุด/วัน (0 = ไม่จำกัด)
    "review_mode": "auto",       # auto = โพสต์เลย | hold = ถือไว้ให้กดอนุมัติ
    "platforms": [],             # แพลตฟอร์มปลายทางที่เลือกโพสต์ (ผู้ใช้เลือกเอง; ว่าง = ยังไม่เลือก)
    # ดูแลเครื่องอัตโนมัติ — พักเครื่อง (cooldown) กันเครื่องพัง (E + G)
    "cooldown_enabled": True,    # เปิดระบบพักเครื่องอัตโนมัติ
    "temp_max":      45,         # °C — ร้อนถึงนี้ → พักเครื่อง (0 = ไม่เช็คอุณหภูมิ)
    "temp_resume":   41,         # °C — เย็นต่ำกว่านี้ → กลับมาโพสต์ (hysteresis กันสลับไปมา)
    "battery_min":   20,         # % — แบตต่ำถึงนี้ → พักจนชาร์จถึงเกณฑ์ (0 = ไม่เช็คแบต)
    "battery_resume": 50,        # % — ชาร์จถึงนี้ → กลับมาโพสต์
    "cooldown_minutes": 10,      # นาที — พักขั้นต่ำเมื่อร้อนเกิน
    "monthly_budget": 0,         # งบรายเดือน (บาท), 0 = ไม่จำกัด (A1.4)
    "cost_per_clip": 0,          # ต้นทุน Flow ต่อคลิป (บาท) — ใช้ประเมินค่า Flow (J)
    "gemini_cost_per_1k": 0,     # ต้นทุน Gemini ต่อ 1,000 token (บาท) — ประเมินค่า Gemini (J)
    "hot_folder": str(PENDING_DIR),
    "shop_name": "",
    "flow_email": "",            # อีเมล Google ที่ใช้ล็อกอิน Flow ในเบราว์เซอร์ (แสดงให้ผู้ใช้ยืนยัน)
    # Video generation settings
    "age_group": "ทุกวัย",
    "personality": "สนุกสนาน",
    "style": "ไลฟ์สไตล์",
    "background": "สตูดิโอ",
    "duration": 8,
    # Prompt control (ความยืดหยุ่น: ผู้ใช้แก้สคริปต์ที่ส่งเข้า Flow เองได้)
    "prompt_mode": "ai",         # "ai" = ให้ Gemini เขียน | "template" = ใช้เทมเพลตของผู้ใช้
    "prompt_template": "สร้างวิดีโอโฆษณาแนวตั้ง 9:16 ความยาว {duration} วินาที ของ {name} "
                       "ราคา {price} บาท สไตล์ไลฟ์สไตล์น่าซื้อ กล้องเคลื่อนไหวนุ่มนวล แสงสวย โทนสดใส",
    "prompt_style_note": "",     # ข้อความสไตล์เพิ่มเติม (ต่อท้ายตอนโหมด AI)
    "engine": "template",        # "template" (free) | "veo" (AI paid) | "avatar" (D-ID review)
    "vdo_model": "veo-2.0-generate-001",
    "prompt_model": "gemini-2.0-flash",
    "generate_audio": False,
    # Flow adapter — URL ของไฟล์ override selector/behavior ของ Google Flow (ว่าง = ใช้ bundled เท่านั้น)
    "flow_adapter_url": "",
    # Avatar review (D-ID)
    "did_api_key": "",
    "avatar_url": "https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/image.png",
    "avatar_voice": "th-TH-PremwadeeNeural",   # หญิง; ชาย = th-TH-NiwatNeural
    "review_seconds": 18,        # ความยาวสคริปต์รีวิวโดยประมาณ
}

def load() -> dict:
    _load_dotenv()
    cfg = DEFAULT.copy()
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    # Overlay secrets from environment (.env) — these win over settings.json
    for field, env_name in ENV_KEYS.items():
        val = os.getenv(env_name, "").strip()
        if val:
            cfg[field] = val
    return cfg

MASK = "********"

def public_load() -> dict:
    """load() but with secrets masked — safe to send to the browser.
    A configured secret becomes MASK; an unset one stays ''."""
    cfg = load()
    for field in ENV_KEYS:
        cfg[field] = MASK if cfg.get(field) else ""
    return cfg

def save(cfg: dict):
    # Allowlist: keep only known settings (DEFAULT ∪ ENV_KEYS) — drop foreign keys so a
    # malformed/hostile payload can't inject unknown fields. Secrets (ENV_KEYS) never get
    # persisted into settings.json — they belong in .env.
    allowed = set(DEFAULT) | set(ENV_KEYS)
    sanitized = {k: v for k, v in cfg.items() if k in allowed and k not in ENV_KEYS}
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(sanitized, f, ensure_ascii=False, indent=2)


# ── Flow adapter (ชั้น override selector/behavior ของ Google Flow) ──────────────
# bundled default = override ว่าง → flow.js ใช้ค่า/selector เดิมทั้งหมด (พฤติกรรมคงเดิมเป๊ะ).
# ถ้ามีไฟล์ cache (ดึงจาก remote) จะใช้แทน. helper นี้ไม่แตะ logic gen/credit ใน flow.js.
FLOW_ADAPTER_FILE = DATA_ROOT / "flow-adapter.json"

DEFAULT_FLOW_ADAPTER = {
    "version": "bundled-1",
    "source": "bundled",
    "selectors": {},       # ว่าง = ไม่ override → ใช้ selector เดิมใน flow.js
    "timings": {},         # ว่าง = ไม่ override → ใช้ค่า delay/timeout เดิม
    "output_verify": {},   # ว่าง = defensive เท่านั้น (แจ้ง error, ไม่ retry เสียเครดิต)
}

def load_flow_adapter() -> dict:
    """คืน adapter ปัจจุบัน: ไฟล์ cache (~/.vgap/flow-adapter.json) ถ้ามีและ valid,
    ไม่งั้น bundled default. มี field 'version' เสมอ."""
    if FLOW_ADAPTER_FILE.exists():
        try:
            with open(FLOW_ADAPTER_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                data.setdefault("version", "unknown")
                data.setdefault("source", "cache")
                return data
        except Exception:
            pass
    return dict(DEFAULT_FLOW_ADAPTER)

def save_flow_adapter(data: dict):
    """เขียน adapter ที่ดึงจาก remote ลง cache (~/.vgap/flow-adapter.json)."""
    FLOW_ADAPTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(FLOW_ADAPTER_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def set_secret(field: str, value: str):
    """Write/update/remove a secret in .env (field is a settings key, e.g.
    'google_api_key'). Empty value removes the line. Also updates os.environ
    so a subsequent load() in this process sees the change."""
    env_name = ENV_KEYS.get(field)
    if not env_name:
        raise KeyError(f"{field} is not an env-managed secret")
    value = (value or "").strip()

    lines, found = [], False
    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and \
                   stripped.split("=", 1)[0].strip() == env_name:
                    found = True
                    if value:
                        lines.append(f"{env_name}={value}\n")
                    # empty value -> drop the line entirely
                else:
                    lines.append(line if line.endswith("\n") else line + "\n")
    if value and not found:
        lines.append(f"{env_name}={value}\n")

    with open(ENV_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)

    if value:
        os.environ[env_name] = value
    else:
        os.environ.pop(env_name, None)
