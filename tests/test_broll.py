"""broll — เลือกช่วงตัด + แทรก footage จริงด้วย ffmpeg (เสียงพูดต้องไม่ขาด)."""
import shutil
import subprocess

import pytest

from services import broll


# ── plan_cuts: ตรรกะล้วน ไม่ต้องมี ffmpeg ────────────────────────────────────

def test_plan_cuts_keeps_head_and_tail():
    cuts = broll.plan_cuts(10.0, 3)
    assert cuts, "คลิป 10 วิ ต้องแทรกได้อย่างน้อย 1 ช่วง"
    assert cuts[0][0] >= broll.HEAD_KEEP          # ไม่ทับ hook ต้นคลิป
    assert cuts[-1][1] <= 10.0 - broll.TAIL_KEEP  # ไม่ทับ CTA ท้ายคลิป


def test_plan_cuts_no_overlap_and_gap_kept():
    cuts = broll.plan_cuts(20.0, 5)
    assert len(cuts) >= 2
    for (_, e), (s2, _) in zip(cuts, cuts[1:]):
        assert s2 - e >= broll.GAP_MIN - 0.01     # เว้นจังหวะ ไม่ตัดถี่จนวูบวาบ


def test_plan_cuts_short_clip_returns_nothing():
    # 6 วิ − หัว 2.5 − ท้าย 3.0 = 0.5 วิ ตัดไม่ได้ → ต้องไม่แทรก ดีกว่าตัดมั่ว
    assert broll.plan_cuts(6.0, 3) == []


def test_plan_cuts_never_more_than_assets():
    assert len(broll.plan_cuts(60.0, 2)) == 2


def test_plan_cuts_no_assets():
    assert broll.plan_cuts(30.0, 0) == []


# ── insert: ต้องมี ffmpeg จริง ───────────────────────────────────────────────

ffmpeg_only = pytest.mark.skipif(
    not shutil.which("ffmpeg"), reason="ต้องมี ffmpeg")


@pytest.fixture
def clip(tmp_path):
    """คลิปทดสอบ 10 วิ 720x1280 มีเสียง — เลียนแบบคลิปที่ Flow ส่งกลับมา"""
    p = tmp_path / "main.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=10",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(p)],
        capture_output=True, timeout=120)
    return p


def _solid(tmp_path, name, color):
    p = tmp_path / name
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={color}:size=1000x1000:duration=1",
                    "-frames:v", "1", str(p)], capture_output=True, timeout=60)
    return p


def _avg_rgb(video, t):
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", str(video), "-frames:v", "1",
                        "-vf", "scale=4:4", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       capture_output=True, timeout=60)
    d = r.stdout
    assert d, f"ดึงเฟรมที่ {t} วิ ไม่ได้"
    px = [d[i:i + 3] for i in range(0, len(d), 3)]
    return tuple(sum(p[i] for p in px) // len(px) for i in range(3))


@ffmpeg_only
def test_insert_puts_footage_only_inside_the_planned_windows(clip, tmp_path):
    a1 = _solid(tmp_path, "b1.jpg", "red")
    a2 = _solid(tmp_path, "b2.jpg", "blue")
    out = tmp_path / "out.mp4"
    assert broll.insert(clip, [a1, a2], out) is True

    cuts = broll.plan_cuts(broll.probe(clip)["dur"], 2)
    mid1 = (cuts[0][0] + cuts[0][1]) / 2
    mid2 = (cuts[1][0] + cuts[1][1]) / 2
    r1, g1, b1 = _avg_rgb(out, mid1)
    r2, g2, b2 = _avg_rgb(out, mid2)
    assert r1 > 200 and g1 < 60 and b1 < 60, f"กลางช่วงแรกควรเป็น footage สีแดง ได้ {(r1, g1, b1)}"
    assert b2 > 200 and r2 < 60 and g2 < 60, f"กลางช่วงสองควรเป็น footage สีน้ำเงิน ได้ {(r2, g2, b2)}"
    # นอกช่วง = คลิปเดิม (testsrc เป็นภาพลายสี ไม่ใช่สีเดียวล้วน)
    out_r, out_g, out_b = _avg_rgb(out, 1.0)
    assert not (out_r > 200 and out_g < 60), "ต้นคลิปต้องยังเป็นคนพูด ไม่ใช่ footage"


@ffmpeg_only
def test_probe_reads_size_and_duration_without_ffprobe(clip):
    """ต้องอ่านค่าได้จาก ffmpeg อย่างเดียว — เครื่องผู้ใช้ไม่มี ffprobe ติดมาด้วย"""
    info = broll.probe(clip)
    assert (info["w"], info["h"]) == (720, 1280)
    assert abs(info["dur"] - 10.0) < 0.3


@ffmpeg_only
def test_insert_keeps_audio_and_duration(clip, tmp_path):
    out = tmp_path / "out.mp4"
    assert broll.insert(clip, [_solid(tmp_path, "b.jpg", "green")], out) is True
    before, after = broll.probe(clip), broll.probe(out)
    assert broll.has_audio(out), "เสียงพูดต้องอยู่ครบ — B-roll ทับแค่ภาพ"
    assert abs(after["dur"] - before["dur"]) < 0.35, "ความยาวคลิปต้องเท่าเดิม"
    assert (after["w"], after["h"]) == (before["w"], before["h"])


@ffmpeg_only
def test_insert_without_assets_does_nothing(clip, tmp_path):
    out = tmp_path / "out.mp4"
    assert broll.insert(clip, [], out) is False
    assert not out.exists(), "ล้มเหลวต้องไม่ทิ้งไฟล์ครึ่ง ๆ กลาง ๆ ไว้"


@ffmpeg_only
def test_insert_skips_when_clip_too_short(tmp_path):
    short = tmp_path / "short.mp4"
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=4",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(short)],
                   capture_output=True, timeout=120)
    out = tmp_path / "out.mp4"
    assert broll.insert(short, [_solid(tmp_path, "b.jpg", "red")], out) is False
    assert not out.exists()
