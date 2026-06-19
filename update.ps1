# update.ps1 - pull latest code, rebuild web only if UI changed
# Run this whenever fixes are pushed:  powershell -ExecutionPolicy Bypass -File update.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

Write-Host "=== git pull ===" -ForegroundColor Cyan
$before = (git rev-parse HEAD)
git pull
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

Write-Host "`nDONE. Restart the app: double-click stop.bat, then open.vbs" -ForegroundColor Green
