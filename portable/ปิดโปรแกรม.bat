@echo off
chcp 65001 >nul
taskkill /im vgap-server.exe /f >nul 2>&1
echo ปิดโปรแกรมเรียบร้อยแล้ว
timeout /t 2 >nul
