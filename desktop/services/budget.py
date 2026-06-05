"""
Budget / quota guard (A1.4) — stops the pipeline before it overspends.

near-zero-touch ⇒ ลูกค้าไม่เฝ้า ระบบจึงต้องคุมต้นทุน Flow/Gemini เอง:
ตั้งงบรายเดือน + ราคาต่อคลิป → ระบบประเมินก่อนสร้าง และหยุดเมื่อถึงเพดาน.

หน่วยเป็นเงิน (บาท). อ่านค่าตั้งสดทุกครั้งจาก config (สะท้อนการแก้ใน Settings).
"""
from datetime import datetime
import config as cfg


class BudgetGuard:
    def __init__(self, store):
        self.store = store

    # ── settings (อ่านสดเสมอ) ──
    def _f(self, key: str) -> float:
        try:
            return float(cfg.load().get(key, 0) or 0)
        except Exception:
            return 0.0

    def monthly_budget(self) -> float:
        return self._f("monthly_budget")        # 0 = ไม่จำกัด

    def cost_per_clip(self) -> float:
        return self._f("cost_per_clip")         # ราคา Flow ต่อคลิป (บาท)

    def gemini_cost_per_1k(self) -> float:
        return self._f("gemini_cost_per_1k")    # ราคา Gemini ต่อ 1k token (บาท)

    def gemini_cost(self, tokens: int) -> float:
        return round((tokens / 1000.0) * self.gemini_cost_per_1k(), 4)

    # ── spend (อ่านจาก usage ledger — J) ──
    @staticmethod
    def _month_start_ts() -> int:
        n = datetime.now()
        return int(datetime(n.year, n.month, 1).timestamp())

    @staticmethod
    def _day_start_ts() -> int:
        n = datetime.now()
        return int(datetime(n.year, n.month, n.day).timestamp())

    def spend_month(self) -> float:
        return self.store.usage_spend_since(self._month_start_ts()) if self.store else 0.0

    def remaining(self):
        b = self.monthly_budget()
        if b <= 0:
            return None                          # ไม่จำกัด
        return max(0.0, b - self.spend_month())

    # ── checks ──
    def can_generate(self, est: float = None) -> bool:
        """ยังสร้างคลิปต่อได้ไหม (งบพอสำหรับอีก 1 คลิป)?"""
        b = self.monthly_budget()
        if b <= 0:
            return True                          # ไม่จำกัด
        est = self.cost_per_clip() if est is None else est
        return self.spend_month() + est <= b

    def estimate(self, n: int = 1) -> float:
        return round(n * self.cost_per_clip(), 2)

    def snapshot(self) -> dict:
        """สรุปงบ AI สำหรับค็อกพิต — แยก Flow/Gemini + วันนี้/เดือนนี้ + แจ้งเตือน (J)."""
        b = self.monthly_budget()
        sp = self.spend_month()
        pct = (sp / b * 100) if b > 0 else 0
        month = self.store.usage_summary(self._month_start_ts()) if self.store else {}
        today = self.store.usage_summary(self._day_start_ts()) if self.store else {}
        return {
            "budget":        round(b, 2),
            "spent":         round(sp, 2),
            "remaining":     (None if b <= 0 else round(max(0.0, b - sp), 2)),
            "percent":       round(pct, 1),
            "cost_per_clip": round(self.cost_per_clip(), 2),
            "gemini_per_1k": round(self.gemini_cost_per_1k(), 4),
            "unlimited":     b <= 0,
            "exceeded":      (b > 0 and sp >= b),
            "alert":         ("over" if (b > 0 and pct >= 100) else
                              "warn" if (b > 0 and pct >= 80) else "ok"),
            "month":         month,   # {flow:{qty,tokens,cost}, gemini:{...}, total_cost, total_tokens}
            "today":         today,
        }
