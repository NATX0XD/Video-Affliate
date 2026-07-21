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
                    assigned_serial TEXT DEFAULT '',   -- คลิปนี้ล็อกให้เครื่อง serial นี้ ('' = auto)
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

                CREATE TABLE IF NOT EXISTS app_config (
                    key        TEXT PRIMARY KEY,
                    value      TEXT,
                    updated_at INTEGER
                );

                -- usage ledger (J): บันทึกการใช้ AI ทุกครั้ง แยก service/kind
                CREATE TABLE IF NOT EXISTS usage (
                    id      INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts      INTEGER,
                    service TEXT,            -- flow | gemini
                    kind    TEXT,            -- clip | prompt | verify
                    qty     INTEGER DEFAULT 0,   -- คลิป/จำนวน call
                    tokens  INTEGER DEFAULT 0,   -- token (Gemini)
                    cost    REAL DEFAULT 0,      -- บาทประเมิน
                    job_id  INTEGER,
                    meta    TEXT DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(ts);

                -- สถิติโพสต์รายแพลตฟอร์ม (F): บันทึกทุกครั้งที่โพสต์ไปแพลตฟอร์มหนึ่ง
                CREATE TABLE IF NOT EXISTS platform_posts (
                    id       INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts       INTEGER,
                    platform TEXT,            -- shopee | tiktok | reels | instagram | youtube
                    ok       INTEGER DEFAULT 0,   -- 1 = สำเร็จ, 0 = ล้ม
                    job_id   INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_pp_ts ON platform_posts(ts);
                CREATE INDEX IF NOT EXISTS idx_pp_plat ON platform_posts(platform);

                -- สินค้า (G3): แคตตาล็อกสินค้าที่ดูดมา ให้ web เห็นครบ (แยกจาก jobs/คลิป)
                CREATE TABLE IF NOT EXISTS products (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT DEFAULT '',
                    price       TEXT DEFAULT '',
                    commission  TEXT DEFAULT '',
                    image_url   TEXT DEFAULT '',
                    cart_link   TEXT DEFAULT '',
                    source      TEXT DEFAULT '',      -- shopee | manual | ...
                    created_ts  INTEGER,
                    status      TEXT DEFAULT 'new'    -- new | queued | used | ...
                );
                CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_ts);
                CREATE INDEX IF NOT EXISTS idx_products_status  ON products(status);

                -- คิวงานบน DB (โครงอนาคต): extension ดึงงานไปทำเอง แทน in-memory
                CREATE TABLE IF NOT EXISTS queue (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    payload    TEXT DEFAULT '{}',    -- JSON งาน (product/prompt/ฯลฯ)
                    status     TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | done
                    priority   INTEGER DEFAULT 0,    -- มากกว่า = ทำก่อน
                    claimed_by TEXT DEFAULT '',
                    created_ts INTEGER,
                    claimed_ts INTEGER DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
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
            if "assigned_serial" not in cols:
                adds.append("ALTER TABLE jobs ADD COLUMN assigned_serial TEXT DEFAULT ''")
            for sql in adds:
                self._conn.execute(sql)

            pp_cols = {r["name"] for r in self._conn.execute("PRAGMA table_info(platform_posts)")}
            pp_adds = []
            if "price" not in pp_cols:
                pp_adds.append("ALTER TABLE platform_posts ADD COLUMN price REAL DEFAULT 0")
            if "commission" not in pp_cols:
                pp_adds.append("ALTER TABLE platform_posts ADD COLUMN commission REAL DEFAULT 0")
            for sql in pp_adds:
                self._conn.execute(sql)

            # products (G3): เติมคอลัมน์ที่อาจขาดถ้าตารางถูกสร้างไว้ก่อนหน้า (ปลอดภัย)
            prod_cols = {r["name"] for r in self._conn.execute("PRAGMA table_info(products)")}
            prod_adds = []
            for col, ddl in (
                ("name",       "ALTER TABLE products ADD COLUMN name TEXT DEFAULT ''"),
                ("price",      "ALTER TABLE products ADD COLUMN price TEXT DEFAULT ''"),
                ("commission", "ALTER TABLE products ADD COLUMN commission TEXT DEFAULT ''"),
                ("image_url",  "ALTER TABLE products ADD COLUMN image_url TEXT DEFAULT ''"),
                ("cart_link",  "ALTER TABLE products ADD COLUMN cart_link TEXT DEFAULT ''"),
                ("source",     "ALTER TABLE products ADD COLUMN source TEXT DEFAULT ''"),
                ("created_ts", "ALTER TABLE products ADD COLUMN created_ts INTEGER"),
                ("status",     "ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'new'"),
            ):
                if prod_cols and col not in prod_cols:
                    prod_adds.append(ddl)
            for sql in prod_adds:
                self._conn.execute(sql)

            # queue (โครงคิวอนาคต): เติมคอลัมน์ที่อาจขาด (ปลอดภัย)
            q_cols = {r["name"] for r in self._conn.execute("PRAGMA table_info(queue)")}
            q_adds = []
            for col, ddl in (
                ("payload",    "ALTER TABLE queue ADD COLUMN payload TEXT DEFAULT '{}'"),
                ("status",     "ALTER TABLE queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'"),
                ("priority",   "ALTER TABLE queue ADD COLUMN priority INTEGER DEFAULT 0"),
                ("claimed_by", "ALTER TABLE queue ADD COLUMN claimed_by TEXT DEFAULT ''"),
                ("created_ts", "ALTER TABLE queue ADD COLUMN created_ts INTEGER"),
                ("claimed_ts", "ALTER TABLE queue ADD COLUMN claimed_ts INTEGER DEFAULT 0"),
            ):
                if q_cols and col not in q_cols:
                    q_adds.append(ddl)
            for sql in q_adds:
                self._conn.execute(sql)

            if adds or pp_adds or prod_adds or q_adds:
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

    def claim_for_device(self, serial: str, from_status: str,
                         to_status: str) -> Optional[dict]:
        """เหมือน claim() แต่เคารพ assigned_serial (M1):
          - งานที่ assign ให้ serial นี้ → หยิบก่อน
          - งานที่ยังไม่ assign ('') → เครื่องไหนก็หยิบได้
          - งานที่ assign ให้เครื่องอื่น → ข้าม (เครื่องนี้ห้ามแตะ)
        ถ้า serial ว่าง → พฤติกรรมเดิม (auto) แต่ยังกันงานที่ถูกจองไว้ให้เครื่องอื่น."""
        ts = _now()
        with self._lock:
            row = self._conn.execute(
                """SELECT id FROM jobs
                   WHERE status=? AND (next_retry_at IS NULL OR next_retry_at<=?)
                     AND (assigned_serial='' OR assigned_serial=?)
                   ORDER BY (assigned_serial=?) DESC, created_at ASC LIMIT 1""",
                (from_status, ts, serial, serial),
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

    def set_job_assignment(self, job_id: int, serial: str = ""):
        """ล็อกคลิปให้เครื่อง serial ('' = auto/ปลดล็อก)."""
        self.update(job_id, assigned_serial=(serial or ""))

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

    def delete(self, job_id: int) -> Optional[dict]:
        """ลบงาน (คืน row เดิมเพื่อให้ caller ลบไฟล์)."""
        j = self.get(job_id)
        with self._lock:
            self._conn.execute("DELETE FROM jobs WHERE id=?", (job_id,))
            self._conn.commit()
        return j

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

    # ── สถิติโพสต์รายแพลตฟอร์ม (F) ─────────────────────────────

    def add_platform_post(self, platform: str, ok: bool, job_id: int = None,
                          price: float = 0, commission: float = 0):
        """บันทึก 1 ครั้งที่โพสต์ไปแพลตฟอร์มหนึ่ง พร้อมราคา+ค่าคอม เพื่อคำนวณรายได้."""
        with self._lock:
            self._conn.execute(
                "INSERT INTO platform_posts (ts, platform, ok, job_id, price, commission) VALUES (?,?,?,?,?,?)",
                (_now(), platform, 1 if ok else 0, job_id, price or 0, commission or 0),
            )
            self._conn.commit()

    def platform_summary(self) -> dict:
        """สรุปต่อแพลตฟอร์ม: โพสต์วันนี้/เดือนนี้, อัตราสำเร็จ, รายได้."""
        from datetime import datetime
        n = datetime.now()
        day0   = int(datetime(n.year, n.month, n.day).timestamp())
        month0 = int(datetime(n.year, n.month, 1).timestamp())
        with self._lock:
            rows = self._conn.execute(
                """SELECT platform,
                          COALESCE(SUM(CASE WHEN ts>=? THEN 1 ELSE 0 END),0)                            AS today,
                          COALESCE(SUM(CASE WHEN ts>=? THEN 1 ELSE 0 END),0)                            AS month,
                          COALESCE(SUM(CASE WHEN ts>=? AND ok=1 THEN 1 ELSE 0 END),0)                   AS month_ok,
                          COUNT(*)                                                                        AS total,
                          COALESCE(SUM(ok),0)                                                            AS total_ok,
                          MAX(ts)                                                                         AS last_ts,
                          COALESCE(SUM(CASE WHEN ts>=? AND ok=1 THEN price*commission/100 ELSE 0 END),0) AS revenue_today,
                          COALESCE(SUM(CASE WHEN ts>=? AND ok=1 THEN price*commission/100 ELSE 0 END),0) AS revenue_month,
                          COALESCE(SUM(CASE WHEN ok=1 THEN price*commission/100 ELSE 0 END),0)           AS revenue_total
                   FROM platform_posts GROUP BY platform""",
                (day0, month0, month0, day0, month0),
            ).fetchall()
        out = {}
        for r in rows:
            total = r["total"] or 0
            out[r["platform"]] = {
                "today":          r["today"],
                "month":          r["month"],
                "success_rate":   round((r["total_ok"] / total) * 100) if total else None,
                "last_ts":        r["last_ts"],
                "revenue_today":  round(r["revenue_today"], 2),
                "revenue_month":  round(r["revenue_month"], 2),
                "revenue_total":  round(r["revenue_total"], 2),
            }
        return out

    def platform_revenue_by_day(self, days: int = 14) -> list:
        """รายได้รายวัน แยกตามแพลตฟอร์ม สำหรับกราฟ (14 วันล่าสุด)."""
        import time as _time
        from datetime import datetime, timedelta
        cutoff = int(_time.time()) - days * 86400
        with self._lock:
            rows = self._conn.execute(
                """SELECT date(ts, 'unixepoch', 'localtime')      AS day,
                          platform,
                          COALESCE(SUM(CASE WHEN ok=1 THEN price*commission/100 ELSE 0 END),0) AS revenue
                   FROM platform_posts
                   WHERE ts >= ? AND ok=1
                   GROUP BY day, platform
                   ORDER BY day""",
                (cutoff,),
            ).fetchall()

        # pivot: [{date, platform1, platform2, ...}]
        days_map: dict = {}
        platforms: set = set()
        for r in rows:
            d = r["day"]; p = r["platform"]
            platforms.add(p)
            days_map.setdefault(d, {})[p] = round(r["revenue"], 2)

        # เติมวันที่ขาดหาย
        result = []
        today = datetime.now().date()
        for i in range(days - 1, -1, -1):
            day = str(today - timedelta(days=i))
            entry = {"date": day}
            for p in platforms:
                entry[p] = days_map.get(day, {}).get(p, 0)
            result.append(entry)
        return result

    def recent_platform_posts(self, limit: int = 100) -> list:
        """ดึง platform_posts ล่าสุด N รายการ พร้อมชื่องาน."""
        with self._lock:
            rows = self._conn.execute(
                """SELECT pp.ts, pp.platform, pp.ok, pp.job_id,
                          COALESCE(j.name, '') AS job_name
                   FROM platform_posts pp
                   LEFT JOIN jobs j ON pp.job_id = j.id
                   ORDER BY pp.ts DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    # ── usage ledger (J): การใช้ AI แยก service/kind ──────────────

    def add_usage(self, service: str, kind: str, qty: int = 1,
                  tokens: int = 0, cost: float = 0.0,
                  job_id: int = None, meta: str = ""):
        """บันทึก 1 เหตุการณ์การใช้ AI (flow clip / gemini prompt|verify)."""
        with self._lock:
            self._conn.execute(
                "INSERT INTO usage (ts, service, kind, qty, tokens, cost, job_id, meta) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (_now(), service, kind, int(qty or 0), int(tokens or 0),
                 float(cost or 0), job_id, meta),
            )
            self._conn.commit()

    def usage_summary(self, since: int = 0) -> dict:
        """สรุปการใช้ตั้งแต่ ts `since` — แยกตาม service (qty/tokens/cost)."""
        with self._lock:
            rows = self._conn.execute(
                """SELECT service, COALESCE(SUM(qty),0) qty,
                          COALESCE(SUM(tokens),0) tokens, COALESCE(SUM(cost),0) cost
                   FROM usage WHERE ts>=? GROUP BY service""",
                (since,),
            ).fetchall()
        by = {r["service"]: {"qty": r["qty"], "tokens": r["tokens"],
                             "cost": round(r["cost"], 2)} for r in rows}
        return {
            "flow":   by.get("flow",   {"qty": 0, "tokens": 0, "cost": 0}),
            "gemini": by.get("gemini", {"qty": 0, "tokens": 0, "cost": 0}),
            "total_cost":   round(sum(v["cost"] for v in by.values()), 2),
            "total_tokens": sum(v["tokens"] for v in by.values()),
        }

    def usage_spend_since(self, ts: int) -> float:
        """รวมค่าใช้จ่าย AI (บาท) ตั้งแต่ ts — ใช้คุมงบเดือน (J)."""
        with self._lock:
            r = self._conn.execute(
                "SELECT COALESCE(SUM(cost),0) s FROM usage WHERE ts>=?", (ts,)
            ).fetchone()
        return float(r["s"] or 0)

    def usage_by_day(self, days: int = 14) -> list:
        """ค่าใช้จ่าย AI รายวัน แยก flow/gemini (ย้อนหลัง N วัน) สำหรับกราฟ."""
        from datetime import datetime, timedelta
        start_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
        start = int(start_dt.timestamp())
        with self._lock:
            rows = self._conn.execute(
                """SELECT strftime('%Y-%m-%d', ts, 'unixepoch', 'localtime') d, service,
                          COALESCE(SUM(cost),0) cost
                   FROM usage WHERE ts>=? GROUP BY d, service""",
                (start,),
            ).fetchall()
        bucket = {}
        for r in rows:
            bucket.setdefault(r["d"], {})[r["service"]] = r["cost"]
        out = []
        for i in range(days):
            dt = start_dt + timedelta(days=i)
            b = bucket.get(dt.strftime("%Y-%m-%d"), {})
            flow_c, gem_c = round(b.get("flow", 0), 2), round(b.get("gemini", 0), 2)
            out.append({"date": dt.strftime("%d/%m"), "flow": flow_c,
                        "gemini": gem_c, "cost": round(flow_c + gem_c, 2)})
        return out

    def posts_by_day(self, days: int = 14) -> list:
        """จำนวนโพสต์ + ต้นทุน รายวัน (ย้อนหลัง N วัน) สำหรับกราฟ."""
        from datetime import datetime, timedelta
        start_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
        start = int(start_dt.timestamp())
        with self._lock:
            rows = self._conn.execute(
                """SELECT strftime('%Y-%m-%d', posted_at, 'unixepoch', 'localtime') d,
                          COUNT(*) c, COALESCE(SUM(cost),0) cost
                   FROM jobs WHERE status=? AND posted_at>=? GROUP BY d""",
                (POSTED, start),
            ).fetchall()
        bucket = {r["d"]: {"count": r["c"], "cost": r["cost"]} for r in rows}
        out = []
        for i in range(days):
            dt = start_dt + timedelta(days=i)
            b = bucket.get(dt.strftime("%Y-%m-%d"), {"count": 0, "cost": 0})
            out.append({"date": dt.strftime("%d/%m"), "count": b["count"], "cost": round(b["cost"], 2)})
        return out

    def error_list(self, limit: int = 20) -> list:
        with self._lock:
            rows = self._conn.execute(
                "SELECT name, error, attempts, updated_at FROM jobs WHERE status=? ORDER BY updated_at DESC LIMIT ?",
                (ERROR, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def count_posted_today(self) -> int:
        from datetime import datetime
        n = datetime.now()
        start = int(datetime(n.year, n.month, n.day).timestamp())
        with self._lock:
            r = self._conn.execute(
                "SELECT COUNT(*) c FROM jobs WHERE status=? AND posted_at>=?", (POSTED, start)
            ).fetchone()
        return r["c"]

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

    # ── app config (key-value: shop_name, setup ฯลฯ) ──────────

    def get_config(self, key: str, default=None):
        with self._lock:
            r = self._conn.execute(
                "SELECT value FROM app_config WHERE key=?", (key,)
            ).fetchone()
        return r["value"] if r else default

    def set_config(self, key: str, value: str):
        with self._lock:
            self._conn.execute(
                """INSERT INTO app_config (key, value, updated_at) VALUES (?,?,?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
                (key, value, _now()),
            )
            self._conn.commit()

    def all_config(self) -> dict:
        with self._lock:
            rows = self._conn.execute("SELECT key, value FROM app_config").fetchall()
        return {r["key"]: r["value"] for r in rows}

    # ── products (G3): แคตตาล็อกสินค้าที่ดูดมา ──────────────────

    def add_product(self, product: dict) -> Optional[int]:
        """เพิ่มสินค้า 1 รายการเข้าแคตตาล็อก (แยกจาก jobs/คลิป). คืน id ที่เพิ่ง insert.

        รับ dict ที่มีคีย์ตรงคอลัมน์ (name/price/commission/image_url/cart_link/source/status)
        — ไม่แตะตาราง jobs. dedup แบบเบา ๆ ด้วย cart_link: ถ้ามี cart_link ซ้ำ → คืน id เดิม.
        """
        cart = (product.get("cart_link") or "").strip()
        if cart:
            with self._lock:
                r = self._conn.execute(
                    "SELECT id FROM products WHERE cart_link=? LIMIT 1", (cart,)
                ).fetchone()
            if r:
                return r["id"]
        ts = _now()
        with self._lock:
            cur = self._conn.execute(
                """INSERT INTO products
                   (name, price, commission, image_url, cart_link, source, created_ts, status)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    str(product.get("name", "") or ""),
                    str(product.get("price", "") or ""),
                    str(product.get("commission", "") or ""),
                    str(product.get("image_url", "") or ""),
                    cart,
                    str(product.get("source", "") or ""),
                    ts,
                    str(product.get("status", "") or "new"),
                ),
            )
            self._conn.commit()
            return cur.lastrowid

    def list_products(self, status: Optional[str] = None,
                      limit: int = 500, offset: int = 0) -> list:
        q = "SELECT * FROM products"
        args: list = []
        if status:
            q += " WHERE status=?"
            args.append(status)
        q += " ORDER BY created_ts DESC, id DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        with self._lock:
            rows = self._conn.execute(q, args).fetchall()
        return [dict(r) for r in rows]

    def get_product(self, product_id: int) -> Optional[dict]:
        with self._lock:
            r = self._conn.execute(
                "SELECT * FROM products WHERE id=?", (product_id,)
            ).fetchone()
        return dict(r) if r else None

    # ── queue (โครงคิวงานบน DB สำหรับอนาคต) ────────────────────

    def queue_push(self, payload: dict, priority: int = 0) -> int:
        """วางงานลงคิว (เก็บ payload เป็น JSON). คืน id ของงานในคิว."""
        with self._lock:
            cur = self._conn.execute(
                """INSERT INTO queue (payload, status, priority, created_ts)
                   VALUES (?, 'pending', ?, ?)""",
                (json.dumps(payload or {}, ensure_ascii=False), int(priority or 0), _now()),
            )
            self._conn.commit()
            return cur.lastrowid

    @staticmethod
    def _queue_row(r: Optional[sqlite3.Row]) -> Optional[dict]:
        if r is None:
            return None
        d = dict(r)
        try:
            d["payload"] = json.loads(d.get("payload") or "{}")
        except Exception:
            d["payload"] = {}
        return d

    def queue_next(self) -> Optional[dict]:
        """ดูงานถัดไปในคิว (peek) โดยไม่ claim — priority สูงก่อน แล้วเก่าก่อน."""
        with self._lock:
            r = self._conn.execute(
                """SELECT * FROM queue WHERE status='pending'
                   ORDER BY priority DESC, id ASC LIMIT 1"""
            ).fetchone()
        return self._queue_row(r)

    def queue_claim(self, worker: str = "") -> Optional[dict]:
        """คว้างานถัดไปแบบ atomic → flip เป็น claimed แล้วคืนงานนั้น (กันแย่งกัน)."""
        ts = _now()
        with self._lock:
            r = self._conn.execute(
                """SELECT id FROM queue WHERE status='pending'
                   ORDER BY priority DESC, id ASC LIMIT 1"""
            ).fetchone()
            if r is None:
                return None
            qid = r["id"]
            self._conn.execute(
                "UPDATE queue SET status='claimed', claimed_by=?, claimed_ts=? WHERE id=?",
                (worker or "", ts, qid),
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM queue WHERE id=?", (qid,)).fetchone()
        return self._queue_row(row)

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
