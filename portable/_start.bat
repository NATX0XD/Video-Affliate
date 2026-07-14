@echo off
rem ตัวรันจริง (ถูกเรียกแบบซ่อนหน้าต่างโดย เปิดโปรแกรม.vbs) — อย่าดับเบิลคลิกไฟล์นี้ตรง ๆ
cd /d "%~dp0"
set "PATH=%~dp0bin;%PATH%"
set "SCRCPY_SERVER_PATH=%~dp0bin\scrcpy-server"
set "VGAP_DATA_DIR=%~dp0data"
set "VGAP_OPEN_BROWSER=1"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
"%~dp0vgap-server.exe"
