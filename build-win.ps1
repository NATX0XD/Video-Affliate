# build-win.ps1 — สร้าง installer .exe ของ VDO Gen Auto Pilot (Windows x64)
# รันใน PowerShell ที่ root ของ repo:  powershell -ExecutionPolicy Bypass -File build-win.ps1
# ต้องมีก่อน: Node.js, Python 3.11 (+pip), และวาง binary ใน electron\bin\ (ดู electron\bin\README.md)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "`n=== [1/4] ตรวจ binary ที่ต้องแถม (electron\bin) ===" -ForegroundColor Cyan
$need = @("adb.exe", "scrcpy.exe", "scrcpy-server", "ffmpeg.exe")
$missing = $need | Where-Object { -not (Test-Path (Join-Path $root "electron\bin\$_")) }
if ($missing) {
  Write-Host "ขาดไฟล์ใน electron\bin\: $($missing -join ', ')" -ForegroundColor Red
  Write-Host "ดูวิธีหาไฟล์ใน electron\bin\README.md แล้วรันใหม่" -ForegroundColor Yellow
  exit 1
}
Write-Host "binary ครบ ✓" -ForegroundColor Green

Write-Host "`n=== [2/4] build web (Next static export → web\out) ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "web")
npm install
npm run build
Pop-Location

Write-Host "`n=== [3/4] build backend (PyInstaller → desktop\dist\vgap-server.exe) ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "desktop")
pip install -r requirements.txt
pip install pyinstaller
pyinstaller --noconfirm vgap-server.spec
Pop-Location

Write-Host "`n=== [4/4] build electron installer (→ dist\*.exe) ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "electron")
npm install
npm run build:win
Pop-Location

Write-Host "`nเสร็จ! ตัวติดตั้งอยู่ที่โฟลเดอร์ dist\ — ส่งไฟล์ Setup .exe ให้คลิกติดตั้งได้เลย" -ForegroundColor Green
