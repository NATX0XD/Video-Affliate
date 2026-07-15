"""config.py — DATA_ROOT resolution, legacy migration, save() allowlist, secrets."""
import json
import os
import subprocess
import sys

import pytest

from conftest import DESKTOP_DIR


# ── DATA_ROOT ────────────────────────────────────────────────────────────────

def test_data_root_respects_env(cfg):
    assert str(cfg.DATA_ROOT) == os.environ["VGAP_DATA_DIR"]


def test_data_root_default_home(tmp_path):
    """ไม่มี VGAP_DATA_DIR → DATA_ROOT = ~/.vgap (ทดสอบใน subprocess เพราะ
    config อ่านค่าตอน import). วาง placeholder กันก๊อปข้อมูลจริง."""
    home = tmp_path / "home"
    (home / ".vgap" / "data").mkdir(parents=True)
    (home / ".vgap" / "settings.json").write_text("{}", encoding="utf-8")

    env = dict(os.environ)
    env.pop("VGAP_DATA_DIR", None)
    env["HOME"] = str(home)
    env["USERPROFILE"] = str(home)  # windows fallback for Path.home()

    code = (
        "import sys; sys.path.insert(0, %r); import config; "
        "print(config.DATA_ROOT)" % DESKTOP_DIR
    )
    out = subprocess.check_output([sys.executable, "-c", code], env=env, text=True).strip()
    assert out == str(home / ".vgap")


# ── legacy migration (กันของหาย) ─────────────────────────────────────────────

def test_migrate_legacy_copies_missing(cfg, tmp_path, monkeypatch):
    old = tmp_path / "old"
    old.mkdir()
    new = tmp_path / "new"
    (old / "settings.json").write_text('{"shop_name":"legacy"}', encoding="utf-8")
    (old / "data").mkdir()
    (old / "data" / "app.db").write_text("DBDATA", encoding="utf-8")

    # old_root = Path(config.__file__).parent → ชี้ไปที่ dir จำลอง
    monkeypatch.setattr(cfg, "__file__", str(old / "config.py"))
    cfg._migrate_legacy_data(new)

    assert (new / "settings.json").read_text(encoding="utf-8") == '{"shop_name":"legacy"}'
    assert (new / "data" / "app.db").read_text(encoding="utf-8") == "DBDATA"


def test_migrate_legacy_never_overwrites(cfg, tmp_path, monkeypatch):
    """ปลายทางมีไฟล์อยู่แล้ว → ต้องไม่ทับ (non-destructive)."""
    old = tmp_path / "old"
    old.mkdir()
    new = tmp_path / "new"
    new.mkdir()
    (old / "settings.json").write_text("OLD", encoding="utf-8")
    (new / "settings.json").write_text("KEEP", encoding="utf-8")

    monkeypatch.setattr(cfg, "__file__", str(old / "config.py"))
    cfg._migrate_legacy_data(new)

    assert (new / "settings.json").read_text(encoding="utf-8") == "KEEP"


# ── save() allowlist + secret stripping ──────────────────────────────────────

def test_save_drops_foreign_keys_and_secrets(cfg):
    cfg.save({
        "shop_name": "MyShop",
        "duration": 15,
        "__weird__": "hacked",       # foreign key → drop
        "google_api_key": "SECRET",  # ENV secret → must not land in settings.json
    })
    on_disk = json.loads(cfg.CONFIG_FILE.read_text(encoding="utf-8"))
    assert on_disk["shop_name"] == "MyShop"
    assert on_disk["duration"] == 15
    assert "__weird__" not in on_disk
    assert "google_api_key" not in on_disk


def test_save_then_load_roundtrip(cfg):
    cfg.save({"shop_name": "Roundtrip", "review_mode": "hold"})
    loaded = cfg.load()
    assert loaded["shop_name"] == "Roundtrip"
    assert loaded["review_mode"] == "hold"
    # DEFAULT keys ที่ไม่ได้บันทึกก็ยังมีค่า default
    assert loaded["duration"] == cfg.DEFAULT["duration"]


# ── secrets (.env) ───────────────────────────────────────────────────────────

def test_set_secret_writes_env_and_load_masks(cfg):
    cfg.set_secret("google_api_key", "KEY123")
    assert os.environ["GOOGLE_API_KEY"] == "KEY123"
    assert "GOOGLE_API_KEY=KEY123" in cfg.ENV_FILE.read_text(encoding="utf-8")
    # load() overlays secret from env; public_load() masks it
    assert cfg.load()["google_api_key"] == "KEY123"
    assert cfg.public_load()["google_api_key"] == cfg.MASK


def test_set_secret_empty_removes(cfg):
    cfg.set_secret("google_api_key", "KEY123")
    cfg.set_secret("google_api_key", "")
    assert "GOOGLE_API_KEY" not in os.environ
    assert cfg.load()["google_api_key"] == ""
    # unset secret → public_load reports empty string (not MASK)
    assert cfg.public_load()["google_api_key"] == ""


def test_set_secret_rejects_unknown_field(cfg):
    with pytest.raises(KeyError):
        cfg.set_secret("not_a_secret", "x")
