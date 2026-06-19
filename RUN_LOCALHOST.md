# รันแบบ localhost บน Windows (เครื่องนี้เป็น server + เก็บ DB เอง)

ไม่ต้องใช้ตัวติดตั้ง .exe — รัน Python server บนเครื่อง Windows แล้วเปิดเบราว์เซอร์เข้า `localhost`
DB (SQLite) เก็บในเครื่องนี้เองที่ `desktop\data\app.db`

---

## ติดตั้งครั้งเดียว
1. **Python 3.11** — https://python.org → ติ๊ก **Add Python to PATH** → เช็ค `python --version`
2. **Node.js LTS** — https://nodejs.org (ใช้ build หน้าเว็บครั้งแรก) → เช็ค `node -v`
3. **adb (platform-tools)** — แตกไฟล์ใส่ PATH → `adb version`
4. **scrcpy** (เวอร์ชัน **v4.0** ให้ตรงกับโค้ด) — `scoop install scrcpy` หรือโหลด win64 zip ใส่ PATH
5. **ffmpeg** — `winget install ffmpeg` หรือ choco → `ffmpeg -version`
6. มือถือ: เปิด **USB debugging** + ติดตั้ง **ADBKeyboard apk** (สำหรับพิมพ์ไทยตอนโพสต์)

> scrcpy ต้องเป็น v4.0 (โค้ด `SCRCPY_VERSION="4.0"`) ไม่งั้น touch/caption ไม่ทำงาน

---

## รัน (คำสั่งเดียว)
ที่ root ของโปรเจกต์ เปิด PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File run-windows.ps1
```
สคริปต์จะ: ติดตั้ง deps Python → build หน้าเว็บครั้งแรก → รัน server

จากนั้นเปิดเบราว์เซอร์ → **http://localhost:3001** (ได้ทั้ง UI + API ครบในที่เดียว)

### ทำเองทีละขั้น (เผื่อ debug)
```powershell
cd desktop; pip install -r requirements.txt
cd ..\web; npm install; npm run build      # สร้าง web\out (ทำครั้งเดียว / เมื่อแก้ UI)
cd ..\desktop; python main.py              # → http://localhost:3001
```

---

## เปิดใช้ครั้งแรก
1. เปิด **http://localhost:3001** → หน้า dashboard
2. หน้า **Settings** → ใส่ **Google API key** (เก็บที่ `desktop\.env`)
3. เสียบมือถือ → กด Allow บนมือถือ → หน้า **devices** ต้องเจอเครื่อง
4. โหลด **Chrome extension** (โฟลเดอร์ `extension\`) เข้า Chrome — สำหรับดูดสินค้า + สั่ง Google Flow

## หมายเหตุ
- DB + settings + คลิป ทั้งหมดอยู่ในเครื่องนี้ (`desktop\data\`, `desktop\settings.json`, `desktop\.env`)
- ถ้าแก้หน้าเว็บ (`web\`) ต้อง `npm run build` ใหม่ (หรือลบ `web\out` แล้วรันสคริปต์ใหม่) — server เสิร์ฟจาก `web\out`
- ระหว่างพัฒนา UI จะใช้ `cd web; npm run dev` (`localhost:3000` + hot reload) คู่กับ `python main.py` ก็ได้
- ไม่ต้องใช้ตัว .exe/electron — แต่ของพวกนั้นยังอยู่ในรีโปเผื่ออยากแพ็กแจกทีหลัง
