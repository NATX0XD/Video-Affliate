"""
หา element จริงบนหน้าจอด้วย uiautomator แทนการแตะพิกัดตายตัว

ทำไม:
  พิกัดสัดส่วน (ratio) พังง่ายมาก — เจอมาแล้วจริง:
    · ปุ่ม + ของ Shopee อยู่ที่ bounds [1143,23][1179,59] แต่ค่าที่คาลิเบรตไว้คือ y=61
      → ต่ำกว่าขอบปุ่ม 2px → แตะไม่ติด → flow ตายตั้งแต่ขั้นแรก
    · แท็บ "วิดีโอ" ในคลังภาพอยู่ x=599 แต่ ratio ชี้ x=574 → ไปโดนแท็บ "ทั้งหมด"
  Shopee ใส่ content-desc / resource-id / text ไว้ให้ค่อนข้างครบ จับจาก node ตรงๆ แม่นกว่า
  และข้ามความต่างระหว่างมือถือ/แท็บเล็ตได้เลย

หมายเหตุ: หน้าที่มีวิดีโอเล่นอยู่ตลอดอาจ dump ไม่ได้ (window ไม่เคย idle)
          ทุกจุดเรียกใช้จึงต้องมี fallback เป็นพิกัดเดิมเสมอ
"""
import html
import os
import re
import subprocess
import time
from typing import Callable, List, Optional

from services.adb.adb_path import adb_bin

UI_REMOTE = "/data/local/tmp/vgap_ui.xml"   # ไม่ใช้ /sdcard — กันไฟล์ไปโผล่ในคลังภาพ

_NODE_RE   = re.compile(r"<node[^>]*>")
_BOUNDS_RE = re.compile(r'bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"')

_dump_seq = [0]
_try_seq  = [0]   # นับทุกครั้งที่ยิง uiautomator — ใช้สลับ dump เต็ม / --compressed


class UiNode:
    __slots__ = ("x1", "y1", "x2", "y2", "text", "desc", "rid", "cls", "clickable", "selected")

    def __init__(self, x1, y1, x2, y2, text, desc, rid, cls, clickable, selected):
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2
        self.text, self.desc, self.rid, self.cls = text, desc, rid, cls
        self.clickable, self.selected = clickable, selected

    @property
    def center(self):
        return (self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2

    @property
    def w(self):
        return self.x2 - self.x1

    @property
    def h(self):
        return self.y2 - self.y1

    def contains(self, other: "UiNode") -> bool:
        return (self.x1 <= other.x1 and self.y1 <= other.y1
                and other.x2 <= self.x2 and other.y2 <= self.y2)

    def __repr__(self):
        return (f"UiNode({self.center} {self.rid or self.desc or self.text or self.cls!r} "
                f"clk={self.clickable})")


def _attr(node: str, key: str) -> str:
    m = re.search(key + r'="([^"]*)"', node)
    # uiautomator escape XML entity ไว้ — text ของแท็บคือ "Live &amp; Video"
    # ถ้าไม่ unescape การหาแบบ text_contains="Live & Video" จะไม่มีวันเจอ
    return html.unescape(m.group(1)) if m else ""


def parse_nodes(xml: str) -> List[UiNode]:
    out = []
    for raw in _NODE_RE.findall(xml):
        b = _BOUNDS_RE.search(raw)
        if not b:
            continue
        x1, y1, x2, y2 = map(int, b.groups())
        if x2 <= x1 or y2 <= y1:
            continue
        out.append(UiNode(
            x1, y1, x2, y2,
            _attr(raw, "text"),
            _attr(raw, "content-desc"),
            _attr(raw, "resource-id").split("/")[-1],
            _attr(raw, "class").split(".")[-1],
            _attr(raw, "clickable") == "true",
            _attr(raw, "selected") == "true",
        ))
    return out


def _save_dump(xml: str, tag: str):
    """เก็บ dump ทุกหน้าไว้ตรวจย้อนหลัง (เปิดด้วย env VGAP_UI_DUMP_DIR)"""
    d = os.environ.get("VGAP_UI_DUMP_DIR")
    if not d:
        return
    try:
        os.makedirs(d, exist_ok=True)
        _dump_seq[0] += 1
        name = f"{_dump_seq[0]:03d}_{tag or 'dump'}_{time.strftime('%H%M%S')}.xml"
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            f.write(xml)
    except Exception:
        pass


def dump_nodes(serial: str, log: Callable = print, tries: int = 2,
               tag: str = "") -> List[UiNode]:
    """คืน [] ถ้า dump ไม่ได้ (เช่น หน้าที่วิดีโอเล่นตลอด) — ให้ caller fallback เป็นพิกัด

    ลบไฟล์ปลายทางก่อน dump ทุกครั้ง: ถ้า uiautomator dump ล้มเหลว (window ไม่ idle)
    ไฟล์รอบก่อนยังค้างอยู่ → `cat` จะคืน "หน้าเดิม" มาแบบเนียน ๆ แล้ว flow เดินต่อ
    ด้วย node ของหน้าที่ผ่านไปแล้ว (เคยทำให้ไปเจอแท็บ "วิดีโอ" ของหน้า feed)
    """
    adb = adb_bin(log)
    why = ""
    for attempt in range(tries):
        # --compressed ตัด node ที่ไม่มีข้อมูลออก → เบากว่ามาก
        # หน้าแรก Shopee เล่นวิดีโอตลอด window ไม่เคย idle แล้ว dump เต็มจะล้ม
        # ("could not get idle state") ตัว compressed ผ่านได้บ่อยกว่า → ลองสลับกันไป
        # นับข้ามการเรียกด้วย — wait_for เรียกทีละ tries=1 ถ้านับแค่ในลูปนี้จะไม่เคยได้ใช้ compressed เลย
        _try_seq[0] += 1
        args = ["uiautomator", "dump"] + (["--compressed"] if _try_seq[0] % 2 else []) + [UI_REMOTE]
        try:
            subprocess.run([adb, "-s", serial, "shell", "rm", "-f", UI_REMOTE],
                           capture_output=True, timeout=8)
            # timeout สั้นลง: wait_for เช็ค deadline หลัง dump เสร็จเท่านั้น
            # ค่าเดิม 15/20/20 ทำให้ dump ที่ค้างรอบเดียวกิน 55 วิ ใน wait_for(timeout=6)
            r = subprocess.run([adb, "-s", serial, "shell"] + args,
                               capture_output=True, text=True, timeout=12)
            out = (r.stdout or "") + (r.stderr or "")
            if "dumped" not in out:
                why = " ".join(out.split())[:120] or "ไม่มีข้อความตอบกลับ"
                time.sleep(0.6)
                continue
            c = subprocess.run([adb, "-s", serial, "exec-out", "cat", UI_REMOTE],
                               capture_output=True, timeout=12)
            xml = c.stdout.decode("utf-8", "ignore")
            if "<node" in xml:
                _save_dump(xml, tag)
                return parse_nodes(xml)
            why = "อ่านไฟล์ dump กลับมาแล้วไม่มี node"
        except subprocess.TimeoutExpired:
            why = "uiautomator ค้างเกินเวลา"
        except Exception as e:
            why = str(e)[:120]
        time.sleep(0.6)
    # เดิมล้มแล้วเงียบ ผู้ใช้เห็นแค่ "ใช้พิกัดสำรอง" โดยไม่รู้ว่าทำไมอ่านหน้าจอไม่ได้
    if why:
        log(f"[ui] อ่านหน้าจอไม่สำเร็จ{f' ({tag})' if tag else ''}: {why}")
    return []


def wait_for(serial: str, pred: Callable[[List[UiNode]], object], timeout: float = 10.0,
             log: Callable = print, tag: str = "", interval: float = 0.8):
    """poll dump จน pred(nodes) คืนค่า truthy — คืน (nodes, ค่าที่ pred คืน) หรือ (nodes, None)

    ใช้แทนการ "แตะแล้วนอน sleep แล้วเชื่อว่าถึงหน้าใหม่" — หน้าถัดไปของ Shopee
    โผล่ช้าไม่เท่ากันทุกรอบ โดยเฉพาะบนแท็บเล็ต
    """
    end = time.time() + timeout
    nodes: List[UiNode] = []
    while True:
        got = dump_nodes(serial, log, tries=1, tag=tag)
        if got:
            nodes = got
            try:
                val = pred(nodes)
            except Exception:
                val = None
            if val:
                return nodes, val
        if time.time() >= end:
            return nodes, None
        time.sleep(interval)


# ── ตัวช่วยค้นหา ────────────────────────────────────────────────

def find(nodes: List[UiNode], *, text=None, text_contains=None, desc=None,
         desc_contains=None, rid=None, cls=None, clickable: Optional[bool] = None,
         max_y=None, min_y=None) -> Optional[UiNode]:
    for n in nodes:
        if cls is not None and n.cls != cls:
            continue
        if text is not None and n.text != text:
            continue
        if text_contains is not None and text_contains not in n.text:
            continue
        if desc is not None and n.desc != desc:
            continue
        if desc_contains is not None and desc_contains not in n.desc:
            continue
        if rid is not None and n.rid != rid:
            continue
        if clickable is not None and n.clickable != clickable:
            continue
        if max_y is not None and n.center[1] > max_y:
            continue
        if min_y is not None and n.center[1] < min_y:
            continue
        return n
    return None


def frac_y(nodes: List[UiNode], frac: float) -> int:
    """พิกัด y ที่สัดส่วน frac ของความสูงจอ — ใช้แทนเกณฑ์พิกเซลตายตัว

    เกณฑ์อย่าง max_y=200 ผูกกับจอที่คาลิเบรตไว้ตัวเดียว: จอที่ status bar สูงกว่า
    จะดันหัวข้อเลย 200 แล้วเงื่อนไขไม่ผ่านตลอด
    """
    h = max((n.y2 for n in nodes), default=1920)
    return int(h * frac)


def find_text(nodes: List[UiNode], *texts, exact: bool = True,
              **kw) -> Optional[UiNode]:
    """หาข้อความจากหลายภาษา — คืนตัวแรกที่เจอ

    Shopee เปลี่ยนภาษา UI ตาม locale ของเครื่อง ไม่ใช่ตาม package: ถ้าเครื่องตั้ง
    ภาษาอังกฤษ spec ที่ hardcode คำไทยจะ miss ทั้งชุดแล้วตกไปใช้พิกัดสำรอง
    """
    for t in texts:
        n = find(nodes, text=t, **kw) if exact else find(nodes, text_contains=t, **kw)
        if n is not None:
            return n
    return None


def tappable(nodes: List[UiNode], node: Optional[UiNode]) -> Optional[UiNode]:
    """หลาย element ที่มี text ไม่ได้ clickable เอง — เลื่อนขึ้นไปหา parent ที่กดได้
    (parent = node ที่กดได้และครอบ bounds ของตัวลูกไว้ โดยพื้นที่เล็กที่สุด)"""
    if node is None:
        return None
    if node.clickable:
        return node
    best = None
    for n in nodes:
        if n.clickable and n.contains(node):
            if best is None or (n.w * n.h) < (best.w * best.h):
                best = n
    return best or node


def row_toggle(nodes: List[UiNode], text_contains: str) -> Optional[UiNode]:
    """toggle ที่อยู่แถวเดียวกับข้อความที่ระบุ (เช่น สวิตช์ 'อนุญาตให้ใช้ซ้ำ' ริมขวา)"""
    label = find(nodes, text_contains=text_contains)
    if label is None:
        return None
    ly = label.center[1]
    right = max((n.x2 for n in nodes), default=0)
    best = None
    for n in nodes:
        if not n.clickable or n.w > right * 0.5:
            continue
        if abs(n.center[1] - ly) > max(40, label.h):
            continue
        if n.center[0] < right * 0.6:          # ต้องอยู่ครึ่งขวาของจอ
            continue
        if best is None or n.center[0] > best.center[0]:
            best = n
    return best


GALLERY_TAB_SIBLINGS = ("ทั้งหมด", "รูปภาพ", "All", "Photos")
GALLERY_TAB_VIDEO = ("วิดีโอ", "Videos", "Video")


def gallery_tab(nodes: List[UiNode], name=GALLERY_TAB_VIDEO) -> Optional[UiNode]:
    """แท็บกรองของ "คลังภาพ" เท่านั้น (แถวเดียวกับ 'ทั้งหมด'/'รูปภาพ')

    หน้า feed Live & Video ก็มีแท็บชื่อ "วิดีโอ" อยู่บนสุดเหมือนกัน ([438,28][483,53]
    บนแท็บเล็ต) — ถ้าจับด้วย text="วิดีโอ" เฉย ๆ แล้ว dump บังเอิญเป็นหน้า feed
    จะไปแตะแท็บนั้นแทน แล้ว flow หลงทางยาว (เคยจบที่ ReactTransparentActivity)
    """
    names = (name,) if isinstance(name, str) else tuple(name)
    matches = [n for n in nodes if n.desc in names or n.text in names]
    if not matches:
        return None

    # 1) อยู่ใน container tabs_gallery = ชัวร์ที่สุด
    boxes = [n for n in nodes if n.rid == "tabs_gallery"]
    inside = [n for n in matches if any(b.contains(n) for b in boxes)]

    # 2) ไม่มี container ก็ยึด "แถวเดียวกับพี่น้อง" (ทั้งหมด / รูปภาพ)
    if not inside:
        sibs = [n for n in nodes
                if (n.desc in GALLERY_TAB_SIBLINGS or n.text in GALLERY_TAB_SIBLINGS)]
        inside = [n for n in matches
                  if any(abs(n.center[1] - s.center[1]) <= max(30, n.h) for s in sibs)]
    if not inside:
        return None
    # แท็บที่กำลังถูกเลือกอยู่จะ clickable=false → เอาตัวที่กดได้ก่อน ไม่มีค่อยเอาตัวแรก
    return next((n for n in inside if n.clickable), inside[0])


def header_icon(nodes: List[UiNode], title: str, side: str = "right") -> Optional[UiNode]:
    """ไอคอนริมแถบหัวข้อ (แถวเดียวกับ title) — สำหรับหน้า React ที่ไอคอนไม่มี id/desc/text

    เช่นไอคอนลิงก์มุมขวาบนหน้า "เพิ่มสินค้า": <ImageView bounds=[1140,51][1176,87]>
    ไม่มีอะไรให้จับเลยนอกจากตำแหน่งเทียบกับหัวข้อ
    """
    t = find(nodes, text=title, max_y=300)
    if t is None:
        return None
    ty = t.center[1]
    icons = [n for n in nodes
             if n.cls == "ImageView" and abs(n.center[1] - ty) <= max(30, t.h)
             and (n.center[0] > t.x2 if side == "right" else n.center[0] < t.x1)]
    if not icons:
        return None
    return max(icons, key=lambda n: n.center[0]) if side == "right" \
        else min(icons, key=lambda n: n.center[0])


def first_video_cell(nodes: List[UiNode]) -> Optional[UiNode]:
    """
    ช่องแรกในคลังภาพที่เป็น "วิดีโอ" จริง

    จำเป็นเพราะแท็บ "วิดีโอ" ของ Shopee ไม่ได้กรองรูปออกจริง (ตรวจกับเครื่องจริงแล้ว:
    กดแท็บวิดีโอจน selected=true แต่ grid ยังเหมือนเดิมเป๊ะ ช่องแรกเป็นรูปภาพ)
    → ถ้าเดาว่าช่องแรก = คลิปที่เพิ่งส่งไป จะได้รูปแคปหน้าจอแทน
    วิดีโอทุกช่องมี node ลูก resource-id `rl_video_tag` (ป้ายความยาวคลิป) — ใช้ตัวนี้ชี้

    ห้ามกรองด้วย clickable: ช่องในกริด (iv_picture) เป็น clickable=false ทั้งหมด
    มีแต่กล่องติ๊ก ll_check ขนาด 54x54 มุมขวาบนที่กดได้ — กรองแล้วจะไม่เจออะไรเลย
    """
    tags = [n for n in nodes if n.rid == "rl_video_tag"]
    if not tags:
        return None
    scr_w = max((n.x2 for n in nodes), default=1080)
    scr_h = max((n.y2 for n in nodes), default=1920)
    half_screen = scr_w * scr_h * 0.5
    best = None
    for t in tags:
        # ต้องเป็น node ที่ครอบป้ายแล้ว "พื้นที่เล็กที่สุด" เท่านั้น
        # RecyclerView/กริดทั้งใบก็ contains ป้ายทุกอันเหมือนกัน และ y1/x1 น้อยกว่าเซลล์จริงเสมอ
        # ถ้าเรียงด้วย (y1,x1) มันชนะทุกครั้ง → แตะกลางกริด = ได้คลิปผิดไฟล์
        cell = None
        for n in nodes:
            if n is t or not n.contains(t):
                continue
            if n.w < 150 or n.h < 150:            # เล็กกว่านี้ไม่ใช่ช่องในกริด
                continue
            if n.w * n.h > half_screen:           # ใหญ่เกินครึ่งจอ = container ไม่ใช่เซลล์
                continue
            if cell is None or (n.w * n.h) < (cell.w * cell.h):
                cell = n
        if cell is None:
            continue
        # เรียงบนลงล่าง ซ้ายไปขวา = ใหม่สุดก่อน (คลังภาพเรียงตามวันที่)
        if best is None or (cell.y1, cell.x1) < (best.y1, best.x1):
            best = cell
    return best
