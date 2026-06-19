@echo off
taskkill /im python.exe /f >nul 2>&1
taskkill /im pythonw.exe /f >nul 2>&1
echo Stopped.
timeout /t 2 >nul
