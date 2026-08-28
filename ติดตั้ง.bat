@echo off
chcp 65001 >nul
title VDO Gen Auto Pilot - Setup
cd /d "%~dp0"

rem ── เตรียม log ก่อนเรียก PowerShell ─────────────────────────────────────
rem เดิม log ถูกสร้างในไฟล์ .ps1 เท่านั้น พอ PowerShell โหลดสคริปต์ไม่ได้ (นโยบายองค์กร /
rem AV บล็อก / ไฟล์ติด Mark-of-the-Web) จะไม่มี log เลย แต่ .bat กลับบอกให้ไปดู log ที่ไม่มีอยู่
set "LOGDIR=%LOCALAPPDATA%\vgap-tools"
if "%LOCALAPPDATA%"=="" set "LOGDIR=%USERPROFILE%\AppData\Local\vgap-tools"
set "LOG=%LOGDIR%\setup-log.txt"
set "FLAG=%LOGDIR%\started.flag"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul
if not exist "%LOGDIR%" (
  echo [!] สร้างโฟลเดอร์ log ไม่ได้: %LOGDIR%
  set "LOG=%~dp0setup-log.txt"
  set "FLAG=%~dp0started.flag"
)
del "%FLAG%" 2>nul
echo. >>"%LOG%"
echo ==== launcher %DATE% %TIME% ==== >>"%LOG%"
echo folder: %~dp0 >>"%LOG%"

echo.
echo ==================================================
echo    VDO Gen Auto Pilot - ตัวติดตั้ง (ครั้งเดียวจบ)
echo ==================================================
echo.
echo กำลังติดตั้งเครื่องมือที่จำเป็น: Python, adb, scrcpy, ffmpeg ...
echo ใช้เวลาประมาณ 5-10 นาที กรุณาอย่าปิดหน้าต่างนี้จนกว่าจะเสร็จ
echo.

rem ── หา PowerShell ───────────────────────────────────────────────────────
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%PS%" goto :ps_ok
set "PS=powershell.exe"
where /q powershell.exe && goto :ps_ok
where /q pwsh.exe && set "PS=pwsh.exe"
:ps_ok
echo powershell: %PS% >>"%LOG%"

rem ปลดล็อก Mark-of-the-Web (ไฟล์ที่แตกจาก zip ที่โหลดจากเน็ตจะถูกบล็อก)
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >>"%LOG%" 2>&1

rem ── รันตัวติดตั้ง (วิธีที่ 1: -File) ────────────────────────────────────
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-prereqs.ps1"
set "RC=%ERRORLEVEL%"

rem ถ้าไม่มีธง = PowerShell ไม่เคยเริ่มรันสคริปต์เลย (ไม่ใช่ติดตั้งล้ม) ลองวิธีที่ 2
if exist "%FLAG%" goto :after_run
echo. >>"%LOG%"
echo [retry] -File not working ^(rc=%RC%^) trying Invoke-Expression >>"%LOG%"
echo.
echo   PowerShell โหลดไฟล์สคริปต์ไม่ได้ - กำลังลองวิธีสำรอง ...
echo.
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%~dp0'; $s = Get-Content -LiteralPath '%~dp0setup-prereqs.ps1' -Raw -Encoding UTF8; Invoke-Expression $s"
set "RC=%ERRORLEVEL%"

:after_run
if not "%RC%"=="0" goto :setup_failed
if not exist "%FLAG%" goto :setup_failed

echo.
echo กำลังสร้างทางลัดบนหน้าจอ Desktop ...
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "$d='%~dp0'; $vbs=Get-ChildItem -LiteralPath $d -Filter *.vbs | Select-Object -First 1; if(-not $vbs){exit 1}; $lnk=Join-Path ([Environment]::GetFolderPath('Desktop')) 'VDO Gen Auto Pilot.lnk'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath=$vbs.FullName; $s.WorkingDirectory=$vbs.DirectoryName; $s.Description='VDO Gen Auto Pilot'; $s.Save()" >>"%LOG%" 2>&1
if errorlevel 1 (
  echo   ! สร้างทางลัดไม่สำเร็จ - ไม่เป็นไร เปิดโปรแกรมได้จากไฟล์ "เปิดโปรแกรม.vbs" ในโฟลเดอร์นี้
)

echo.
echo ==================================================
echo    ติดตั้งเสร็จแล้ว!
echo ==================================================
echo.
echo  กำลังเปิดโปรแกรมให้อัตโนมัติ... รอสักครู่
echo  (เบราว์เซอร์จะเด้งหน้าโปรแกรมเองที่ http://localhost:3001)
echo.
rem เปิดโปรแกรมให้เลย — เดิมจบแค่สร้างทางลัดแล้วบอกให้กดเอง ผู้ใช้เลยคิดว่าติดตั้งไม่สำเร็จ
start "" "%~dp0เปิดโปรแกรม.vbs"
echo  ครั้งต่อไปเปิดได้จาก:
echo    - ทางลัด "VDO Gen Auto Pilot" บนหน้าจอ Desktop
echo    - หรือไฟล์ "เปิดโปรแกรม.vbs" ในโฟลเดอร์นี้
echo.
echo  หน้าต่างนี้จะปิดเองใน 10 วินาที...
timeout /t 10 /nobreak >nul
exit /b 0

:setup_failed
echo.
echo ==================================================
echo    ติดตั้งไม่สำเร็จ (rc=%RC%)
echo ==================================================
if not exist "%FLAG%" (
  echo.
  echo  PowerShell รันสคริปต์ไม่ได้เลย มักเกิดจาก:
  echo    - นโยบายองค์กร/Group Policy ปิดการรันสคริปต์
  echo    - Antivirus บล็อก powershell.exe
  echo    - ไฟล์ setup-prereqs.ps1 หายไปจากโฟลเดอร์นี้
  echo.
  echo  วิธีแก้ที่ได้ผลบ่อย: คลิกขวาไฟล์นี้ =^> "Run as administrator"
)
echo.
echo  รายละเอียดล่าสุดจาก log:
echo  --------------------------------------------------
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%LOG%' -Tail 25 -ErrorAction SilentlyContinue" 2>nul
echo  --------------------------------------------------
echo.
echo  log เต็มอยู่ที่:  %LOG%
echo  (คัดลอกพาธนี้ไปวางในช่องที่อยู่ของ File Explorer ได้เลย)
echo.
pause
exit /b 1
