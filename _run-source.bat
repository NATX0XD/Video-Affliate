@echo off
rem ตัวรันจริง (ถูกเรียกแบบซ่อนหน้าต่างโดย เปิดโปรแกรม.vbs)
rem ดับเบิลคลิกไฟล์นี้ตรง ๆ ได้ ถ้าอยากเห็น log/error (จะโชว์หน้าต่างดำ)
cd /d "%~dp0desktop"
set "VGAP_OPEN_BROWSER=1"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
rem ใช้ Python 3.11 ที่ setup ลงไว้ก่อน (PATH อาจยังไม่ refresh หลังติดตั้ง / กันไปเจอ python เวอร์ชันอื่น)
set "PY311=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if exist "%PY311%" (
  "%PY311%" main.py
) else (
  python main.py
)
