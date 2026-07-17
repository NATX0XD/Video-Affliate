"""สร้าง icon placeholder ของแอป (ธีมม่วง + สามเหลี่ยม play = วิดีโอ, ไม่ใช้อิโมจิ).
รัน: python make_icon.py  → ได้ icon.png / icon.ico (+ icon.icns ถ้า Pillow รองรับ)
ปรับสี/รูปได้ภายหลัง — นี่เป็นตัววางชั่วคราวให้ build ผ่าน."""
from PIL import Image, ImageDraw

S = 1024
BG_TOP    = (124, 58, 237)    # #7c3aed
BG_BOT    = (168, 85, 247)    # #a855f7
INK       = (255, 255, 255)

def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

# พื้นหลังไล่เฉดม่วงแนวตั้ง
bg = Image.new("RGB", (S, S), BG_TOP)
px = bg.load()
for y in range(S):
    t = y / (S - 1)
    px_row = (
        int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
        int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
        int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
    )
    for x in range(S):
        px[x, y] = px_row

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(bg, (0, 0), rounded_mask(S, int(S * 0.22)))

# สามเหลี่ยม play (วิดีโอ) กลางภาพ
d = ImageDraw.Draw(img)
cx, cy = S * 0.54, S * 0.5
w, h = S * 0.30, S * 0.34
d.polygon([(cx - w / 2, cy - h / 2), (cx - w / 2, cy + h / 2), (cx + w / 2, cy)],
          fill=INK + (255,))

img.save("icon.png")
img.save("icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("เขียน icon.png + icon.ico แล้ว")
try:
    img.resize((512, 512), Image.LANCZOS).save("icon.icns")
    print("เขียน icon.icns แล้ว (สำหรับ build Mac)")
except Exception as e:
    print(f"ข้าม icon.icns (Pillow ไม่รองรับ ICNS: {e}) — ถ้าจะ build Mac ค่อยทำ .icns แยก")
