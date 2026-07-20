@echo off
rem ตัวรันจริง (ถูกเรียกแบบซ่อนหน้าต่างโดย เปิดโปรแกรม.vbs) — อย่าดับเบิลคลิกไฟล์นี้ตรง ๆ
cd /d "%~dp0"
set "PATH=%~dp0bin;%PATH%"
set "SCRCPY_SERVER_PATH=%~dp0bin\scrcpy-server"
set "VGAP_DATA_DIR=%~dp0data"
set "VGAP_OPEN_BROWSER=1"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
rem เก็บ log ไว้ debug — ถ้า "เปิดแล้วไม่มีอะไรเกิดขึ้น" ให้เปิดดู data\server.log
if not exist "%~dp0data" mkdir "%~dp0data"
"%~dp0vgap-server.exe" > "%~dp0data\server.log" 2>&1
