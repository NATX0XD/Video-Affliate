# run-windows.ps1 — รัน VDO Gen Auto Pilot แบบ localhost บน Windows
# เครื่องนี้ = server + เก็บ DB เอง (desktop\data\app.db) เปิดเบราว์เซอร์เข้า localhost ใช้งาน
# รัน: powershell -ExecutionPolicy Bypass -File run-windows.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "`n=== [1/3] ติดตั้ง dependency ฝั่ง Python ===" -ForegroundColor Cyan
Push-Location "$root\desktop"
pip install -r requirements.txt
Pop-Location

Write-Host "`n=== [2/3] เตรียมหน้าเว็บ (build ครั้งแรกถ้ายังไม่มี) ===" -ForegroundColor Cyan
if (-not (Test-Path "$root\web\out\index.html")) {
  Write-Host "ยังไม่มี web\out → build ครั้งเดียว (ต้องมี Node.js)..." -ForegroundColor Yellow
  Push-Location "$root\web"
  npm install
  npm run build
  Pop-Location
} else {
  Write-Host "มี web\out แล้ว — ข้าม (ถ้าแก้ UI ค่อยลบ web\out แล้วรันใหม่ให้ build รอบใหม่)"
}

Write-Host "`n=== [3/3] รัน server → http://localhost:3001 ===" -ForegroundColor Cyan
Write-Host "DB เก็บที่ desktop\data\app.db (เครื่องนี้เอง) · ปิดด้วย Ctrl+C" -ForegroundColor Green
Write-Host "เปิดเบราว์เซอร์ไปที่ http://localhost:3001`n" -ForegroundColor Green
Push-Location "$root\desktop"
python main.py
Pop-Location
