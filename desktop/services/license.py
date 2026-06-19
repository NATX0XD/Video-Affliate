"""
License manager — offline machine-locked license.

Key format: VGAP-XXXX-XXXX-XXXX-XXXX  (VGAP prefix + 16 hex data chars)
Data (8 bytes):
  bytes 0-3  expiry day (uint32 big-endian, days since epoch)
  byte  4    edition   (0=Standard, 1=Pro)
  bytes 5-7  HMAC-SHA256 truncated to 3 bytes

Machine lock: on first activate, machine fingerprint stored in license.json.
Subsequent checks verify fingerprint matches current machine.
"""
import hashlib, hmac as _hmac, json, platform, struct, time
from pathlib import Path
from typing import Optional

_SECRET  = b"vG4P_k3y_s3cr3t_2025!"   # change before shipping
_LICENSE = Path.home() / ".vgap" / "license.json"
EDITIONS = {0: "Standard", 1: "Pro"}


# ── Machine fingerprint ───────────────────────────────────────

def machine_id() -> str:
    import uuid
    raw = f"{platform.node()}:{uuid.getnode()}:{platform.machine()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


# ── Key encode / decode ───────────────────────────────────────

def _pack(expiry_day: int, edition: int = 0) -> str:
    payload = struct.pack(">IB", expiry_day, edition & 0xFF)
    sig = _hmac.new(_SECRET, payload, hashlib.sha256).digest()[:3]
    data = (payload + sig).hex().upper()          # 16 hex chars
    return f"VGAP-{data[0:4]}-{data[4:8]}-{data[8:12]}-{data[12:16]}"


def _unpack(key: str) -> Optional[dict]:
    try:
        hex_str = key.upper().replace("VGAP", "").replace("-", "").replace(" ", "")
        if len(hex_str) != 16:
            return None
        raw = bytes.fromhex(hex_str)
        payload, sig = raw[:5], raw[5:8]
        expected = _hmac.new(_SECRET, payload, hashlib.sha256).digest()[:3]
        if sig != expected:
            return None
        expiry_day, edition = struct.unpack(">IB", payload)
        return {"expiry_day": expiry_day, "edition": edition}
    except Exception:
        return None


# ── Public API ────────────────────────────────────────────────

def generate_key(days: int = 365, edition: int = 0) -> str:
    today = int(time.time() // 86400)
    return _pack(today + days, edition)


def verify_key(key: str) -> dict:
    data = _unpack(key)
    if not data:
        return {"ok": False, "reason": "รูปแบบ License Key ไม่ถูกต้อง"}
    today    = int(time.time() // 86400)
    remaining = data["expiry_day"] - today
    if remaining < 0:
        return {"ok": False, "reason": f"License Key หมดอายุแล้ว {abs(remaining)} วัน"}
    edition = EDITIONS.get(data["edition"], "Standard")
    return {"ok": True, "edition": edition, "expiry_days": remaining}


def activate(key: str) -> dict:
    r = verify_key(key)
    if not r["ok"]:
        return r
    mid  = machine_id()
    info = _load()
    if info and info.get("machine_id") and info["machine_id"] != mid:
        return {"ok": False, "reason": "License Key นี้ถูกผูกกับเครื่องอื่นแล้ว — ติดต่อ support เพื่อย้ายเครื่อง"}
    data = _unpack(key)
    record = {
        "key":          key.upper(),
        "machine_id":   mid,
        "edition":      r["edition"],
        "expiry_day":   data["expiry_day"],
        "activated_at": int(time.time()),
    }
    _LICENSE.parent.mkdir(parents=True, exist_ok=True)
    _LICENSE.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return {"ok": True, **r}


def check() -> dict:
    info = _load()
    if not info:
        return {"ok": False, "reason": "ยังไม่ได้ activate License"}
    if info.get("machine_id") != machine_id():
        return {"ok": False, "reason": "License Key นี้ไม่ได้ผูกกับเครื่องนี้"}
    return verify_key(info["key"])


def _load() -> Optional[dict]:
    try:
        return json.loads(_LICENSE.read_text(encoding="utf-8")) if _LICENSE.exists() else None
    except Exception:
        return None
