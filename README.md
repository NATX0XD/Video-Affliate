# VDO Gen — Auto Pilot

ระบบสร้างและโพสต์คลิปวิดีโอ **หลายแพลตฟอร์ม** อัตโนมัติครบวงจร (ดูดสินค้า → สร้างคลิป → โพสต์) แบบ **near-zero touch**

> แพลตฟอร์มปลายทางเป็น plugin (BasePoster) — โพสต์คลิปเดียวไปหลายแพลตฟอร์มพร้อมกัน · Shopee Video จูนแล้ว, TikTok/Reels/IG/YouTube มี flow ตั้งต้น (text-based) รอจูนกับเครื่องจริง · แหล่งสินค้า/affiliate ปัจจุบันดูดจาก Shopee Affiliate

> 🗺 แผนพัฒนา/ทิศทางทั้งหมดดูที่ [`ROADMAP.md`](./ROADMAP.md)

## เริ่มใช้งาน (ผู้ใช้ทั่วไป — ไม่ต้องเขียนโค้ด)

ติดตั้งแบบ **ดับเบิลคลิกครั้งเดียว** ไม่ต้องพิมพ์คำสั่งใด ๆ:

| OS | ติดตั้ง (ทำครั้งเดียว) | เปิดใช้งาน |
|----|----------------------|-----------|
| **Windows** | ดับเบิลคลิก **`ติดตั้ง.bat`** | ดับเบิลคลิกทางลัด `VDO Gen Auto Pilot` บน Desktop |
| **macOS** | ดับเบิลคลิก **`ติดตั้ง.command`** | ดับเบิลคลิกทางลัด `เปิด VDO Gen Auto Pilot` บน Desktop |

ตัวติดตั้งจะลงเครื่องมือที่จำเป็น (Python/adb/scrcpy/ffmpeg ฯลฯ) + สร้างทางลัดบน Desktop ให้เอง

- **ติดตั้งเป็นแอป (PWA):** เปิดหน้าโปรแกรมในเบราว์เซอร์ → กดไอคอน **ติดตั้ง** ท้ายช่อง URL → ได้แอปแยกหน้าต่าง
- **หลังอัปเดต:** ถ้าแก้ส่วน extension ให้ไป `chrome://extensions` กด **รีโหลด (↻)** แล้ว **F5 หน้า Shopee** (กัน context invalidated)

> คู่มือฉบับเต็มสำหรับผู้ใช้: [`คู่มือเริ่มต้น.md`](./คู่มือเริ่มต้น.md)

## โครงสร้าง

| โฟลเดอร์ | คืออะไร |
|----------|---------|
| `desktop/` | Backend Python — WebServer (REST+WS :3001), workers, ADB |
| `extension/` | Chrome extension (MV3) — ดูดสินค้า + ขับ Google Flow + sidepanel |
| `web/` | Web UI (Next.js) — ศูนย์ควบคุม/มอนิเตอร์ |
| `keys/` | control key (ไม่ commit) |
| `_archive/` | ของเก่าเก็บอ้างอิง (desktop-ui, extension-legacy, web-git-backup) |

## รันแบบ dev

**1. Backend (Python)**
```bash
cd desktop
cp .env.example .env          # ใส่ GOOGLE_API_KEY / DID_API_KEY
pip install -r requirements.txt
python main.py                # → http://localhost:3001
```

**2. Web UI (Next.js)**
```bash
cd web
cp .env.example .env.local    # ชี้ไป :3001 อยู่แล้ว
npm install
npm run dev                   # → http://localhost:3000
```

**3. Extension**
- เปิด `chrome://extensions` → Developer mode → Load unpacked → เลือกโฟลเดอร์ `extension/`
- หลังแก้โค้ด extension: กด Reload + **F5 หน้า Shopee** (กัน context invalidated)

## หมายเหตุ
- Backend = พอร์ต **3001** (ตั้งใน `desktop/settings.json`)
- `web/AGENTS.md`: Next.js เวอร์ชันนี้ถูกแก้ — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด web
