@echo off
cd /d "%~dp0"
echo ==================================
echo   Updating VDO Gen Auto Pilot...
echo ==================================
powershell -ExecutionPolicy Bypass -File "%~dp0update.ps1"
echo.
echo Restarting app...
taskkill /im python.exe /f  >nul 2>&1
taskkill /im pythonw.exe /f >nul 2>&1
timeout /t 2 >nul
start "" "%~dp0เปิดโปรแกรม.vbs"
echo.
echo DONE. Open your browser at:  http://localhost:3001
timeout /t 5 >nul
