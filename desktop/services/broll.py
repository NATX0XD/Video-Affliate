"""แทรก footage สินค้า (B-roll) สลับกับคลิปตัวละคร ด้วย ffmpeg.

ทำหลังคลิปหลักสร้างเสร็จแล้ว — ไม่ยุ่งกับขั้นตอนคุย Google Flow เลย
พังตรงนี้ก็ได้คลิปเดิมกลับไป (ผู้เรียกใช้ไฟล์เดิมต่อ) ไม่กระทบงานที่เหลือ

วิธี: "ทับภาพ" ไม่ใช่ "ตัดต่อ" — เสียงพูดของคลิปหลักไหลต่อเนื่องทั้งคลิป
มีแค่ภาพที่สลับไปเป็น footage สินค้าเป็นช่วง ๆ ตัดเสียงพูดขาดกลางประโยคไม่ได้
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

from services.ffmpeg_path import ffmpeg

# กันไม่ให้ตัดทับ "หน้า" ในจังหวะที่ต้องเห็นคน
HEAD_KEEP = 2.5    # วิ ต้นคลิป — hook ต้องเห็นหน้าคนพูด
TAIL_KEEP = 3.0    # วิ ท้ายคลิป — ท่าชี้ตะกร้า (CTA) ต้องเห็นเต็ม ๆ
CUT_LEN   = 1.6    # วิ ต่อ 1 ช่วง footage — สั้นพอที่คนดูไม่หลุดจากคนพูด
GAP_MIN   = 1.2    # วิ เว้นระหว่างช่วง — ตัดถี่กว่านี้ดูวูบวาบ


def _identify(video: Path) -> str:
    """stderr ของ `ffmpeg -i <ไฟล์>` — มีทั้งความยาว ขนาดภาพ และสตรีมเสียง

    ★ ตั้งใจไม่ใช้ ffprobe: ตัวติดตั้งทั้งแมคและวินโดวส์แถมมาแต่ ffmpeg
    เครื่องที่ไม่มี Homebrew จะไม่มี ffprobe เลย แล้ว B-roll จะเงียบไปทั้งฟีเจอร์
    (ffmpeg -i โดยไม่ใส่ output จบด้วย exit code 1 เป็นปกติ — อ่าน stderr ได้ตามปกติ)
    """
    try:
        r = subprocess.run([ffmpeg(), "-hide_banner", "-i", str(video)],
                           capture_output=True, timeout=60)
        return r.stderr.decode("utf-8", "replace")
    except Exception:
        return ""


def probe(video: Path) -> dict:
    """คืน {w,h,dur} ของวิดีโอ — ค่าที่อ่านไม่ได้จะเป็น 0"""
    info = _identify(video)
    dur = 0.0
    m = re.search(r"Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)", info)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    w = h = 0
    for line in info.splitlines():
        if ": Video:" not in line:
            continue
        d = re.search(r"[,\s](\d{2,5})x(\d{2,5})(?:[\s,\[]|$)", line)
        if d:
            w, h = int(d.group(1)), int(d.group(2))
            break
    return {"w": w, "h": h, "dur": dur}


def has_audio(video: Path) -> bool:
    return bool(re.search(r"Stream #\d+:\d+.*: Audio:", _identify(video)))


def plan_cuts(dur: float, n_assets: int) -> list[tuple[float, float]]:
    """เลือกช่วงเวลาที่จะสลับไป footage — คืน [(start, end), ...] ตามลำดับเวลา

    ยึดเวลาที่ "ตัดได้" (ตัดหัวท้ายออกแล้ว) มาหารให้ช่วงกระจายเท่า ๆ กัน
    คลิปสั้นเกินก็คืนลิสต์ว่าง = ไม่แทรก ดีกว่าตัดจนคนดูงง
    """
    usable = dur - HEAD_KEEP - TAIL_KEEP
    if usable < CUT_LEN or n_assets <= 0:
        return []
    # จำนวนช่วงที่ยัดได้จริงโดยยังเว้นจังหวะระหว่างกัน
    max_cuts = int((usable + GAP_MIN) // (CUT_LEN + GAP_MIN))
    n = max(0, min(n_assets, max_cuts))
    if n <= 0:
        return []
    slot = usable / n                      # แบ่งพื้นที่ตัดเป็น n ช่อง ช่วงละ 1 ช่อง
    cuts = []
    for i in range(n):
        s = HEAD_KEEP + i * slot + (slot - CUT_LEN) / 2   # วางไว้กลางช่องของตัวเอง
        cuts.append((round(s, 2), round(s + CUT_LEN, 2)))
    return cuts


def _is_image(p: Path) -> bool:
    return p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def insert(main: Path, assets: list[Path], out: Path, log=None) -> bool:
    """ทับ footage ลงคลิปหลักตามช่วงที่คำนวณไว้ · คืน True เมื่อได้ไฟล์ใหม่จริง

    ล้มเหลว = คืน False และไม่แตะไฟล์หลัก ผู้เรียกใช้ไฟล์เดิมต่อได้ทันที
    """
    def L(m):
        try:
            log and log(m)
        except Exception:
            pass

    assets = [a for a in assets if a and Path(a).exists()]
    if not assets:
        return False
    info = probe(main)
    w, h, dur = info["w"], info["h"], info["dur"]
    if not (w and h and dur):
        L("[B-ROLL] อ่านขนาด/ความยาวคลิปไม่ได้ — ข้ามการแทรก footage")
        return False

    cuts = plan_cuts(dur, len(assets))
    if not cuts:
        L(f"[B-ROLL] คลิปยาว {dur:.1f} วิ สั้นเกินกว่าจะแทรก footage — ข้าม")
        return False
    assets = assets[:len(cuts)]

    ins, filters, last = [], [], "0:v"
    for i, (a, (s, e)) in enumerate(zip(assets, cuts), start=1):
        if _is_image(a):
            ins += ["-loop", "1", "-t", f"{CUT_LEN}", "-i", str(a)]
        else:
            # วนซ้ำเผื่อ footage สั้นกว่าช่วงที่จะทับ — จะได้ไม่มีเฟรมค้าง
            ins += ["-stream_loop", "-1", "-t", f"{CUT_LEN}", "-i", str(a)]
        # ครอบเต็มเฟรม 9:16 (ขยายให้ล้นแล้วครอบกลาง) แล้วเลื่อนให้เฟรมแรกไปตกที่วินาที s
        filters.append(
            f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},setsar=1,fps=30,setpts=PTS-STARTPTS+{s}/TB[b{i}]")
        nxt = f"v{i}"
        filters.append(f"[{last}][b{i}]overlay=0:0:enable='between(t,{s},{e})'[{nxt}]")
        last = nxt

    cmd = [ffmpeg(), "-y", "-i", str(main), *ins,
           "-filter_complex", ";".join(filters), "-map", f"[{last}]"]
    if has_audio(main):
        cmd += ["-map", "0:a", "-c:a", "copy"]      # ★ เสียงพูดเดิมทั้งเส้น ไม่แตะ
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]

    try:
        r = subprocess.run(cmd, capture_output=True, timeout=600)
    except Exception as ex:
        L(f"[B-ROLL] ffmpeg ล้ม: {ex}")
        return False
    if not out.exists() or out.stat().st_size == 0:
        L(f"[B-ROLL] แทรก footage ไม่สำเร็จ: {r.stderr.decode()[-200:]}")
        out.unlink(missing_ok=True)
        return False
    spans = ", ".join(f"{s:.1f}-{e:.1f}วิ" for s, e in cuts)
    L(f"[B-ROLL] แทรก footage {len(cuts)} ช่วง ({spans}) — เสียงพูดเดิมครบทั้งคลิป")
    return True
