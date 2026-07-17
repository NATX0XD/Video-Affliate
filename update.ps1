# update.ps1 - pull latest code, rebuild web only if UI changed
# Run this whenever fixes are pushed:  powershell -ExecutionPolicy Bypass -File update.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

Write-Host "=== get latest code ===" -ForegroundColor Cyan
$before = (git rev-parse HEAD)
git fetch origin

# กันข้อมูลผู้ใช้หาย: reset --hard ลบ desktop\settings.json ที่ผู้ใช้แก้ไว้ (พอเวอร์ชันใหม่
# เปลี่ยนเป็น untracked+gitignore) ก่อน config.py จะได้ย้าย → เซฟ settings.json ไป ~/.vgap ก่อน reset.
$vgap = Join-Path $HOME '.vgap'
New-Item -ItemType Directory -Force -Path $vgap | Out-Null
if ((Test-Path 'desktop\settings.json') -and -not (Test-Path (Join-Path $vgap 'settings.json'))) {
  Copy-Item 'desktop\settings.json' (Join-Path $vgap 'settings.json')
}

git reset --hard origin/main          # ชัวร์กว่า git pull (ไม่ต้องตั้ง branch tracking)
$after  = (git rev-parse HEAD)

if ($before -eq $after) {
  Write-Host "already up to date" -ForegroundColor Green
} else {
  $changed = git diff --name-only $before $after
  if ($changed -match '^web/') {
    Write-Host "=== UI changed -> rebuild web ===" -ForegroundColor Cyan
    Push-Location "$root\web"; npm run build; Pop-Location
  } else {
    Write-Host "backend-only update - no web rebuild needed" -ForegroundColor Green
  }
}

Write-Host "`nDONE. Restart the app: double-click stop.bat, then เปิดโปรแกรม.vbs" -ForegroundColor Green
