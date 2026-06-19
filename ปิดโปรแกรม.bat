@echo off
chcp 65001 >nul
taskkill /im python.exe /f >nul 2>&1
taskkill /im pythonw.exe /f >nul 2>&1
echo ปิดโปรแกรมเรียบร้อยแล้ว
timeout /t 2 >nul
