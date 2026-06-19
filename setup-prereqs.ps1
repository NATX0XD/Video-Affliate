# setup-prereqs.ps1 — ติดตั้งเครื่องมือที่ต้องใช้ทั้งหมด + ใส่ PATH (ทำครั้งเดียวต่อเครื่อง)
# Python 3.11 · Node.js · adb · scrcpy v4.0 · ffmpeg  แล้วลง dependency + build หน้าเว็บ
#
# รัน (คลิกขวา → Run with PowerShell  หรือ):
#   powershell -ExecutionPolicy Bypass -File setup-prereqs.ps1
#
# วิธีนี้รันจาก "Python จริง" (ไม่ใช่ .exe) → ไม่โดน Antivirus จับ false positive

$ErrorActionPreference = "Stop"
$root  = $PSScriptRoot
$tools = "$env:LOCALAPPDATA\vgap-tools"
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Add-UserPath($dir) {
  $cur = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($cur -notlike "*$dir*") { [Environment]::SetEnvironmentVariable("Path", "$dir;$cur", "User") }
  $env:Path = "$dir;$env:Path"                       # ใช้ได้ทันทีใน session นี้
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host "ไม่พบ winget — ต้องเป็น Windows 10 (1809+) / 11 และอัปเดต 'App Installer' จาก Microsoft Store ก่อน" -ForegroundColor Red
  exit 1
}
function Winget-Install($id) {
  winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {   # -1978335189 = ติดตั้งอยู่แล้ว
    Write-Host "  เตือน: winget $id คืนค่า $LASTEXITCODE (อาจติดตั้งอยู่แล้ว/ต้องเช็ค)" -ForegroundColor Yellow
  }
}

Write-Host "`n=== [1/6] Python 3.11 ===" -ForegroundColor Cyan
Winget-Install "Python.Python.3.11"

Write-Host "`n=== [2/6] Node.js LTS ===" -ForegroundColor Cyan
Winget-Install "OpenJS.NodeJS.LTS"

Write-Host "`n=== [3/6] ffmpeg ===" -ForegroundColor Cyan
Winget-Install "Gyan.FFmpeg"

# refresh PATH ให้ session นี้เห็น python/node/ffmpeg ที่เพิ่งลง
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

Write-Host "`n=== [4/6] adb (Android platform-tools) ===" -ForegroundColor Cyan
Invoke-WebRequest "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile "$tools\pt.zip"
Expand-Archive "$tools\pt.zip" -DestinationPath $tools -Force
Add-UserPath "$tools\platform-tools"

Write-Host "`n=== [5/6] scrcpy v4.0 (ตรึงให้ตรงกับโค้ด) ===" -ForegroundColor Cyan
Invoke-WebRequest "https://github.com/Genymobile/scrcpy/releases/download/v4.0/scrcpy-win64-v4.0.zip" -OutFile "$tools\scrcpy.zip"
Expand-Archive "$tools\scrcpy.zip" -DestinationPath "$tools\scrcpy" -Force
$scd = (Get-ChildItem "$tools\scrcpy" -Directory)[0].FullName
Add-UserPath $scd

Write-Host "`n=== [6/6] ติดตั้ง dependency + build หน้าเว็บ ===" -ForegroundColor Cyan
Push-Location "$root\desktop"; python -m pip install --upgrade pip; python -m pip install -r requirements.txt; Pop-Location
Push-Location "$root\web";     npm install; npm run build;        Pop-Location

Write-Host "`nตรวจเครื่องมือ:" -ForegroundColor Cyan
foreach ($c in "python","node","adb","scrcpy","ffmpeg") {
  $p = (Get-Command $c -ErrorAction SilentlyContinue)
  Write-Host ("  {0,-8} {1}" -f $c, ($(if ($p) { "OK ✓" } else { "ไม่พบ ✗" })))
}

Write-Host "`nเสร็จ! ปิด PowerShell นี้ แล้วดับเบิลคลิก 'เปิดโปรแกรม.vbs' เพื่อใช้งานได้เลย" -ForegroundColor Green
