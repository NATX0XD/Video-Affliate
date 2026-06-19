# setup-prereqs.ps1 - install all tools once (English-only output to avoid encoding issues)
# Installs: Python 3.11, Node.js, adb, scrcpy v4.0, ffmpeg (+ PATH), then pip deps + build web
# Run:  powershell -ExecutionPolicy Bypass -File setup-prereqs.ps1

$ErrorActionPreference = "Stop"
$root  = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$tools = Join-Path $env:LOCALAPPDATA "vgap-tools"
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Add-UserPath($dir) {
  $cur = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($cur -notlike "*$dir*") { [Environment]::SetEnvironmentVariable("Path", "$dir;$cur", "User") }
  $env:Path = "$dir;$env:Path"
}

function Winget-Install($id) {
  winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
    Write-Host ("  WARN: winget {0} returned {1} (maybe already installed)" -f $id, $LASTEXITCODE) -ForegroundColor Yellow
  }
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host "winget not found. Update 'App Installer' from Microsoft Store (Windows 10 1809+ / 11), then retry." -ForegroundColor Red
  exit 1
}

Write-Host "`n=== [1/6] Python 3.11 ===" -ForegroundColor Cyan
Winget-Install "Python.Python.3.11"

Write-Host "`n=== [2/6] Node.js LTS ===" -ForegroundColor Cyan
Winget-Install "OpenJS.NodeJS.LTS"

Write-Host "`n=== [3/6] ffmpeg ===" -ForegroundColor Cyan
Winget-Install "Gyan.FFmpeg"

# refresh PATH so python/node/ffmpeg are visible in this session
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

Write-Host "`n=== [4/6] adb (Android platform-tools) ===" -ForegroundColor Cyan
Invoke-WebRequest "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile "$tools\pt.zip"
Expand-Archive "$tools\pt.zip" -DestinationPath $tools -Force
Add-UserPath "$tools\platform-tools"

Write-Host "`n=== [5/6] scrcpy v4.0 (pinned to match code) ===" -ForegroundColor Cyan
Invoke-WebRequest "https://github.com/Genymobile/scrcpy/releases/download/v4.0/scrcpy-win64-v4.0.zip" -OutFile "$tools\scrcpy.zip"
Expand-Archive "$tools\scrcpy.zip" -DestinationPath "$tools\scrcpy" -Force
$scd = (Get-ChildItem "$tools\scrcpy" -Directory | Select-Object -First 1).FullName
Add-UserPath $scd

Write-Host "`n=== [6/6] pip deps + build web ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "desktop")
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Pop-Location
Push-Location (Join-Path $root "web")
npm install
npm run build
Pop-Location

Write-Host "`n--- tool check ---" -ForegroundColor Cyan
foreach ($c in "python","node","adb","scrcpy","ffmpeg") {
  $p = (Get-Command $c -ErrorAction SilentlyContinue)
  $mark = if ($p) { "OK" } else { "MISSING" }
  Write-Host ("  {0,-8} {1}" -f $c, $mark)
}

Write-Host "`nDONE. Close this PowerShell, then double-click 'open.vbs' to start." -ForegroundColor Green
