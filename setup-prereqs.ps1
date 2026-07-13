# setup-prereqs.ps1 - install everything via direct download (NO winget, NO admin needed)
# Installs: Python 3.11, Node.js (portable), adb, scrcpy v4.0, ffmpeg (+ PATH), pip deps, build web
# Run:  powershell -ExecutionPolicy Bypass -File setup-prereqs.ps1

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # speeds up Invoke-WebRequest a lot
$root  = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$tools = Join-Path $env:LOCALAPPDATA "vgap-tools"
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Add-UserPath($dir) {
  $cur = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($cur -notlike "*$dir*") { [Environment]::SetEnvironmentVariable("Path", "$dir;$cur", "User") }
  $env:Path = "$dir;$env:Path"
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "`n=== [1/6] Python 3.11 ===" -ForegroundColor Cyan
if (Have "python") {
  Write-Host "  already installed"
} else {
  $py = "$tools\python-3.11.9-amd64.exe"
  Write-Host "  downloading installer..."
  Invoke-WebRequest "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $py
  Write-Host "  installing (per-user, no admin)..."
  Start-Process $py -ArgumentList "/quiet","InstallAllUsers=0","PrependPath=1","Include_pip=1","Include_launcher=1" -Wait
  Refresh-Path
  $pyDir = "$env:LOCALAPPDATA\Programs\Python\Python311"
  if (-not (Have "python") -and (Test-Path "$pyDir\python.exe")) { Add-UserPath $pyDir; Add-UserPath "$pyDir\Scripts" }
}

Write-Host "`n=== [2/6] Node.js LTS (portable) ===" -ForegroundColor Cyan
if (Have "node") {
  Write-Host "  already installed"
} else {
  Write-Host "  finding latest v20 LTS..."
  $idx = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $lts = ($idx | Where-Object { $_.lts -and $_.version -like 'v20.*' } | Select-Object -First 1).version
  Write-Host "  downloading Node $lts ..."
  Invoke-WebRequest "https://nodejs.org/dist/$lts/node-$lts-win-x64.zip" -OutFile "$tools\node.zip"
  Expand-Archive "$tools\node.zip" -DestinationPath "$tools\node" -Force
  $nodeDir = (Get-ChildItem "$tools\node" -Directory | Select-Object -First 1).FullName
  Add-UserPath $nodeDir
}

Write-Host "`n=== [3/6] adb (Android platform-tools) ===" -ForegroundColor Cyan
if (Have "adb") {
  Write-Host "  already installed"
} else {
  Invoke-WebRequest "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile "$tools\pt.zip"
  Expand-Archive "$tools\pt.zip" -DestinationPath $tools -Force
  Add-UserPath "$tools\platform-tools"
}

Write-Host "`n=== [4/6] scrcpy v4.0 (pinned to match code) ===" -ForegroundColor Cyan
if (Have "scrcpy") {
  Write-Host "  already installed"
} else {
  Invoke-WebRequest "https://github.com/Genymobile/scrcpy/releases/download/v4.0/scrcpy-win64-v4.0.zip" -OutFile "$tools\scrcpy.zip"
  Expand-Archive "$tools\scrcpy.zip" -DestinationPath "$tools\scrcpy" -Force
  $scd = (Get-ChildItem "$tools\scrcpy" -Directory | Select-Object -First 1).FullName
  Add-UserPath $scd
}

Write-Host "`n=== [5/6] ffmpeg ===" -ForegroundColor Cyan
if (Have "ffmpeg") {
  Write-Host "  already installed"
} else {
  Invoke-WebRequest "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -OutFile "$tools\ff.zip"
  Expand-Archive "$tools\ff.zip" -DestinationPath "$tools\ff" -Force
  $ffbin = (Get-ChildItem "$tools\ff" -Recurse -Filter ffmpeg.exe | Select-Object -First 1).Directory.FullName
  Add-UserPath $ffbin
}

Refresh-Path

Write-Host "`n=== [6/6] pip deps + build web ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "desktop")
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Pop-Location
# หน้าเว็บ: ถ้ามี web\out อยู่แล้ว (แจกแบบ prebuilt) → ข้าม build ได้เลย ไม่ต้องใช้ Node
if (Test-Path (Join-Path $root "web\out\index.html")) {
  Write-Host "  web\out พร้อมแล้ว — ข้าม build (ไม่ต้องลง Node)"
} else {
  Push-Location (Join-Path $root "web")
  npm install
  npm run build
  Pop-Location
}

Write-Host "`n--- tool check ---" -ForegroundColor Cyan
foreach ($c in "python","node","adb","scrcpy","ffmpeg") {
  $mark = if (Have $c) { "OK" } else { "MISSING" }
  Write-Host ("  {0,-8} {1}" -f $c, $mark)
}

Write-Host "`nDONE. Close this PowerShell, then double-click 'เปิดโปรแกรม.vbs' to start." -ForegroundColor Green
