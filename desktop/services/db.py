"""
SQLite job store — single source of truth for the auto-pilot pipeline (A1.1).

Replaces the scattered state (in-memory queues + folder location +
sidecar JSON) with one persistent, queryable table so the system can
**resume after a restart** and track retries/errors/cost — the foundation
for near-zero-touch operation.

stdlib only (sqlite3) → no extra dependency, perfect for a local app.

Job lifecycle (status):

    queued ──▶ generating ──▶ generated ──▶ posting ──▶ posted
                   │              │             │
                   └──▶ error ◀───┴─────────────┘
                                  │
              (review hold) ──▶ held ──▶ generated

Workers will move jobs through these states in A1.2. For now this module
just provides the store; the in-memory worker queues keep running unchanged.
"""
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional

# Canonical statuses
QUEUED      = "queued"        # waiting to be generated
GENERATING  = "generating"   # being generated (Flow)
GENERATED   = "generated"    # clip ready, waiting to post
HELD        = "held"         # waiting for manual approval (review mode)
POSTING     = "posting"      # being posted to phone
POSTED      = "posted"       # done ✓
ERROR       = "error"        # failed (see error column, attempts)

ACTIVE_STATUSES = (GENERATING, POSTING)   # "in flight" → reset on restart


def _now() -> int:
    return int(time.time())


class JobStore:
    """Thread-safe SQLite-backed job queue.

    Workers run in background threads, so every access goes through one
    shared connection guarded by a reentrant lock. WAL mode keeps reads
    snappy while a write is in progress.
    """

    def __init__(self, db_path):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._init_schema()

    # ── schema ────────────────────────────────────────────────

    def _init_schema(self):
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id    TEXT UNIQUE,
                    name          TEXT DEFAULT '',
                    product_json  TEXT DEFAULT '{}',
                    status        TEXT NOT NULL DEFAULT 'queued',
                    stage         TEXT DEFAULT '',
                    video_path    TEXT DEFAULT '',
                    caption       TEXT DEFAULT '',
                    error         TEXT DEFAULT '',
                    attempts      INTEGER DEFAULT 0,
                    max_attempts  INTEGER DEFAULT 3,
                    cost          REAL DEFAULT 0,
                    cost_at       INTEGER DEFAULT 0,
                    next_retry_at INTEGER DEFAULT 0,
                    created_at    INTEGER,
                    updated_at    INTEGER,
                    posted_at     INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

                CREATE TABLE IF NOT EXISTS logs (
                    id      INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts      INTEGER,
                    level   TEXT DEFAULT 'info',   -- info|success|warn|error
                    source  TEXT DEFAULT '',       -- FLOW|POST|BUDGET|VERIFY|...
                    message TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
                """
            )
            self._conn.commit()
            self._migrate_schema()

    def _migrate_schema(self):
        """Add columns missing from an older DB (idempotent schema evolution)."""
        with self._lock:
            cols = {r["name"] for r in self._conn.execute("PRAGMA table_info(jobs)")}
            adds = []
            if "next_retry_at" not in cols:
                adds.append("ALTER TABLE jobs ADD COLUMN next_retry_at INTEGER DEFAULT 0")
            if "cost_at" not in cols:
                adds.append("ALTER TABLE jobs ADD COLUMN cost_at INTEGER DEFAULT 0")
            for sql in adds:
                self._conn.execute(sql)
            if adds:
                self._conn.commit()

    # ── helpers ───────────────────────────────────────────────

    @staticmethod
    def _row(r: Optional[sqlite3.Row]) -> Optional[dict]:
        if r is None:
            return None
        d = dict(r)
        try:
            d["product"] = json.loads(d.get("product_json") or "{}")
        except Exception:
            d["product"] = {}
        return d

    # ── add ───────────────────────────────────────────────────

    def add(self, product: dict, max_attempts: int = 3) -> Optional[int]:
        """Insert one product as a queued job. Deduped by product_id —
        an existing product_id is ignored (returns None)."""
        pid = product.get("product_id") or f"p{int(time.time()*1000)}"
        product["product_id"] = pid
        name = (product.get("basic_info", {}) or {}).get("name", "")[:120]
        ts = _now()
        with self._lock:
            cur = self._conn.execute(
                """INSERT OR IGNORE INTO jobs
                   (product_id, name, product_json, status, max_attempts,
                    created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (pid, name, json.dumps(product, ensure_ascii=False),
                 QUEUED, max_attempts, ts, ts),
            )
            self._conn.commit()
            return cur.lastrowid if cur.rowcount else None

    def add_many(self, products: list, max_attempts: int = 3) -> int:
        """Add a batch; returns how many were newly inserted (deduped)."""
        added = 0
        for p in products:
            if self.add(p, max_attempts) is not None:
                added += 1
        return added

    def import_clip(self, product: dict, status: str, video_path: str,
                    posted_at: Optional[int] = None) -> Optional[int]:
        """Insert an already-produced clip at a specific status (for migrating
        existing files into the DB). Deduped by product_id."""
        pid = product.get("product_id") or f"p{int(time.time()*1000)}"
        product["product_id"] = pid
        name = (product.get("basic_info", {}) or {}).get("name", "")[:120]
        ts = _now()
        with self._lock:
            cur = self._conn.execute(
                """INSERT OR IGNORE INTO jobs
                   (product_id, name, product_json, status, video_path,
                    posted_at, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (pid, name, json.dumps(product, ensure_ascii=False),
                 status, video_path, posted_at, ts, ts),
            )
            self._conn.commit()
            return cur.lastrowid if cur.rowcount else None

    # ── claim (atomic) ────────────────────────────────────────

    def claim(self, from_status: str, to_status: str) -> Optional[dict]:
        """Atomically grab the oldest job in `from_status`, flip it to
        `to_status`, and return it. Prevents two workers grabbing the same
        job. Returns None if the queue is empty."""
        ts = _now()
        with self._lock:
            row = self._conn.execute(
                """SELECT id FROM jobs
                   WHERE status=? AND (next_retry_at IS NULL OR next_retry_at<=?)
                   ORDER BY created_at LIMIT 1""",
                (from_status, ts),
            ).fetchone()
            if row is None:
                return None
            jid = row["id"]
            self._conn.execute(
                "UPDATE jobs SET status=?, updated_at=? WHERE id=?",
                (to_status, ts, jid),
            )
            self._conn.commit()
            return self.get(jid)

    # ── update ────────────────────────────────────────────────

    def update(self, job_id: int, **fields):
        """Update arbitrary columns; updated_at is set automatically."""
        if not fields:
            return
        fields["updated_at"] = _now()
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._lock:
            self._conn.execute(
                f"UPDATE jobs SET {cols} WHERE id=?",
                (*fields.values(), job_id),
            )
            self._conn.commit()

    def set_status(self, job_id: int, status: str, **extra):
        self.update(job_id, status=status, **extra)

    def mark_posted(self, job_id: int, **extra):
        self.update(job_id, status=POSTED, posted_at=_now(),
                    error="", next_retry_at=0, **extra)

    def mark_error(self, job_id: int, message: str):
        """Record a terminal failure and bump the attempt counter."""
        with self._lock:
            self._conn.execute(
                """UPDATE jobs
                   SET status=?, error=?, attempts=attempts+1, updated_at=?
                   WHERE id=?""",
                (ERROR, (message or "")[:1000], _now(), job_id),
            )
            self._conn.commit()

    def record_failure(self, job_id: int, retry_status: str, message: str,
                       backoff_base: int = 60, backoff_cap: int = 3600) -> dict:
        """A step failed. Auto-decide: retry (with exponential backoff) or give up.
          - attempts+1 < max_attempts → status=retry_status, schedule next_retry_at
          - otherwise                 → status=error (terminal)
        Returns {retrying: bool, attempts, retry_in?, status}. The pipeline keeps
        running by itself — this is what makes failures recover unattended.
        """
        j = self.get(job_id)
        if not j:
            return {"retrying": False, "attempts": 0, "status": ERROR}
        attempts = j["attempts"] + 1
        msg = (message or "")[:1000]
        now = _now()
        if attempts < j["max_attempts"]:
            delay = min(backoff_base * (2 ** (attempts - 1)), backoff_cap)
            with self._lock:
                self._conn.execute(
                    """UPDATE jobs SET status=?, error=?, attempts=?,
                       next_retry_at=?, updated_at=? WHERE id=?""",
                    (retry_status, msg, attempts, now + delay, now, job_id),
                )
                self._conn.commit()
            return {"retrying": True, "attempts": attempts,
                    "retry_in": delay, "status": retry_status}
        with self._lock:
            self._conn.execute(
                """UPDATE jobs SET status=?, error=?, attempts=?, updated_at=?
                   WHERE id=?""",
                (ERROR, msg, attempts, now, job_id),
            )
            self._conn.commit()
        return {"retrying": False, "attempts": attempts, "status": ERROR}

    def can_retry(self, job_id: int) -> bool:
        j = self.get(job_id)
        return bool(j) and j["attempts"] < j["max_attempts"]

    def has_due(self, status: str) -> bool:
        """Is there at least one job in `status` whose retry backoff has elapsed?"""
        now = _now()
        with self._lock:
            r = self._conn.execute(
                """SELECT 1 FROM jobs
                   WHERE status=? AND (next_retry_at IS NULL OR next_retry_at<=?)
                   LIMIT 1""",
                (status, now),
            ).fetchone()
        return r is not None

    def requeue(self, job_id: int, status: str = QUEUED):
        """Send a job back to be retried now (clears error + backoff)."""
        self.update(job_id, status=status, error="", next_retry_at=0)

    # ── read ──────────────────────────────────────────────────

    def get(self, job_id: int) -> Optional[dict]:
        with self._lock:
            r = self._conn.execute(
                "SELECT * FROM jobs WHERE id=?", (job_id,)
            ).fetchone()
        return self._row(r)

    def get_by_product(self, product_id: str) -> Optional[dict]:
        with self._lock:
            r = self._conn.execute(
                "SELECT * FROM jobs WHERE product_id=?", (product_id,)
            ).fetchone()
        return self._row(r)

    def list(self, status: Optional[str] = None,
             limit: int = 200, offset: int = 0) -> list:
        q = "SELECT * FROM jobs"
        args: list = []
        if status:
            q += " WHERE status=?"
            args.append(status)
        q += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        with self._lock:
            rows = self._conn.execute(q, args).fetchall()
        return [self._row(r) for r in rows]

    def count(self, status: Optional[str] = None) -> int:
        with self._lock:
            if status:
                r = self._conn.execute(
                    "SELECT COUNT(*) c FROM jobs WHERE status=?", (status,)
                ).fetchone()
            else:
                r = self._conn.execute("SELECT COUNT(*) c FROM jobs").fetchone()
        return r["c"]

    def add_cost(self, job_id: int, amount: float):
        """Record cost incurred for a job (timestamped) — for budget tracking."""
        self.update(job_id, cost=amount, cost_at=_now())

    def spend_since(self, ts: int) -> float:
        """Total cost incurred since timestamp `ts` (by cost_at)."""
        with self._lock:
            r = self._conn.execute(
                "SELECT COALESCE(SUM(cost),0) s FROM jobs WHERE cost_at>=?", (ts,)
            ).fetchone()
        return float(r["s"] or 0)

    def stats(self) -> dict:
        """Counts per status + total cost — for the cockpit/dashboard."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT status, COUNT(*) c FROM jobs GROUP BY status"
            ).fetchall()
            total_cost = self._conn.execute(
                "SELECT COALESCE(SUM(cost),0) s FROM jobs"
            ).fetchone()["s"]
        by_status = {r["status"]: r["c"] for r in rows}
        return {
            "by_status": by_status,
            "total": sum(by_status.values()),
            "total_cost": total_cost,
        }

    # ── logs (A1.8) ───────────────────────────────────────────

    LOG_CAP = 5000   # เก็บ log ล่าสุดเท่านี้ (prune ส่วนเกิน)

    def add_log(self, message: str, level: str = "info", source: str = ""):
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO logs (ts, level, source, message) VALUES (?,?,?,?)",
                (_now(), level, source, (message or "")[:2000]),
            )
            # prune เป็นระยะ (ทุก ~200 บรรทัด) กันตารางบวม
            if cur.lastrowid and cur.lastrowid % 200 == 0:
                self._conn.execute(
                    "DELETE FROM logs WHERE id <= (SELECT MAX(id) FROM logs) - ?",
                    (self.LOG_CAP,),
                )
            self._conn.commit()

    def list_logs(self, level: Optional[str] = None, source: Optional[str] = None,
                  limit: int = 200, since_id: int = 0) -> list:
        q = "SELECT * FROM logs WHERE id > ?"
        args: list = [since_id]
        if level:
            q += " AND level=?"; args.append(level)
        if source:
            q += " AND source=?"; args.append(source)
        q += " ORDER BY id DESC LIMIT ?"; args.append(limit)
        with self._lock:
            rows = self._conn.execute(q, args).fetchall()
        return [dict(r) for r in rows]

    def clear_logs(self):
        with self._lock:
            self._conn.execute("DELETE FROM logs")
            self._conn.commit()

    def log_stats(self) -> dict:
        with self._lock:
            rows = self._conn.execute(
                "SELECT level, COUNT(*) c FROM logs GROUP BY level"
            ).fetchall()
        return {r["level"]: r["c"] for r in rows}

    def last_error(self) -> Optional[dict]:
        with self._lock:
            r = self._conn.execute(
                "SELECT * FROM logs WHERE level='error' ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return dict(r) if r else None

    # ── recovery (near-zero-touch) ────────────────────────────

    def reset_stuck(self) -> int:
        """Called on startup: jobs left mid-flight by a crash are rewound so
        the pipeline resumes by itself.
          generating → queued     (regenerate from scratch)
          posting    → generated  (retry posting)
        Returns how many jobs were reset.

        NOTE: a 'posting' job may have actually posted before the crash;
        re-posting risks a duplicate. A1.3 adds OCR post-verification to
        make this safe. For now we favour "don't lose work".
        """
        ts = _now()
        with self._lock:
            cur1 = self._conn.execute(
                "UPDATE jobs SET status=?, stage='', next_retry_at=0, updated_at=? WHERE status=?",
                (QUEUED, ts, GENERATING),
            )
            cur2 = self._conn.execute(
                "UPDATE jobs SET status=?, stage='', next_retry_at=0, updated_at=? WHERE status=?",
                (GENERATED, ts, POSTING),
            )
            self._conn.commit()
            return (cur1.rowcount or 0) + (cur2.rowcount or 0)

    def close(self):
        with self._lock:
            self._conn.close()


def migrate_folders(store: "JobStore", pending_dir, done_dir, error_dir) -> int:
    """One-time import of existing clips (mp4 + sidecar .json) from the old
    folder layout into the DB. Idempotent — deduped by product_id, so running
    it again is safe. Returns how many clips were newly imported.

        pending/ → generated   done/ → posted   error/ → error
    """
    mapping = [
        (Path(pending_dir), GENERATED, False),
        (Path(done_dir),    POSTED,    True),
        (Path(error_dir),   ERROR,     False),
    ]
    imported = 0
    for folder, status, is_posted in mapping:
        if not folder.exists():
            continue
        for mp4 in sorted(folder.glob("*.mp4")):
            meta = {}
            side = mp4.with_suffix(".json")
            if side.exists():
                try:
                    meta = json.loads(side.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
            pid = meta.get("product_id") or mp4.stem
            product = {
                "product_id": pid,
                "basic_info": {
                    "name":       meta.get("name", mp4.stem),
                    "price":      meta.get("price", ""),
                    "sold_count": meta.get("sold_count", ""),
                },
                "commission": {"rate": meta.get("commission", "")},
                "links": {"affiliate_link": meta.get("link", "")},
            }
            posted_at = meta.get("posted_at") if is_posted else None
            if store.import_clip(product, status, str(mp4), posted_at) is not None:
                imported += 1
    return imported
