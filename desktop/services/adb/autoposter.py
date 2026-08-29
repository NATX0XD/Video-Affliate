import time
from pathlib import Path

from services.adb.base_poster import BasePoster


class AutoPoster(BasePoster):
    """โพสต์วิดีโอขึ้น Shopee Video (luckyvideo PublishVideoActivity).

    สิ่งที่ยืนยันกับเครื่องจริงแล้ว (SM-P585Y 1200x1920 / Android 8.1):
    - dump ได้ทุกหน้ารวมทั้ง PublishVideoActivity — ยกเว้นหน้า feed Live & Video
      ที่วิดีโอเล่นตลอด (window ไม่เคย idle) → ทุกจุดจึงต้องมีพิกัดสำรอง
    - caption ไทยไม่ต้องพึ่ง ADBKeyboard: ถ้าเครื่องไม่มี ใช้ scrcpy clipboard+paste ได้
      (scrcpy INJECT_TEXT พิมพ์ไทยไม่ได้ เพราะผ่าน KeyCharacterMap)
    - แท็บ "วิดีโอ" ในคลังภาพ selected=true แต่ไม่ได้กรองรูปออกจริง

    หลักการของ flow: ทุกขั้นแตะแล้ว "ตรวจว่าหน้าเปลี่ยนจริง" (READY) ก่อนเดินต่อ
    และตรวจผลลัพธ์จาก node จริง (ลิงก์เข้าช่อง / การ์ดสินค้า / เนื้อแคปชั่น)
    ไม่ผ่าน = หยุด ไม่กดโพสต์
    """
    PACKAGE = "com.shopee.th"
    TAG = "POST"
    USE_SCRCPY = True   # จำเป็นเพื่อโฟกัสช่อง caption ของ Shopee

    # Ratio coordinates (x/W, y/H) จากเครื่องจริง 1080x2340 — sync กับ UI Shopee Video
    R = {
        "live_video_tab": (0.500, 0.932),
        "plus_button":    (0.940, 0.072),
        "gallery":        (0.798, 0.790),
        "video_filter":   (0.500, 0.135),
        "first_video":    (0.125, 0.205),
        "next_1":         (0.885, 0.906),
        "next_2":         (0.861, 0.881),
        "caption_field":  (0.444, 0.123),
        # ── เพิ่มสินค้าผ่านลิงก์ (หน้า publish + picker + กรอกลิงก์) ──
        # พิกัด toggle/ปุ่มหน้า publish วัดจากเครื่องจริง (เลย์เอาต์ 4 toggle:
        # Duet/บันทึก/ป้าย AI/แชร์ FB) — ทำ "ป้าย AI" + "เพิ่มสินค้า" ตอน caption ยังว่าง
        "add_product":    (0.756, 0.323),  # ปุ่มส้ม "แตะเพื่อเพิ่มสินค้า" (แถวบนสุด ไม่ขยับตาม toggle)
        "link_icon":      (0.927, 0.066),  # ไอคอนลิงก์มุมขวาบน (หน้า picker เลือกสินค้า)
        "link_field":     (0.500, 0.247),  # ช่อง EditText "ลิงก์สินค้า"
        "import_btn":     (0.530, 0.406),  # ปุ่ม "นำเข้า" (เปลี่ยนจาก "วางลิงก์" เมื่อมีข้อความ)
        "select_all":     (0.201, 0.869),  # "เลือกทั้งหมด" แถบล่าง
        "add_confirm":    (0.646, 0.868),  # ปุ่ม "เพิ่ม" แถบล่าง (ยืนยันเพิ่มสินค้า)
        # ── toggle หน้า publish (Duet=0.392/บันทึก=0.467 ห้ามแตะ ยกเว้น Duet ที่ต้องปิด) ──
        "duet_toggle":    (0.878, 0.392),  # "อนุญาตให้ใช้ซ้ำ/Duet" — เปิด ON เองดีฟอลต์ ต้องแตะให้ปิด
        "ai_label":       (0.878, 0.575),  # "ครีเอเตอร์เพิ่มป้ายกำกับ AI" — toggle ที่ต้องเปิด
        "caption_ok":     (0.905, 0.063),  # ปุ่ม "ตกลง" มุมขวาบน (ยืนยันแคปชั่น)
        "post_button":    (0.500, 0.900),  # ปุ่ม "โพสต์" ส้มแถบล่าง
    }

    # ── preset พิกัดที่ "วัดจากเครื่องจริงแล้ว" แยกตามความละเอียดจอ ────────
    # R ด้านบนเป็นชุด 1080x2340 ที่ยังไม่เคยรันจริงจนจบ — เครื่องไหนไม่มี preset
    # จะถูกเตือนใน log ว่าใช้พิกัดที่ยังไม่ยืนยัน (ดู _warn_unverified_preset)
    # ลำดับความสำคัญ: R ของคลาส → preset ตามความละเอียด → coords_override ต่อเครื่อง
    R_PRESETS = {
        # SM-A576B (Galaxy A57 5G, Android 16) — วัดจากภาพหน้าจอจริง 2026-08-29
        # ปุ่มโพสต์คือจุดที่พลาด: ค่า base ชี้ (540,2106) แต่ปุ่มจริงกินพื้นที่ y 2136-2264
        #   → แตะเหนือขอบปุ่ม 30px ไม่ติด แล้วจบที่ "โพสต์แล้วแต่ยืนยันผลไม่ได้" ทั้งที่ยังไม่ได้โพสต์
        # หน้า publish ของ Shopee dump ไม่ได้ (พรีวิววิดีโอเล่นตลอด window ไม่ idle)
        #   ทุกจุดบนหน้านี้จึงต้องพึ่งพิกัดล้วน — ผิดนิดเดียวคือพัง
        (1080, 2340): {
            "add_product":    (0.7417, 0.3248),
            "ai_label":       (0.8981, 0.5774),
            "post_button":    (0.5694, 0.9402),
        },
        # SM-P585Y — ยืนยันแล้วด้วย dry-run ครบ a/b/c + โพสต์จริงสำเร็จ 2026-08-22
        (1200, 1920): {
            "live_video_tab": (0.5833, 0.9802),
            "plus_button":    (0.9675, 0.0214),
            "gallery":        (0.7983, 0.8927),
            "video_filter":   (0.4992, 0.0620),
            "first_video":    (0.3742, 0.1578),
            "next_1":         (0.9325, 0.9281),
            "next_2":         (0.9350, 0.9698),
            "caption_field":  (0.5800, 0.1036),
            "add_product":    (0.8842, 0.2026),
            "link_icon":      (0.9650, 0.0359),
            "link_field":     (0.5000, 0.1531),
            "import_btn":     (0.5142, 0.2578),
            "select_all":     (0.0767, 0.9516),
            "add_confirm":    (0.5683, 0.9516),
            "duet_toggle":    (0.9508, 0.2484),
            "ai_label":       (0.9508, 0.3531),
            "caption_ok":     (0.9575, 0.0359),
            "post_button":    (0.5333, 0.9724),
        },
    }

    def _apply_resolution_preset(self):
        """ทับ R ด้วย preset ของความละเอียดนี้ (ถ้ามี) — ก่อน coords_override ต่อเครื่อง"""
        preset = self.R_PRESETS.get((self._w, self._h))
        if not preset:
            return
        merged = dict(getattr(self, "R", None) or type(self).R)
        merged.update(preset)
        self.R = merged
        self.log(f"[{self.TAG}] ใช้ preset พิกัดของจอ {self._w}x{self._h} "
                 f"({len(preset)} จุด ยืนยันกับเครื่องจริงแล้ว)")

    def _warn_unverified_preset(self):
        if (self._w, self._h) not in self.R_PRESETS:
            self.log(f"[{self.TAG}] ⚠ จอ {self._w}x{self._h} ยังไม่มี preset ที่ยืนยัน — "
                     f"พิกัดสำรองทุกจุดเป็นค่าที่ยังไม่เคยเทสต์บนเครื่องนี้ "
                     f"(node lookup ยังทำงานปกติ)")

    def _warn_locale(self, serial: str):
        """เตือนถ้าเครื่องไม่ได้ตั้งภาษาไทย — spec ที่พึ่งข้อความอาจหาไม่เจอ"""
        _, out = self.adb._adb("shell", "getprop", "persist.sys.locale", serial=serial)
        loc = (out or "").strip()
        if not loc:
            _, out = self.adb._adb("shell", "getprop", "ro.product.locale", serial=serial)
            loc = (out or "").strip()
        if loc and not loc.lower().startswith("th"):
            self.log(f"[{self.TAG}] ⚠ เครื่องตั้ง locale={loc} (ไม่ใช่ไทย) — Shopee จะโชว์ UI "
                     f"ภาษานั้น spec ที่จับจากข้อความอาจหาไม่เจอบางจุด")

    # ป้ายไทยต่อ key — ให้ API/หน้า calibrate โชว์ชื่อจุดที่เข้าใจง่าย (ลำดับ = ลำดับ flow)
    LABELS = {
        "live_video_tab": "แท็บ Live & Video",
        "plus_button":    "ปุ่ม + สร้างวิดีโอ",
        "gallery":        "เปิดแกลเลอรี",
        "video_filter":   "กรองเฉพาะวิดีโอ",
        "first_video":    "เลือกวิดีโออันล่าสุด",
        "next_1":         "ปุ่มถัดไป (1)",
        "next_2":         "ปุ่มถัดไป (2)",
        "caption_field":  "ช่องแคปชั่น",
        "add_product":    "เพิ่มสินค้า (ปุ่มส้ม)",
        "link_icon":      "ไอคอนลิงก์ (มุมขวาบน)",
        "link_field":     "ช่องวางลิงก์สินค้า",
        "import_btn":     "ปุ่มนำเข้า",
        "select_all":     "เลือกทั้งหมด",
        "add_confirm":    "ปุ่มเพิ่ม (ยืนยันสินค้า)",
        "duet_toggle":    "สลับ Duet (ปิด)",
        "ai_label":       "ป้าย AI (เปิด)",
        "caption_ok":     "ปุ่มตกลง แคปชั่น",
        "post_button":    "ปุ่มโพสต์",
    }

    # ── หา element จริงก่อน แล้วค่อย fallback เป็นพิกัด ──────────
    # พิกัดอย่างเดียวพังง่าย: ปุ่ม + อยู่ [1143,23][1179,59] แต่ ratio ชี้ y=61 → พลาดไป 2px
    # และแท็บ "วิดีโอ" อยู่ x=599 แต่ ratio ชี้ x=574 → ไปโดนแท็บ "ทั้งหมด"
    # ข้อความ UI ต่อภาษา — Shopee เปลี่ยนตาม locale ของเครื่อง ไม่ใช่ตาม package
    # ใส่เฉพาะคำอังกฤษที่มั่นใจ (ปุ่มมาตรฐาน) ไม่เดาคำที่ไม่รู้จริง
    T_NEXT     = ("ถัดไป", "Next")
    T_GALLERY  = ("คลังภาพ", "Gallery", "Album")
    T_OK       = ("ตกลง", "เสร็จสิ้น", "OK", "Done")
    T_IMPORT   = ("นำเข้า", "Import")
    T_SELECTALL= ("เลือกทั้งหมด", "Select all", "Select All")
    T_ADD      = ("เพิ่ม", "Add")
    T_POST     = ("โพสต์", "Post")
    T_ADDPROD  = ("เพิ่มสินค้า", "Add product", "Add Product")

    NODE_SPECS = {
        # ปุ่มแท็บล่างเก็บชื่อไว้ใน content-desc ของไอคอน (resource-id เป็นแค่ "icon")
        # และ text ของป้ายคือ "Live &amp; Video" — ต้องพึ่ง unescape ใน ui_finder
        "live_video_tab": lambda n, UF: UF.tappable(n, UF.find(n, desc="tab_bar_button_video_and_live")
                                                    or UF.find(n, text_contains="Live & Video")),
        "plus_button":    lambda n, UF: UF.find(n, desc_contains="create icon"),
        "gallery":        lambda n, UF: UF.tappable(n, UF.find(n, rid="ll_gallery_entrance")
                                                    or UF.find_text(n, *AutoPoster.T_GALLERY)),
        # ต้องเป็นแท็บของคลังภาพเท่านั้น (หน้า feed มีแท็บชื่อ "วิดีโอ" ด้วย)
        "video_filter":   lambda n, UF: UF.tappable(n, UF.gallery_tab(n)),
        "first_video":    lambda n, UF: UF.first_video_cell(n),
        # หน้า preview ใช้ text ล้วน / หน้า editor ใช้ tv_compress
        "next_1":         lambda n, UF: UF.tappable(n, UF.find_text(n, *AutoPoster.T_NEXT)),
        "next_2":         lambda n, UF: UF.tappable(n, UF.find(n, rid="tv_compress")
                                                    or UF.find_text(n, *AutoPoster.T_NEXT)),
        "caption_field":  lambda n, UF: UF.tappable(n, UF.find(n, rid="et_caption")
                                                    or UF.find(n, rid="rl_caption_container")),
        "caption_ok":     lambda n, UF: UF.tappable(n, UF.find(n, rid="tv_right")
                                                    or UF.find_text(n, *AutoPoster.T_OK)),
        "add_product":    lambda n, UF: UF.tappable(n, UF.find(n, rid="ll_add_product_symbol")
                                                    or UF.find(n, rid="tv_add_product_tip")),
        # toggle 2 ตัวนี้รายงาน clickable=false แต่แตะที่พิกัดกลางติดจริง
        "ai_label":       lambda n, UF: UF.find(n, rid="ai_generated_toggle"),
        "duet_toggle":    lambda n, UF: UF.find(n, rid="allow_reuse_toggle") or UF.row_toggle(n, "ใช้ซ้ำ"),
        # ไอคอนลิงก์มุมขวาบนของหน้า picker — ไม่มี id/desc/text อะไรเลย
        # จับจาก "ImageView ขวาสุดในแถวหัวข้อ เพิ่มสินค้า"
        "link_icon":      lambda n, UF: next((ic for t in AutoPoster.T_ADDPROD
                                              if (ic := UF.header_icon(n, t))), None),
        # ต้องอยู่หน้ากรอกลิงก์จริงเท่านั้น — หน้า picker ก็มี EditText (ช่อง "ค้นหาสินค้า")
        # ถ้าไม่กันไว้จะพิมพ์ลิงก์ลงช่องค้นหาแล้วนึกว่าสำเร็จ
        "link_field":     lambda n, UF: (UF.find(n, cls="EditText")
                                         if AutoPoster._on_link_page(n, UF) else None),
        "import_btn":     lambda n, UF: UF.tappable(n, UF.find_text(n, *AutoPoster.T_IMPORT)),
        "select_all":     lambda n, UF: UF.tappable(n, UF.find_text(n, *AutoPoster.T_SELECTALL,
                                                                   exact=False)),
        # ปุ่มยืนยันมักเป็น "เพิ่ม (1)" → ต้อง contains ไม่ใช่ exact และต้องอยู่แถบล่าง
        "add_confirm":    lambda n, UF: UF.tappable(n, UF.find_text(n, *AutoPoster.T_ADD,
                                                                    exact=False,
                                                                    min_y=UF.frac_y(n, 0.75))),
        "post_button":    lambda n, UF: UF.tappable(n, UF.find(n, rid="btn_post")
                                                    or UF.find_text(n, *AutoPoster.T_POST)),
    }

    # ── เงื่อนไข "ถึงหน้าถัดไปแล้วจริง" ต่อขั้นตอน ───────────────
    # (nodes, activity, ui_finder) -> bool   ใช้กันเคสแตะไม่ติดแล้ว flow เดินต่อทั้งที่ยังหน้าเดิม
    READY = {
        "live_video_tab": lambda n, act, UF: UF.find(n, desc_contains="create icon") is not None,
        "plus_button":    lambda n, act, UF: UF.find(n, rid="ll_gallery_entrance") is not None,
        "gallery":        lambda n, act, UF: (UF.find(n, rid="tabs_gallery") is not None
                                              or UF.find(n, rid="rv_gallery") is not None),
        "video_filter":   lambda n, act, UF: getattr(UF.gallery_tab(n), "selected", False),
        "first_video":    lambda n, act, UF: ("Preview" in act
                                              or UF.find(n, rid="tv_compress") is not None),
        "next_1":         lambda n, act, UF: (UF.find(n, rid="tv_compress") is not None
                                              or act.endswith("PublishVideoActivity")),
        "next_2":         lambda n, act, UF: act.endswith("PublishVideoActivity"),
        # หัวข้อ "เพิ่มสินค้า" ของหน้า picker — ใช้สัดส่วนจอ ไม่ใช่ 200px ตายตัว
        # (จอที่ status bar สูงกว่าจะดันหัวข้อเลย 200 แล้ว READY ไม่ผ่านตลอด)
        "add_product":    lambda n, act, UF: (UF.find_text(n, *AutoPoster.T_ADDPROD,
                                                           max_y=UF.frac_y(n, 0.15)) is not None
                                              and not act.endswith("PublishVideoActivity")),
        # ต้องเห็นหน้ากรอกลิงก์จริง ๆ (หน้า picker ก็มี EditText ของช่องค้นหา)
        "link_icon":      lambda n, act, UF: AutoPoster._on_link_page(n, UF),
    }

    LINK_PAGE_TITLE = ("กรอกลิงก์สินค้า", "Enter product link", "Product link")

    @staticmethod
    def _on_link_page(nodes, UF) -> bool:
        """อยู่หน้า "กรอกลิงก์สินค้า" หรือยัง

        เครื่องภาษาอังกฤษอาจไม่ตรงข้อความที่รู้จัก → มีทางสำรองเชิงโครงสร้าง:
        หน้านี้มี EditText 1 ใบ + ปุ่ม "นำเข้า/Import" อยู่ด้วยกัน ซึ่งหน้า picker ไม่มี
        """
        if any(UF.find(nodes, text_contains=t) for t in AutoPoster.LINK_PAGE_TITLE):
            return True
        return (UF.find(nodes, cls="EditText") is not None
                and UF.find_text(nodes, *AutoPoster.T_IMPORT) is not None)

    def _tap_r(self, serial: str, key: str, settle: float = 2.0):
        if self._tap_by_node(serial, key, settle):
            return
        rx, ry = self.R[key]
        self._tap_ratio(serial, rx, ry, name=f"{key} [พิกัดสำรอง]", settle=settle)

    def _tap_by_node(self, serial: str, key: str, settle: float) -> bool:
        spec = self.NODE_SPECS.get(key)
        if not spec:
            return False
        from services.adb import ui_finder as UF
        errs = []

        def probe(ns):
            try:
                return spec(ns, UF)
            except Exception as e:
                errs.append(e)
                return None

        # รอ node โผล่จริงก่อน (มี timeout) แทนการ dump ครั้งเดียวแล้วยอมแพ้ —
        # หน้าถัดไปของ Shopee บนแท็บเล็ตโผล่ช้าไม่เท่ากันทุกรอบ
        nodes, node = UF.wait_for(serial, probe, timeout=6.0, log=self.log, tag=key)
        if not node:
            # แยกสาเหตุให้เห็น — เดิมเงียบสนิทแล้วตกไปแตะพิกัดเดิม ทั้งที่ log ดูเหมือนโหมด node ทำงานอยู่
            if errs:
                self.log(f"[{self.TAG}] {key}: spec error "
                         f"({type(errs[-1]).__name__}: {errs[-1]}) → ใช้พิกัดสำรอง")
            elif not nodes:
                self.log(f"[{self.TAG}] {key}: dump หน้าจอไม่ได้ → ใช้พิกัดสำรอง")
            else:
                self.log(f"[{self.TAG}] {key}: หา node ไม่เจอในหน้าปัจจุบัน → ใช้พิกัดสำรอง")
            return False          # หน้าที่วิดีโอเล่นตลอด dump ไม่ได้ → ใช้พิกัดแทน
        x, y = node.center
        self.log(f"[{self.TAG}] tap {key} → ({x},{y}) [จับจากหน้าจอจริง]")
        self._remember(key, x, y)      # จำไว้เป็นพิกัดสำรองของเครื่องนี้รอบหน้า
        self._tap_xy(serial, x, y)
        time.sleep(settle)
        return True

    # ── ขั้นตอนแบบตรวจผลจริง ───────────────────────────────────

    # เพดานเวลารวมต่อ 1 โพสต์ — กรณีแย่สุดของ retry ทุกขั้นบวกกันได้ ~900 วิ
    # ถ้าไม่มีเพดาน คิวถัดไปของ autopilot ค้างตามไปด้วย
    POST_TIMEOUT_SEC = 600

    def _overtime(self, step: str) -> bool:
        """เกินเพดานเวลารวมหรือยัง — เกินแล้วเลิกอย่างสุภาพพร้อมบอกว่าค้างขั้นไหน"""
        dl = getattr(self, "_deadline", None)
        if dl is None or time.time() <= dl:
            return False
        limit = self.settings.get("post_timeout_sec", self.POST_TIMEOUT_SEC)
        self.log(f"[{self.TAG}] ⏱ เกินเพดานเวลารวม {limit} วิ — เลิกที่ขั้น '{step}' "
                 f"(ไม่กดโพสต์)")
        return True

    def _ready(self, serial: str, key: str, timeout: float, quiet: bool = False) -> bool:
        """จริงเมื่อหน้าหลังแตะ key พร้อมแล้ว (ไม่มีเงื่อนไข = ถือว่าผ่าน)

        ตั้ง self._ready_blind = True เมื่อ "ตอบไม่ได้" (อ่านหน้าจอไม่ได้เลยสักรอบ
        และเงื่อนไขข้อนี้ต้องใช้ node) — ต่างจาก "ตอบว่ายังไม่พร้อม" ซึ่งเชื่อถือได้
        """
        self._ready_blind = False
        pred = self.READY.get(key)
        if pred is None:
            return True
        from services.adb import ui_finder as UF
        end = time.time() + timeout
        act = ""
        saw_nodes = False
        while True:
            nodes = UF.dump_nodes(serial, self.log, tries=1, tag=f"{key}_check")
            act = self._current_activity(serial)
            saw_nodes = saw_nodes or bool(nodes)
            # ★ ตรวจแม้ dump ไม่ได้ — เงื่อนไขหลายข้อดูแค่ "ชื่อหน้า" ไม่ได้ใช้ node เลย
            #   หน้า publish เล่นพรีวิววิดีโอตลอด window ไม่เคย idle → uiautomator dump ล้มประจำ
            #   เดิมข้ามการตรวจทั้งก้อนเมื่อ dump ไม่ได้ เลยฟ้อง "next_2 ล้มเหลว" ทั้งที่อยู่หน้าถูกแล้ว
            #   ส่งลิสต์ว่างเข้าไปปลอดภัย: เงื่อนไขที่ต้องใช้ node จะได้ False เองอยู่แล้ว
            try:
                if pred(nodes or [], act, UF):
                    if not nodes:
                        self.log(f"[{self.TAG}] {key}: อ่านหน้าจอไม่ได้ แต่ชื่อหน้าตรงแล้ว → ผ่าน")
                    return True
            except Exception:
                pass
            if time.time() >= end:
                # อ่านหน้าจอไม่ได้เลยสักรอบ = "ไม่รู้" ไม่ใช่ "ไม่พร้อม"
                # หน้าฟีดวิดีโอของ Shopee dump ไม่ผ่านแทบทุกครั้ง ถ้าถือว่าล้มจะตัดจบทั้งงาน
                self._ready_blind = not saw_nodes
                if not quiet:      # quiet = แค่ "ถามว่าข้ามได้ไหม" ไม่ใช่ความล้มเหลว
                    self.log(f"[{self.TAG}] ยังไม่ถึงหน้าหลัง {key} "
                             f"(หน้าปัจจุบัน: {act.split('/')[-1] or '?'})"
                             + (" — อ่านหน้าจอไม่ได้เลย จึงยังสรุปไม่ได้" if self._ready_blind else ""))
                return False
            time.sleep(0.8)

    def _step(self, serial: str, key: str, tries: int = 3, settle: float = 2.0,
              timeout: float = 12.0, skip_if_ready: bool = False) -> bool:
        """แตะ key แล้ว *ตรวจว่าหน้าเปลี่ยนจริง* — ไม่เปลี่ยนก็แตะซ้ำ ไม่ใช่เดินต่อ

        การแตะแล้วเชื่อว่าติดคือสาเหตุที่ flow เคยหลง: กด "คลังภาพ" ไม่ติด แล้วขั้นถัดไป
        ไปกดแท็บ "วิดีโอ" ของหน้า feed ต่อ จนจบที่ ReactTransparentActivity
        """
        if skip_if_ready and self._ready(serial, key, timeout=0, quiet=True):
            self.log(f"[{self.TAG}] {key}: อยู่ในสถานะที่ต้องการแล้ว — ข้าม")
            return True
        before = self._current_activity(serial)
        for i in range(1, tries + 1):
            self._tap_r(serial, key, settle=settle)
            if self._ready(serial, key, timeout):
                return True
            # หน้าเปลี่ยนไปแล้วแต่ READY ยังไม่ผ่าน = อย่าแตะซ้ำ ให้รออย่างเดียว
            # (แตะซ้ำบนหน้าใหม่คือแตะมั่ว — เช่นแตะช่องในกริดรอบสองจะ "ยกเลิกการเลือก")
            now = self._current_activity(serial)
            if now != before:
                self.log(f"[{self.TAG}] {key}: หน้าเปลี่ยนเป็น {now.split('/')[-1]} แล้ว "
                         f"แต่ยังไม่พร้อม — รอต่อ ไม่แตะซ้ำ")
                if self._ready(serial, key, timeout):
                    return True
                break
            self.log(f"[{self.TAG}] แตะ {key} ไม่ติด (รอบ {i}/{tries}) — ลองใหม่")
        # ★ "อ่านหน้าจอไม่ได้เลย" ไม่เท่ากับ "แตะไม่ติด"
        #   หน้าฟีดวิดีโอของ Shopee dump ไม่ผ่านแทบทุกครั้ง (window ไม่เคย idle)
        #   เงื่อนไขที่ต้องใช้ node จึงไม่มีวันผ่าน แล้วตัดจบทั้งงานทั้งที่แตะติดจริง
        #   ไปต่อดีกว่า — ขั้นถัดไปมีตัวตรวจของตัวเอง ถ้าหลงจริงมันจะฟ้องทันที
        if getattr(self, "_ready_blind", False):
            self.log(f"[{self.TAG}] ⚠ {key}: อ่านหน้าจอไม่ได้เลย สรุปไม่ได้ว่าแตะติดไหม — "
                     f"ไปต่อ แล้วให้ขั้นถัดไปเป็นตัวตัดสิน")
            return True
        self.log(f"[{self.TAG}] ⚠ {key} ล้มเหลวหลังลอง {tries} รอบ")
        return False

    PLACEHOLDER_CAPTION = "เพิ่มแคปชั่นในวิดีโอของคุณ"
    CAPTION_MAX = 150          # Shopee ตัดแคปชั่นที่ 150 ตัวอักษร (ตัวนับ "x/150")

    def _caption_text(self, serial: str):
        """ข้อความในช่องแคปชั่นตอนนี้ ("" ถ้าว่าง, None ถ้าอ่านไม่ได้)"""
        from services.adb import ui_finder as UF
        nodes = UF.dump_nodes(serial, self.log, tries=2, tag="caption_read")
        if not nodes:
            return None
        cap = UF.find(nodes, rid="et_caption")
        if cap is None:
            return None
        cur = (cap.text or "").strip()
        return "" if cur == self.PLACEHOLDER_CAPTION else cur

    def _clear_caption(self, serial: str):
        """ล้างช่องแคปชั่นก่อนพิมพ์ — ไม่งั้นรอบแก้ตัวจะ "ต่อท้าย" ของเดิม
        (เจอจริง: paste รอบแรกได้ clipboard เก่าของเครื่อง แล้วรอบสองไปต่อท้ายมัน)"""
        cur = self._caption_text(serial)
        if not cur:
            return
        self.log(f"[{self.TAG}] ล้างแคปชั่นเดิม {len(cur)} ตัวอักษรก่อนพิมพ์ใหม่")
        # SDK 27 ไม่มี `input keycombination` → ไปท้ายข้อความแล้ว backspace ทีละตัว
        self.adb._adb("shell", "input", "keyevent", "123", serial=serial)   # MOVE_END
        dels = " ".join(["67"] * min(len(cur) + 5, 200))                    # DEL
        self.adb._adb("shell", "input", "keyevent", dels, serial=serial, timeout=60)
        time.sleep(0.5)

    # ปุ่ม "แตะเพื่อเพิ่มสินค้า" เป็นเม็ดยาสีส้มแบรนด์ Shopee — หาได้จากภาพหน้าจอตรง ๆ
    # โซนที่มันอยู่: ครึ่งบนของหน้า publish (ใต้แถบชื่อ เหนือแถว toggle)
    ADDPROD_BAND = (0.22, 0.48)      # ช่วง y (สัดส่วนจอ) ที่ยอมให้เจอเม็ดยา
    ADDPROD_MIN_W = 0.15             # กว้างอย่างน้อย 15% ของจอ ถึงจะนับว่าเป็นปุ่ม ไม่ใช่ไอคอน

    def _screen_has_add_product(self, serial: str) -> bool:
        """หาแถบสีส้มของปุ่ม "แตะเพื่อเพิ่มสินค้า" จากภาพหน้าจอ

        ★ ต้องมีเพราะหน้า publish dump ไม่ได้ (พรีวิววิดีโอเล่นตลอด window ไม่ idle)
        ถ้าเชื่อ dump อย่างเดียวจะสรุปว่า "ไม่มีแผงเพิ่มสินค้า" ทุกครั้ง แล้วข้ามการใส่ลิงก์
        → คลิปขึ้นโดยไม่มีการ์ดสินค้า คนดูกดซื้อไม่ได้ และไม่ได้ค่านายหน้า
        ภาพหน้าจอไม่สนใจ idle state จึงใช้ได้บนหน้านี้
        """
        import subprocess
        from services.adb.adb_path import adb_bin
        # เช็คเฉพาะตอนอยู่หน้า publish จริง — หน้าฟีดมีปุ่ม "ซื้อเลย" สีส้มเหมือนกัน
        act = self._current_activity(serial)
        if "PublishVideoActivity" not in act:
            return False
        try:
            r = subprocess.run([adb_bin(self.log), "-s", serial, "exec-out", "screencap", "-p"],
                               capture_output=True, timeout=25)
            if not r.stdout:
                return False
            from io import BytesIO
            from PIL import Image
            im = Image.open(BytesIO(r.stdout)).convert("RGB")
            W, H = im.size
            px = im.load()
            y0, y1 = int(H * self.ADDPROD_BAND[0]), int(H * self.ADDPROD_BAND[1])
            need = int(W * self.ADDPROD_MIN_W)
            for y in range(y0, y1, 4):                     # สุ่มทีละ 4 แถวพอ — เม็ดยาสูงหลายสิบ px
                # วัด "ระยะจากส้มซ้ายสุดถึงส้มขวาสุด" ไม่ใช่ช่วงส้มติดกัน
                # ตัวปุ่มมีตัวอักษรขาวคั่นกลาง ถ้านับแบบติดกันจะไม่มีวันถึงเกณฑ์
                xs = [x for x in range(0, W, 4)
                      if px[x, y][0] > 200 and 60 < px[x, y][1] < 130 and px[x, y][2] < 90]
                if xs and (xs[-1] - xs[0]) >= need:
                    return True
        except Exception as e:
            self.log(f"[{self.TAG}] ดูภาพหน้าจอหาแผงเพิ่มสินค้าไม่ได้: {str(e)[:80]}")
        return False

    def _wait_add_product_panel(self, serial: str, timeout: float = 20.0) -> bool:
        """แผง "เพิ่มสินค้า" ของหน้า publish โหลดแยกทีหลัง (ดึงสิทธิ์ affiliate จากเซิร์ฟเวอร์)
        ถ้าไม่รอ แล้วแตะพิกัดตอนแผงยังไม่ขึ้น เลย์เอาต์จะเลื่อนทั้งหน้า (ต่างกัน 226px)"""
        from services.adb import ui_finder as UF
        _, node = UF.wait_for(
            serial,
            lambda ns: (UF.find(ns, rid="ll_add_product_symbol")
                        or UF.find(ns, rid="add_product_panel_view")
                        or UF.find(ns, text_contains="แตะเพื่อเพิ่มสินค้า")),
            timeout=timeout, log=self.log, tag="add_product_panel")
        if node:
            self.log(f"[{self.TAG}] แผงเพิ่มสินค้าพร้อมแล้ว")
            return True
        # อ่าน node ไม่ได้ ≠ ไม่มีแผง — ดูจากภาพหน้าจอก่อนตัดสิน (นี่คือทางที่ได้ค่านายหน้า)
        if self._screen_has_add_product(serial):
            self.log(f"[{self.TAG}] แผงเพิ่มสินค้าพร้อมแล้ว (เห็นจากภาพหน้าจอ — อ่าน node ไม่ได้)")
            return True
        self.log(f"[{self.TAG}] ⚠ แผง 'เพิ่มสินค้า' ไม่ขึ้นใน {timeout:.0f} วิ "
                 f"(ทั้งอ่าน node และดูภาพหน้าจอแล้วไม่เจอปุ่มส้ม — Shopee ยังไม่ปล่อยสิทธิ์ให้คลิปนี้)")
        return False

    def _caption_landed(self, serial: str, expect: str = ""):
        """แคปชั่นเข้าช่องจริงไหม — อ่าน node กลับมาดูข้อความจริง ไม่ใช่เชื่อว่าพิมพ์ไปแล้ว

        คืน 3 สถานะ:  True = เข้าแล้วตรง · False = ไม่เข้า/ไม่ตรง · None = ตรวจไม่ได้
        ห้ามคืน True ตอนตรวจไม่ได้ — เครื่องที่ dump หน้า publish ไม่ผ่านจะกลายเป็น
        "ผ่านทุกครั้ง" แล้วโพสต์แคปชั่นว่างออกไปพร้อมรายงานว่าสำเร็จ
        """
        from services.adb import ui_finder as UF
        nodes = UF.dump_nodes(serial, self.log, tries=2, tag="caption_typed")
        if not nodes:
            self.log(f"[{self.TAG}] ⚠ ตรวจแคปชั่นไม่ได้ (dump ไม่ผ่าน)")
            return None          # อ่านไม่ได้ ≠ ผ่าน

        cap = UF.find(nodes, rid="et_caption")
        num = UF.find(nodes, rid="tv_content_num")
        if cap is None and num is None:
            self.log(f"[{self.TAG}] ⚠ ตรวจแคปชั่นไม่ได้ (ไม่เจอช่องแคปชั่นในหน้านี้)")
            return None
        got = (cap.text or "").strip() if cap else ""
        empty = (not got) or got == self.PLACEHOLDER_CAPTION
        if num is not None and num.text.strip().startswith("0/"):
            empty = True

        if empty:
            self.log(f"[{self.TAG}] ✗ ช่องแคปชั่นยังว่าง (นับได้ {num.text if num else '?'})")
            return False

        # ข้อความที่ต้องการมีไทย แต่ที่เข้าไปไม่มีเลย = โดน input text ตัดทิ้ง
        if expect and any("฀" <= c <= "๿" for c in expect) \
                and not any("฀" <= c <= "๿" for c in got):
            self.log(f"[{self.TAG}] ✗ แคปชั่นไม่มีตัวอักษรไทย (ได้: {got[:40]!r})")
            return False

        # ต้องตรงกับที่สั่งพิมพ์ ไม่ใช่แค่ "มีตัวอักษรอยู่" — เคยได้ clipboard เก่าของเครื่อง
        # มาแปะหน้าข้อความจริง แล้วโพสต์ออกไปพร้อมลิงก์ของคนอื่น
        # เทียบแบบ prefix เพราะ Shopee ตัดที่ 150 ตัว — ปิดการเทียบไปเลยตอนข้อความยาว
        # จะเปิดช่องให้คลิปบอร์ดค้างจากโพสต์ก่อน (ไทย ไม่ว่าง) ผ่านฉลุย
        if expect:
            norm = lambda s: " ".join(s.split())
            g, e = norm(got), norm(expect)
            need = int(min(len(e), self.CAPTION_MAX) * 0.9)
            if not e.startswith(g) or len(g) < need:
                self.log(f"[{self.TAG}] ✗ แคปชั่นไม่ตรงกับที่สั่งพิมพ์ "
                         f"({len(g)}/{need} ตัวแรกที่ต้องตรง) ได้: {g[:60]!r}")
                return False

        self.log(f"[{self.TAG}] ✓ แคปชั่นเข้าช่องแล้ว ({num.text if num else '?'}): {got[:60]!r}")
        return True

    def _caption_without_link(self, caption: str) -> str:
        """Shopee แนบลิงก์ผ่านการ์ดสินค้าแล้ว → ตัดลิงก์ออกจาก caption ไม่ให้ซ้ำ/รก."""
        link = self._affiliate_link()
        if not link:
            return caption
        c = caption.replace("#" + link, "").replace(link, "")
        return " ".join(c.split()).strip()

    def _affiliate_link(self) -> str:
        """ลิงก์ตะกร้า/สินค้าสำหรับแนบในโพสต์ (จากข้อมูลสินค้า)."""
        p = getattr(self, "_product", {}) or {}
        links = p.get("links", {}) or {}
        return (links.get("affiliate_link") or links.get("product_url")
                or p.get("link") or p.get("cart_link") or "").strip()

    # ── หน้า "กรอกลิงก์สินค้า" (ReactActivity — ไม่มี resource-id ใช้ text/class แทน) ──

    T_CLEARALL  = ("ลบทั้งหมด", "Clear all", "Delete all")
    T_NOPRODUCT = ("ไม่มีสินค้า", "No products", "No product")
    T_PRODLIST  = ("รายการสินค้า", "Product list", "Products")

    def _link_box(self, serial: str, tag="link_box"):
        """(nodes, ช่อง EditText ของลิงก์) — คืน None ถ้าไม่ได้อยู่หน้า "กรอกลิงก์สินค้า"

        กันเคสที่เจอจริง: ยังอยู่หน้า picker (มีช่อง "ค้นหาสินค้า" ที่เป็น EditText เหมือนกัน)
        แล้วพิมพ์ลิงก์ลงช่องค้นหา — ตรวจว่า "เข้าช่องแล้ว" ผ่านหมด แต่สินค้าไม่เคยถูกนำเข้า
        """
        from services.adb import ui_finder as UF
        nodes = UF.dump_nodes(serial, self.log, tries=2, tag=tag)
        if not nodes or not self._on_link_page(nodes, UF):
            return nodes, None
        return nodes, UF.find(nodes, cls="EditText")

    def _fill_product_link(self, serial: str, link: str, has_adbkb: bool) -> bool:
        from services.adb import ui_finder as UF
        for attempt in range(1, 3):
            nodes, box = self._link_box(serial)
            if box is None:
                self.log("[POST] ⚠ ไม่พบช่องกรอกลิงก์สินค้า")
                return False

            # ล้างของเดิมด้วยปุ่ม "ลบทั้งหมด" ของ Shopee (ชัวร์กว่ากด backspace รัว)
            if (box.text or "").strip():
                clear = UF.tappable(nodes, UF.find_text(nodes, *self.T_CLEARALL))
                if clear:
                    self.log(f"[POST] ล้างลิงก์เดิมในช่อง ({len(box.text)} ตัวอักษร)")
                    self._tap_xy(serial, *clear.center)
                    time.sleep(1.0)

            self._tap_xy(serial, *box.center)
            time.sleep(0.8)
            self._type_caption(serial, link, has_adbkb, avoid_clipboard=(attempt > 1))
            time.sleep(1.5)

            _, box2 = self._link_box(serial, tag="link_box_check")
            got = (box2.text or "").strip() if box2 else ""
            if got == link:
                self.log(f"[POST] ✓ ลิงก์เข้าช่องถูกต้อง: {got}")
                return True
            self.log(f"[POST] ✗ ลิงก์ในช่องไม่ตรง (รอบ {attempt}/2) — ได้ {got[:70]!r}")
        return False

    def _wait_product_list(self, serial: str, timeout: float = 20.0) -> bool:
        """รอจน "รายการสินค้า" มีของจริง — ข้อความ "ไม่มีสินค้า" ต้องหายไป"""
        from services.adb import ui_finder as UF
        _, ok = UF.wait_for(
            serial,
            lambda ns: (UF.find_text(ns, *self.T_NOPRODUCT) is None
                        and UF.find_text(ns, *self.T_PRODLIST) is not None),
            timeout=timeout, log=self.log, tag="product_list")
        if ok:
            self.log("[POST] ✓ นำเข้าสินค้าเข้ารายการแล้ว")
        return bool(ok)

    def _product_card_shown(self, serial: str) -> bool:
        """หน้า publish มีการ์ดสินค้าจริงไหม (ไม่ใช่แค่ปุ่ม 'แตะเพื่อเพิ่มสินค้า' เปล่า ๆ)"""
        from services.adb import ui_finder as UF
        nodes = UF.dump_nodes(serial, self.log, tries=2, tag="product_card")
        if not nodes:
            return False
        title = UF.find(nodes, rid="tv_product_title")
        if title is None:
            self.log("[POST] ⚠ กลับหน้าโพสต์แล้วแต่ยังไม่เห็นการ์ดสินค้า")
            return False
        self.log(f"[POST] ✓ การ์ดสินค้าขึ้นแล้ว: {title.text[:50]!r}")
        return True

    def _add_product_by_link(self, serial, has_adbkb, has_panel: bool = True) -> bool:
        """เพิ่มสินค้าเข้าโพสต์ผ่านลิงก์ Shopee (โชว์ในวิดีโอ). คืน True ถ้าเพิ่มสำเร็จ."""
        link = self._affiliate_link()
        if not link:
            self.log("[POST] ไม่มีลิงก์สินค้า — ข้ามการเพิ่มสินค้า")
            return False
        if not has_panel:
            # แผงไม่ขึ้น = ไม่มีปุ่มให้กด ถ้าดันแตะพิกัดสำรองต่อ จะเป็นการแตะมั่วบน
            # เลย์เอาต์ที่เลื่อนขึ้น 226px (จุดนั้นอยู่ติดแถว toggle Duet) เสียเวลา 3 รอบฟรี ๆ
            self.log("[POST] ⚠ ไม่มีแผงเพิ่มสินค้าบนหน้านี้ — ข้ามการเพิ่มสินค้า (ไม่แตะมั่ว)")
            return False

        self.log(f"[POST] เพิ่มสินค้าผ่านลิงก์: {link}")
        # หน้า publish → เปิด picker เลือกสินค้า (ตรวจว่าออกจากหน้า publish จริง)
        if not self._step(serial, "add_product", settle=2.5, timeout=12):
            self.log("[POST] ⚠ เปิดหน้าเลือกสินค้าไม่ได้ — ข้ามการเพิ่มสินค้า")
            return False

        # picker → ไอคอนลิงก์มุมขวาบน → หน้า "กรอกลิงก์สินค้า"
        if not self._step(serial, "link_icon", settle=2.0, timeout=12):
            return False

        # แตะช่องกรอก แล้วพิมพ์ลิงก์ให้ "ตรงเป๊ะ" — หน้านี้ชอบมีข้อความค้างจากคลิปบอร์ดเก่า
        # ถ้าลิงก์เพี้ยนแม้แต่ตัวเดียว "นำเข้า" จะ resolve ไม่เจอสินค้า แล้วรายการว่าง
        if not self._fill_product_link(serial, link, has_adbkb):
            return False

        # "นำเข้า" → resolve สินค้าเข้า "รายการสินค้า"
        self._tap_r(serial, "import_btn", settle=4.0)
        if not self._wait_product_list(serial, timeout=20):
            # Shopee ล้างช่องทิ้งเมื่อลิงก์ใช้ไม่ได้ — บอกสาเหตุที่เป็นไปได้ ไม่ใช่แค่ "ว่าง"
            self.log("[POST] ⚠ นำเข้าลิงก์แล้วแต่ 'รายการสินค้า' ยังว่าง — "
                     "Shopee ไม่รับลิงก์นี้ (ต้องเป็นลิงก์สินค้า Shopee ที่ยังขายอยู่ "
                     "และเป็นลิงก์ affiliate ของบัญชีที่ล็อกอินอยู่)")
            return False

        # เลือกทั้งหมด → เพิ่ม
        self._tap_r(serial, "select_all", settle=1.2)
        self._tap_r(serial, "add_confirm", settle=3.5)

        # ยืนยันว่ากลับถึงหน้า publish จริง — ถ้าไม่กลับแล้วเดินต่อ ขั้น caption จะไปพิมพ์
        # ทับช่องของหน้าที่ค้างอยู่ (เจอจริง: ลิงก์+แคปชั่นต่อกันอยู่ในช่องกรอกลิงก์)
        for _ in range(6):
            act = self._current_activity(serial)
            if act.endswith("PublishVideoActivity"):
                self.log("[POST] เพิ่มสินค้าสำเร็จ — กลับหน้าโพสต์ ✓")
                return self._product_card_shown(serial)
            time.sleep(1.5)
        self.log("[POST] ⚠ หลังเพิ่มสินค้าไม่กลับหน้าโพสต์ (flow อาจคลาด)")
        return False

    def _run_flow(self, serial, video_path, caption, has_adbkb, dry_run=False) -> bool:
        limit = self.settings.get("post_timeout_sec", self.POST_TIMEOUT_SEC)
        self._deadline = time.time() + limit
        self._caption_unverified = False
        self._warn_unverified_preset()
        self._warn_locale(serial)

        # 1. เปิด Shopee สะอาด ๆ
        self._open_app(serial, wait=6)

        # 2. แท็บ Live & Video (แตะแล้วรอหน้าโหลดก่อนกดต่อ — tablet เปลี่ยนหน้าช้า)
        self.log("[POST] เปิดแท็บ Live & Video...")
        if not self._step(serial, "live_video_tab", settle=3, timeout=15):
            return False

        # 3. กด + สร้าง
        self.log("[POST] กด + สร้างวิดีโอ...")
        if self._overtime("plus_button") or \
                not self._step(serial, "plus_button", settle=3, timeout=15):
            return False

        # 4. เปิดคลังภาพ
        self.log("[POST] เปิดคลังภาพ...")
        if self._overtime("gallery") or \
                not self._step(serial, "gallery", settle=2.5, timeout=15):
            return False

        # 5. กรองวิดีโอ (ไม่ critical — แท็บนี้ไม่ได้กรองรูปออกจริงอยู่แล้ว
        #    ตัวที่ชี้คลิปจริงคือ first_video_cell) แล้วเลือกคลิปใหม่สุด
        self.log("[POST] กรองเฉพาะวิดีโอ...")
        self._step(serial, "video_filter", tries=2, settle=1.5, timeout=6, skip_if_ready=True)
        if self._overtime("video_filter"):
            return False
        self.log("[POST] เลือกวิดีโอใหม่สุด (ช่องที่มีป้ายความยาวคลิป)...")
        if self._overtime("first_video") or \
                not self._step(serial, "first_video", settle=2, timeout=12):
            return False

        # 6. ถัดไป (preview) → ถัดไป (editor)
        #    next_1 ผ่านได้ต่อเมื่อหน้า editor (tv_compress) โผล่จริงแล้วเท่านั้น —
        #    กันเคสหน้ายังไม่เปลี่ยนแล้ว next_2 ไปกดปุ่ม "ถัดไป" ตัวเดิมซ้ำ
        #    skip_if_ready: บางเครื่อง next_1 พาไปถึงหน้า publish เลย (ข้าม editor)
        #    ถ้าไม่ข้าม next_2 จะแตะพิกัดมั่วบนหน้า publish แล้ว READY ผ่านทันที
        #    เพราะเช็คแค่ "อยู่หน้า publish หรือยัง" ทั้งที่ไม่ได้ทำอะไรเลย
        if not self._step(serial, "next_1", settle=3, timeout=20, skip_if_ready=True):
            return False
        if self._overtime("next_1"):
            return False
        if not self._step(serial, "next_2", settle=4, timeout=30, skip_if_ready=True):
            return False

        act = self._current_activity(serial)
        self.log(f"[POST] หน้าปัจจุบัน: {act.split('/')[-1] or '?'}")
        if not act.endswith("PublishVideoActivity"):
            self.log("[POST] ⚠ ไม่ถึงหน้าโพสต์ — flow อาจคลาดเคลื่อน หยุดก่อนโพสต์")
            return False

        # ทุกตัวต้องแตะตอน caption ยังว่าง + ก่อนการ์ดสินค้าขึ้น ไม่งั้นเลย์เอาต์เลื่อนแล้วพลาด
        # ลำดับ: ป้าย AI (toggle ตัวที่ 3 นิ่ง) → เพิ่มสินค้า (แถวบนสุดไม่ขยับ) → caption ท้ายสุด

        if self._overtime("publish_page"):
            return False

        # 7.5 รอแผง "เพิ่มสินค้า" โหลดก่อน — แผงนี้ดันทุกอย่างใต้มันลง 226px
        has_panel = self._wait_add_product_panel(serial, timeout=20)

        # 8. เปิดป้ายกำกับ AI (ครีเอเตอร์แจ้งเนื้อหาสร้างด้วย AI)
        self.log("[POST] เปิดป้ายกำกับ AI...")
        self._tap_r(serial, "ai_label", settle=1.2)

        # 8.5 ปิด Duet (อนุญาตให้ใช้ซ้ำ — เปิด ON เองดีฟอลต์ ต้องการให้ปิด)
        self.log("[POST] ปิด Duet (อนุญาตให้ใช้ซ้ำ)...")
        self._tap_r(serial, "duet_toggle", settle=1.2)

        # 9. เพิ่มสินค้าผ่านลิงก์ตะกร้า (โชว์สินค้าในวิดีโอ)
        has_product = self._add_product_by_link(serial, has_adbkb, has_panel=has_panel)

        # ต้องยืนยันว่ากลับมาอยู่หน้า publish จริงก่อนพิมพ์อะไรต่อ — ถ้าค้างอยู่หน้าอื่น
        # (เช่นหน้ากรอกลิงก์) แล้วเดินต่อ แคปชั่นจะถูกพิมพ์ทับลงช่องของหน้านั้นแทน
        act = self._current_activity(serial)
        if not act.endswith("PublishVideoActivity"):
            self.log(f"[POST] ⚠ ค้างอยู่ที่ {act.split('/')[-1] or '?'} ไม่ใช่หน้าโพสต์ — "
                     f"หยุดก่อน ไม่พิมพ์แคปชั่นทับหน้าอื่น")
            return False

        if self._overtime("caption"):
            return False

        # 10. caption (พิมพ์ท้ายสุด — ความยาวไม่กระทบการแตะอื่นแล้ว)
        #     ตัดลิงก์ออกได้เฉพาะเมื่อการ์ดสินค้าขึ้นจริง ไม่งั้นจะได้โพสต์ที่ไม่มีทั้ง
        #     การ์ดสินค้าและลิงก์ = คนดูกดซื้อไม่ได้เลย
        self.log("[POST] ใส่ caption...")
        if has_product:
            text = self._caption_without_link(caption)
        else:
            text = caption
            self.log("[POST] ⚠ ไม่มีการ์ดสินค้า — คงลิงก์ไว้ในแคปชั่นแทน")
        caption_ok = True if not text else None
        for i in range(1, 3):
            if caption_ok is True:
                break
            self._tap_r(serial, "caption_field", settle=1.5)
            self._clear_caption(serial)
            # รอบ 2 เลี่ยง clipboard (รอบแรกอาจได้ของเก่าในเครื่อง) ใช้ INJECT_TEXT แทน
            self._type_caption(serial, text, has_adbkb, avoid_clipboard=(i > 1))
            caption_ok = self._caption_landed(serial, expect=text)
            if caption_ok is False:
                self.log(f"[POST] แคปชั่นยังไม่เข้า (รอบ {i}/2) — พิมพ์ใหม่")
            elif caption_ok is None:
                break          # ตรวจไม่ได้ พิมพ์ซ้ำก็ไม่รู้ผล — ไปต่อแบบติดธง unverified

        # แคปชั่นไม่เข้าจริง = หยุด ห้ามกดโพสต์ (เดิมคำนวณ caption_ok ไว้แล้วไม่ได้ใช้
        # → โพสต์แคปชั่นว่างขึ้นจริงแล้วระบบยังรายงานว่าสำเร็จ)
        if caption_ok is False:
            self.log("[POST] ✗ แคปชั่นไม่เข้าช่องหลังลอง 2 รอบ — หยุด ไม่กดโพสต์")
            return False
        # ตรวจไม่ได้ (dump ไม่ผ่าน) → โพสต์ได้ แต่ต้องไม่รายงานว่าสำเร็จเต็มปาก
        self._caption_unverified = caption_ok is None
        if self._caption_unverified:
            self.log("[POST] ⚠ ยืนยันแคปชั่นไม่ได้ — จะรายงานผลเป็น unverified")

        # 10.5 กด "ตกลง" ยืนยันแคปชั่น
        self.log("[POST] กดตกลง ยืนยันแคปชั่น...")
        self._tap_r(serial, "caption_ok", settle=1.5)

        if dry_run:
            self.log("[POST] DRY RUN — ป้าย AI + ปิด Duet + สินค้า + caption(ตกลง) แล้ว หยุดก่อนกดโพสต์ ✓")
            return "unverified" if self._caption_unverified else True

        # 11. โพสต์
        self.log("[POST] กดโพสต์...")
        before_act = self._current_activity(serial)
        self._tap_r(serial, "post_button", settle=5)
        # ★ หลักฐานว่าโพสต์ขึ้นจริงที่ไม่ต้องพึ่ง dump: Shopee ออกจากหน้า publish
        #   กดไม่ติด = ค้างหน้าเดิม (พิสูจน์แล้วตอนปุ่มพลาด 94px — ค้าง 2 รอบติด)
        #   หน้า publish และหน้าฟีดหลังโพสต์ dump ไม่ผ่านทั้งคู่ ตัวยืนยันเดิมจึงตอบ
        #   "ยืนยันไม่ได้" ทุกครั้ง แล้วงานที่โพสต์สำเร็จไปโผล่เป็น error ในหน้างาน
        self._left_publish = False
        if "PublishVideoActivity" in before_act:
            for _ in range(25):
                if "PublishVideoActivity" not in self._current_activity(serial):
                    self._left_publish = True
                    break
                time.sleep(1)
            self.log("[POST] ออกจากหน้าโพสต์แล้ว — คลิปขึ้นแล้ว ✓" if self._left_publish
                     else "[POST] ⚠ ยังค้างหน้าโพสต์หลังกดปุ่ม — อาจกดไม่ติด")
        return True

    def _maybe_verify(self, serial: str):
        """ลดผลเป็น unverified ถ้าโพสต์ขึ้นแต่ยืนยันเนื้อแคปชั่นไม่ได้

        `verify_post` ตรวจแค่ "โพสต์ขึ้นไหม" ไม่ได้ดูว่าแคปชั่นมีเนื้อหาจริง —
        ถ้าไม่ลดชั้นตรงนี้ โพสต์แคปชั่นว่างจะถูก autopilot ย้ายเข้า DONE เงียบ ๆ
        """
        res = super()._maybe_verify(serial)
        left = getattr(self, "_left_publish", False)
        # ตัวยืนยันอ่านหน้าจอไม่ได้ (ฟีดหลังโพสต์เล่นวิดีโอตลอด) แต่เรามีหลักฐานอื่น:
        # ออกจากหน้า publish แล้ว = โพสต์ขึ้นจริง — อย่ารายงานเป็น error ให้ผู้ใช้ไปนั่งเช็คเอง
        if res == "unverified" and left:
            self.log(f"[{self.TAG}] ✓ ยืนยันจากการออกจากหน้าโพสต์ (อ่านหน้าจอไม่ได้ แต่คลิปขึ้นแล้ว)")
            res = True
        if res is True and getattr(self, "_caption_unverified", False):
            # "อ่านแคปชั่นไม่ได้" ต่างจาก "อ่านแล้วว่าง" — ตัวหลังถูกดักไปตั้งแต่ก่อนกดโพสต์
            # ถ้าโพสต์ขึ้นแล้วจริง การลดชั้นเพราะอ่านไม่ได้ทำให้ทุกโพสต์กลายเป็น error
            if left:
                self.log(f"[{self.TAG}] โพสต์ขึ้นแล้ว ✓ (ยืนยันเนื้อแคปชั่นไม่ได้เพราะอ่านหน้าจอไม่ได้)")
                return True
            self.log(f"[{self.TAG}] ⚠ โพสต์ขึ้นแล้วแต่ยืนยันแคปชั่นไม่ได้ — รายงาน unverified")
            return "unverified"
        return res
