@echo off
rem ตัวรันจริง (ถูกเรียกแบบซ่อนหน้าต่างโดย เปิดโปรแกรม.vbs)
rem ดับเบิลคลิกไฟล์นี้ตรง ๆ ได้ ถ้าอยากเห็น log/error (จะโชว์หน้าต่างดำ)
cd /d "%~dp0desktop"
set "VGAP_OPEN_BROWSER=1"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
python main.py
