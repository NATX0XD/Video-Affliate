"""แทรก footage สินค้า (B-roll) สลับกับคลิปตัวละคร ด้วย ffmpeg.

ทำหลังคลิปหลักสร้างเสร็จแล้ว — ไม่ยุ่งกับขั้นตอนคุย Google Flow เลย
พังตรงนี้ก็ได้คลิปเดิมกลับไป (ผู้เรียกใช้ไฟล์เดิมต่อ) ไม่กระทบงานที่เหลือ

วิธี: "ทับภาพ" ไม่ใช่ "ตัดต่อ" — เสียงพูดของคลิปหลักไหลต่อเนื่องทั้งคลิป
มีแค่ภาพที่สลับไปเป็น footage สินค้าเป็นช่วง ๆ ตัดเสียงพูดขาดกลางประโยคไม่ได้
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

# กันไม่ให้ตัดทับ "หน้า" ในจังหวะที่ต้องเห็นคน
HEAD_KEEP = 2.5    # วิ ต้นคลิป — hook ต้องเห็นหน้าคนพูด
TAIL_KEEP = 3.0    # วิ ท้ายคลิป — ท่าชี้ตะกร้า (CTA) ต้องเห็นเต็ม ๆ
CUT_LEN   = 1.6    # วิ ต่อ 1 ช่วง footage — สั้นพอที่คนดูไม่หลุดจากคนพูด
GAP_MIN   = 1.2    # วิ เว้นระหว่างช่วง — ตัดถี่กว่านี้ดูวูบวาบ


def probe(video: Path) -> dict:
    """คืน {w,h,dur} ของวิดีโอ — ค่าที่อ่านไม่ได้จะเป็น 0"""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_entries", "stream=width,height:format=duration",
             "-select_streams", "v:0", str(video)],
            capture_output=True, timeout=30)
        d = json.loads(r.stdout.decode() or "{}")
        st = (d.get("streams") or [{}])[0]
        return {"w": int(st.get("width") or 0), "h": int(st.get("height") or 0),
                "dur": float((d.get("format") or {}).get("duration") or 0)}
    except Exception:
        return {"w": 0, "h": 0, "dur": 0.0}


def has_audio(video: Path) -> bool:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
             "stream=index", "-of", "csv=p=0", str(video)],
            capture_output=True, timeout=30)
        return bool(r.stdout.strip())
    except Exception:
        return False


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

    cmd = ["ffmpeg", "-y", "-i", str(main), *ins,
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
