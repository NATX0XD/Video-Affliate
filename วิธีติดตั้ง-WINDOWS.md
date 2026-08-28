# ติดตั้งบน Windows (รันจาก Python จริง — ไม่ชน Antivirus)

แนวนี้ลง Python จริงในเครื่อง แล้วรันจาก source → **ไม่โดน Antivirus จับ** เหมือนตัว .exe
ตั้งครั้งเดียว (คุณ) → จากนั้นพ่อดับเบิลคลิกอันเดียวใช้ได้ทุกวัน

---

## ตั้งครั้งเดียว (คุณทำ)

### 1. เอาโค้ดลงเครื่อง
- มี Git: `git clone https://github.com/NATX0XD/Video-Affliate` (หรือโหลด zip จากปุ่ม Code → Download ZIP แล้วแตกไฟล์)

### 2. ติดตั้งเครื่องมือทั้งหมด (คำสั่งเดียว)
เปิด PowerShell ในโฟลเดอร์โปรเจกต์ แล้วรัน:
```powershell
powershell -ExecutionPolicy Bypass -File setup-prereqs.ps1
```
สคริปต์จะลงให้: **Python 3.11 · adb · scrcpy v4.0 · ffmpeg** (+ ใส่ PATH)
> โหลดไฟล์ตรงจากต้นทาง **ไม่ใช้ winget ไม่ต้องสิทธิ์แอดมิน** · ใช้เวลา ~5-10 นาที
> โฟลเดอร์นี้มี `web\out` มาให้แล้ว จึง **ไม่ต้องลง Node** (จะลงให้เฉพาะตอนไม่มี `web\out`)
> ล้มขั้นไหนจะบอกชัดแล้วไปต่อ — log เต็มอยู่ที่ `%LOCALAPPDATA%\vgap-tools\setup-log.txt`

**ถ้าติดตั้งไม่สำเร็จแล้วหา log ไม่เจอ** แปลว่า PowerShell รันสคริปต์ไม่ได้เลย (นโยบายองค์กร / Antivirus บล็อก)
เปิด **Command Prompt** แล้ววางคำสั่งนี้เพื่อดูข้อความ error ตัวจริง:
```bat
cd /d "โฟลเดอร์ที่แตกไฟล์ไว้"
powershell -NoProfile -ExecutionPolicy Bypass -File setup-prereqs.ps1
```
ถ้าขึ้นว่า *running scripts is disabled* ให้รันแบบเลี่ยงนโยบายไฟล์:
```bat
powershell -NoProfile -Command "$s=Get-Content setup-prereqs.ps1 -Raw -Encoding UTF8; Invoke-Expression $s"
```

### 3. ตั้งค่าใช้งานครั้งแรก
- เปิดโปรแกรม (ดับเบิลคลิก `เปิดโปรแกรม.vbs`) → ไปหน้า **Settings** → ใส่ Google API key
- เสียบมือถือ + เปิด **USB debugging** → กด Allow · ลงแอป **ADBKeyboard**
- โหลด **Chrome extension** (โฟลเดอร์ `extension`) เข้า Chrome

---

## ใช้งานทุกวัน (พ่อทำ)
- **เปิด:** ดับเบิลคลิก **`เปิดโปรแกรม.vbs`** → รอ 2-3 วิ เบราว์เซอร์เด้งเปิดเอง (http://localhost:3001)
- **ปิด:** ดับเบิลคลิก **`ปิดโปรแกรม.bat`** (หรือปิดเครื่อง)

ถ้าเบราว์เซอร์ไม่เด้งเอง: เปิดเบราว์เซอร์พิมพ์ `http://localhost:3001`

---

## เวลามีอัปเดต
```powershell
git pull                 # ดึงโค้ดใหม่
cd web; npm run build     # ถ้าหน้าเว็บมีแก้
```
แล้วเปิดใหม่ตามปกติ — ข้อมูล (DB/ตั้งค่า/คลิป) อยู่ที่ `desktop\data\` ไม่หาย

## ถอนการติดตั้ง
ดับเบิลคลิก **`ถอนการติดตั้ง.bat`** → พิมพ์ `yes` ยืนยัน

ลบให้ครบ: `%LOCALAPPDATA%\vgap-tools` (adb/scrcpy/ffmpeg) · `%USERPROFILE%\.vgap` (ฐานข้อมูล/คลิป/ตั้งค่า) · ทางลัด Desktop · ค่า PATH · โฟลเดอร์โปรแกรมทั้งโฟลเดอร์
Python 3.11 ถามก่อนลบ (เผื่อใช้ทำอย่างอื่นอยู่) · **ส่วนขยาย Chrome ต้องกด Remove เองที่ `chrome://extensions`**

## แก้ปัญหา
| อาการ | แก้ |
|---|---|
| `setup-prereqs.ps1` บอกไม่พบ winget | อัปเดต "App Installer" จาก Microsoft Store ก่อน |
| เปิดแล้วเบราว์เซอร์ไม่เด้ง / ไม่ขึ้นอะไร | ดับเบิลคลิก `_run-source.bat` แทน (โชว์หน้าต่างดำ + error) แล้วส่งรูปมา |
| `python`/`adb` ไม่เจอหลังลงเสร็จ | ปิด-เปิด PowerShell/เครื่องใหม่ (PATH เพิ่งเพิ่ม) |
