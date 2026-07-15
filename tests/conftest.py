"""Shared pytest fixtures + isolated DATA_ROOT for the VDO Gen Auto Pilot backend.

VGAP_DATA_DIR ต้องถูกตั้งก่อน `import config` (config.DATA_ROOT อ่านตอน import).
เราชี้ DATA_ROOT ไปยัง tempdir แยกของ session แล้ววาง placeholder (data/, settings.json)
ไว้ล่วงหน้า เพื่อให้ config._migrate_legacy_data ข้ามการก๊อป (dst มีอยู่แล้ว) —
เทสต์จึงไม่แตะ/ไม่ก๊อปข้อมูลจริงของผู้ใช้ในเครื่อง.
"""
import os
import sys
import shutil
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DESKTOP = REPO_ROOT / "desktop"
sys.path.insert(0, str(DESKTOP))

# ── isolated DATA_ROOT (must be set before importing config) ──────────────────
_SESSION_DATA = Path(tempfile.mkdtemp(prefix="vgap-test-data-"))
(_SESSION_DATA / "data").mkdir(parents=True, exist_ok=True)          # block data migration
(_SESSION_DATA / "settings.json").write_text("{}", encoding="utf-8")  # block settings migration
os.environ["VGAP_DATA_DIR"] = str(_SESSION_DATA)
os.environ.pop("VGAP_ADB", None)
for _k in ("CLAUDE_API_KEY", "GOOGLE_API_KEY", "DID_API_KEY"):
    os.environ.pop(_k, None)

import config as _cfg  # noqa: E402  (imported after env is set on purpose)

DESKTOP_DIR = str(DESKTOP)


@pytest.fixture(autouse=True)
def _clean_data_root():
    """แต่ละเทสต์เริ่มจากไม่มี settings.json/.env/flow-adapter.json ใน DATA_ROOT
    → cfg.load() คืน DEFAULT ล้วน และไม่มี secret ค้างใน env."""
    _wipe()
    yield
    _wipe()


def _wipe():
    for name in ("settings.json", ".env", "flow-adapter.json"):
        p = _cfg.DATA_ROOT / name
        try:
            if p.exists():
                p.unlink()
        except OSError:
            pass
    for env_name in _cfg.ENV_KEYS.values():
        os.environ.pop(env_name, None)


@pytest.fixture
def cfg():
    return _cfg


@pytest.fixture
def store(tmp_path):
    """JobStore สดต่อเทสต์ (SQLite ใน tempdir ของเทสต์)."""
    from services.db import JobStore
    db = JobStore(tmp_path / "jobstore.db")
    yield db
    db.close()


@pytest.fixture
def web(tmp_path):
    """(TestClient, WebServer, JobStore) พร้อม db แยกต่อเทสต์, ไม่มี adb จริง."""
    from fastapi.testclient import TestClient
    from services.web_server import WebServer
    from services.db import JobStore

    db = JobStore(tmp_path / "api.db")
    ws = WebServer(port=0)
    ws.db = db
    ws.adb = None
    ws.budget = None
    ws.autopilot = None
    client = TestClient(ws.app)
    yield client, ws, db
    db.close()


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_SESSION_DATA, ignore_errors=True)
