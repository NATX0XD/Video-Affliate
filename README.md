# Shopee VDO Gen — Auto Pilot

ระบบสร้างวิดีโอโฆษณา Shopee อัตโนมัติครบวงจร (ดูด → สร้างคลิป → โพสต์) แบบ **near-zero touch**

> 🗺 แผนพัฒนา/ทิศทางทั้งหมดดูที่ [`ROADMAP.md`](./ROADMAP.md)

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
