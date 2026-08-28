@echo off
chcp 65001 >nul
title VDO Gen Auto Pilot - Setup
cd /d "%~dp0"

echo.
echo ==================================================
echo    VDO Gen Auto Pilot - ตัวติดตั้ง (ครั้งเดียวจบ)
echo ==================================================
echo.
echo กำลังติดตั้งเครื่องมือที่จำเป็น: Python, adb, scrcpy, ffmpeg ...
echo ใช้เวลาประมาณ 5-10 นาที กรุณาอย่าปิดหน้าต่างนี้จนกว่าจะเสร็จ
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-prereqs.ps1"
if errorlevel 1 goto :setup_failed

echo.
echo กำลังสร้างทางลัดบนหน้าจอ Desktop ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d='%~dp0'; $vbs=Get-ChildItem -LiteralPath $d -Filter *.vbs | Select-Object -First 1; if(-not $vbs){exit 1}; $lnk=Join-Path ([Environment]::GetFolderPath('Desktop')) 'VDO Gen Auto Pilot.lnk'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath=$vbs.FullName; $s.WorkingDirectory=$vbs.DirectoryName; $s.Description='VDO Gen Auto Pilot'; $s.Save()"
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
exit

:setup_failed
echo.
echo ==================================================
echo    ติดตั้งไม่สำเร็จ
echo ==================================================
echo  สาเหตุที่พบบ่อยและวิธีแก้:
echo    - อินเทอร์เน็ตหลุด / ดาวน์โหลดไฟล์ไม่ได้  =^> ต่อเน็ตให้เสถียรแล้วรันไฟล์นี้ใหม่
echo    - ขึ้นว่าไม่พบ winget  =^> อัปเดต "App Installer" จาก Microsoft Store ก่อน
echo    - ติด SmartScreen/Antivirus  =^> กด "More info" แล้ว "Run anyway"
echo.
echo  ลองดับเบิลคลิก "ติดตั้ง.bat" ใหม่อีกครั้ง
echo.
echo  ส่ง log ให้ทีมงานดูได้ที่:
echo    %LOCALAPPDATA%\vgap-tools\setup-log.txt
echo.
pause
exit /b 1
