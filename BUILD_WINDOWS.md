# คู่มือ Build ตัวติดตั้ง Windows (คลิกเดียวติดตั้ง)

เป้าหมาย: ได้ไฟล์ `...Setup.exe` ที่ดับเบิลคลิกติดตั้งแล้วเปิดใช้ได้เลย
โดยลูกค้า **ไม่ต้องติดตั้ง Python/adb/scrcpy/ffmpeg เอง** (แถมไปในตัวติดตั้งหมด)

ทำทั้งหมด **บนเครื่อง Windows** (PyInstaller สร้าง .exe ข้ามแพลตฟอร์มไม่ได้)

---

## ขั้นที่ 0 — ติดตั้งเครื่องมือสำหรับ "คนสร้าง build" (ทำครั้งเดียว)

ติดตั้งบนเครื่องที่ใช้ build (ไม่เกี่ยวกับเครื่องลูกค้า):

1. **Node.js LTS** — https://nodejs.org → เช็ค `node -v`
2. **Python 3.11** — https://python.org → ติ๊ก **Add Python to PATH** ตอนติดตั้ง → เช็ค `python --version`
3. **Git** (ถ้ายังไม่มี) — สำหรับ clone โปรเจกต์

---

## ขั้นที่ 1 — วาง binary ที่จะแถมไปกับแอป

โหลด 3 ตัวนี้ แล้ววางไฟล์ **แบน ๆ** ในโฟลเดอร์ `electron\bin\`

| โปรแกรม | โหลดจาก | ไฟล์ที่ต้องเอามาวาง |
|---|---|---|
| **adb** | [platform-tools](https://developer.android.com/tools/releases/platform-tools) (zip) | `adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll` |
| **scrcpy** | [scrcpy releases](https://github.com/Genymobile/scrcpy/releases) (ชุด `win64` zip) | `scrcpy.exe`, **`scrcpy-server`** (ไม่มีนามสกุล), และ `.dll`/ไฟล์ทั้งหมดในชุด |
| **ffmpeg** | [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (essentials) | `ffmpeg.exe` |

โครงควรเป็นแบบนี้:
```
electron\bin\
  adb.exe
  AdbWinApi.dll
  AdbWinUsbApi.dll
  scrcpy.exe
  scrcpy-server
  SDL2.dll  avcodec-*.dll  ...(ไฟล์ที่มากับ scrcpy)
  ffmpeg.exe
```
> สคริปต์ build จะเช็คให้ว่าไฟล์หลักครบไหม ถ้าขาดจะเตือนแล้วหยุด

---

## ขั้นที่ 2 — ตั้ง URL อัปเดต (ก่อน build ครั้งแรก)

แก้ `electron\package.json` → `build.publish[0].url` เปลี่ยน `https://UPDATE_HOST_URL/vgap/`
เป็น URL host จริงที่จะวางไฟล์อัปเดต (เซิร์ฟเวอร์/พื้นที่ static ของคุณเอง — ดูหัวข้อ "อัปเดตเวอร์ชันใหม่")
> ถ้ายังไม่มี host ตอนนี้ ปล่อยไว้ก่อนได้ — แอปจะ build/ใช้ได้ปกติ แค่ auto-update ยังไม่ทำงานจนกว่าจะตั้ง URL

### API key (ตั้งครั้งแรก "ในแอป" ไม่ใช่ไฟล์ .env)
เวอร์ชัน packaged เก็บข้อมูลที่ `%USERPROFILE%\.vgap\` (ไม่ใช่ในโฟลเดอร์โปรแกรม — เพื่อให้ข้อมูลอยู่รอดตอนอัปเดต)
ดังนั้น **เปิดแอปครั้งแรก → ไปหน้า Settings → ใส่ Google API key ที่นั่น** (ระบบเขียนลง `~\.vgap\.env` ให้เอง)
> ไม่ต้องแก้ `desktop\.env` สำหรับตัว packaged (ไฟล์นั้นใช้เฉพาะตอน dev บนเครื่องคุณ)

---

## ขั้นที่ 3 — build ทั้งหมดด้วยคำสั่งเดียว

ที่ root ของ repo เปิด PowerShell แล้วรัน:
```powershell
powershell -ExecutionPolicy Bypass -File build-win.ps1
```

สคริปต์จะทำ 4 สเตปให้อัตโนมัติ:
1. เช็ค binary ใน `electron\bin\` ครบไหม
2. build web (Next static export → `web\out`)
3. build backend (PyInstaller → `desktop\dist\vgap-server.exe`)
4. build ตัวติดตั้ง (electron-builder → `dist\...Setup.exe`)

ใช้เวลา ~3-8 นาที (ครั้งแรกนานกว่าเพราะโหลด dependency)

### ถ้าอยากทำทีละสเตปเอง (เผื่อ debug)
```powershell
cd web;      npm install; npm run build;            cd ..   # → web\out
cd desktop;  pip install -r requirements.txt; pip install pyinstaller
             pyinstaller --noconfirm vgap-server.spec;  cd ..   # → desktop\dist\vgap-server.exe
cd electron; npm install; npm run build:win;        cd ..   # → dist\...Setup.exe
```

---

## ขั้นที่ 4 — ติดตั้ง + ทดสอบ

1. ไปที่โฟลเดอร์ `dist\` → ดับเบิลคลิก **`VDO Gen Auto Pilot Setup x.x.x.exe`**
2. ผ่าน wizard (เลือกโฟลเดอร์ติดตั้งได้)
3. เปิดแอป → splash ม่วงขึ้น → server รันเอง → หน้า dashboard โผล่
4. เสียบมือถือ (เปิด USB debugging) → ไปหน้า **devices** เช็คว่าเจอเครื่อง
5. ไปหน้า **diagnostics** (หรือ settings) เช็คว่า adb/ffmpeg/scrcpy เจอครบ (เพราะแถมมาแล้ว)

---

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ/วิธีแก้ |
|---|---|
| `build-win.ps1` เตือน "ขาดไฟล์ใน electron\bin" | ยังไม่วาง binary ครบ — ทำขั้นที่ 1 ให้ครบ |
| ติดตั้งแล้วเปิดมา dashboard ว่าง/ค้าง splash | server ไม่ขึ้น — เปิด `%LOCALAPPDATA%\...\` ดู log หรือรัน `vgap-server.exe` ตรงๆ ดู error |
| หา adb ไม่เจอ ทั้งที่แถมแล้ว | เช็คว่า `adb.exe` + 2 dll อยู่ใน `bin\` จริง (electron ใส่ `bin` ไว้หน้า PATH ให้แล้ว) |
| scrcpy ไม่ทำงาน (caption แตะไม่ได้) | ต้องมีไฟล์ `scrcpy-server` (ไม่มีนามสกุล) ใน `bin\` ด้วย |
| ติดตั้งแล้ว Windows เตือน "ไม่รู้จักผู้เผยแพร่" | ปกติ (ยังไม่ได้ code-sign) — กด More info → Run anyway · ใช้ส่วนตัวไม่ต้อง sign |

---

## อัปเดตเวอร์ชันใหม่ (auto-update)

แอปมี **auto-update ในตัว** (electron-updater) — เปิดแอปจะเช็ค host ที่ตั้งใน `package.json > build.publish.url`
ถ้ามีเวอร์ชันใหม่กว่า → โหลดเงียบ ๆ → ติดตั้งตอนปิดแอป (ข้อมูลที่ `~\.vgap` ไม่หาย)

### วิธีปล่อยอัปเดต (ทำทุกครั้งที่มีเวอร์ชันใหม่)
1. แก้เลขเวอร์ชันใน `electron\package.json` → `"version"` (เช่น `1.0.0` → `1.0.1`) — **ต้องสูงขึ้นเสมอ**
2. build ใหม่: `powershell -ExecutionPolicy Bypass -File build-win.ps1`
3. เอา 3 ไฟล์นี้จาก `dist\` ไปวางที่ host (URL เดียวกับที่ตั้งใน package.json):
   - `latest.yml`  ← ตัวบอกเวอร์ชันล่าสุด (สำคัญสุด)
   - `VDO Gen Auto Pilot Setup x.x.x.exe`
   - `VDO Gen Auto Pilot Setup x.x.x.exe.blockmap`  ← ทำให้โหลดอัปเดตเร็ว (โหลดเฉพาะส่วนต่าง)
4. เครื่องลูกค้าที่เปิดแอปครั้งถัดไป จะอัปเดตเองอัตโนมัติ

### host วางไฟล์อัปเดตที่ไหนได้บ้าง
อะไรก็ได้ที่เสิร์ฟไฟล์ผ่าน HTTPS ตรง ๆ: VPS + nginx, static host, object storage (S3/R2/Spaces), ฯลฯ
URL ใน package.json ต้องชี้ไป "โฟลเดอร์" ที่วาง `latest.yml` (เช่น `https://yourhost.com/vgap/`)
> ใช้ส่วนตัว: VPS เล็ก ๆ หรือ object storage ก็พอ — แค่ต้องเป็น HTTPS และเข้าถึงไฟล์ได้ตรง

## หมายเหตุ
- ตัวติดตั้งจะใหญ่ ~150-250MB (รวม Python runtime + scrcpy + ffmpeg) — ปกติ
- ไอคอนตอนนี้เป็น **placeholder** (`electron\assets\icon.ico`) เปลี่ยนได้โดยรัน `python electron\assets\make_icon.py` ใหม่ หรือเอา .ico ตัวจริงมาทับ
- build Mac (.dmg) — **ใช้ `build-dmg.command`** บนเครื่อง Mac (ดับเบิลคลิก หรือ `bash build-dmg.command`)
  เป็นทางส่งมอบจริงฝั่ง Mac: หุ้ม payload (เว็บ+สคริปต์) เป็น `.dmg` ไฟล์เดียวด้วย `hdiutil` → ผู้ใช้ดับเบิลคลิก
  แล้วรัน `ติดตั้ง-mac-noadmin.command` (ไม่ต้อง code-signing / ไม่ต้อง electron / ไม่ต้อง PyInstaller)
  > `electron/package.json` มี target `dmg` (electron-builder) ค้างไว้เป็นแนวทางในอนาคตเท่านั้น —
  > **ยังไม่ใช่ทางส่งมอบ** เพราะต้องมี mac binaries ใน `electron/bin` + backend PyInstaller ก่อน ถึงจะได้ .app ที่ใช้ได้
