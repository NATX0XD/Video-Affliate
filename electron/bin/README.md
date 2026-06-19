# bin/ — binary ที่แถมไปกับแอป (ทำให้ลูกค้าไม่ต้องติดตั้งอะไรเพิ่ม)

`electron/main.js` จะใส่โฟลเดอร์นี้ไว้หน้า `PATH` ตอนรัน backend (โหมด packaged)
และชี้ `SCRCPY_SERVER_PATH` มาที่ `scrcpy-server` ในนี้ → โค้ด Python เรียก
`adb` / `ffmpeg` / `scrcpy` ได้เลยโดยไม่ต้องให้เครื่องลูกค้ามีของเอง

## ต้องวางอะไร (สำหรับ build Windows x64)
วางไฟล์ทั้งหมดนี้ "แบน ๆ" ในโฟลเดอร์ `electron/bin/` :

- `adb.exe` + `AdbWinApi.dll` + `AdbWinUsbApi.dll`
  ← จาก Android SDK Platform-Tools (Google) — https://developer.android.com/tools/releases/platform-tools
- `scrcpy.exe` + `scrcpy-server` + dll ที่มากับชุด (`avcodec*.dll`, `SDL2.dll`, ฯลฯ)
  ← จาก scrcpy releases (Genymobile) — https://github.com/Genymobile/scrcpy/releases (ชุด win64 zip)
  หมายเหตุ: ไฟล์ server ชื่อ `scrcpy-server` (ไม่มีนามสกุล) — ต้องมีตัวนี้
- `ffmpeg.exe`
  ← จาก https://www.gyan.dev/ffmpeg/builds/ (essentials) หรือ winget/choco แล้วก๊อปมา

## ลิขสิทธิ์ (redistribute ได้)
adb = Apache-2.0 · scrcpy = Apache-2.0 · ffmpeg = LGPL/GPL (ใช้ build LGPL ถ้ากังวล)
ใช้ส่วนตัวไม่มีปัญหาอยู่แล้ว

## ของ build Mac
ถ้าจะ build ฝั่ง Mac ด้วย ให้วาง binary ฉบับ mac (adb, scrcpy, scrcpy-server, ffmpeg — ไม่มี .exe)
แทนที่ในโฟลเดอร์นี้ก่อนสั่ง `npm run build:mac` (build ทีละ OS)
