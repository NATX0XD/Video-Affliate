@echo off
chcp 65001 >nul
title VDO Gen Auto Pilot - ถอนการติดตั้ง
cd /d "%~dp0"
set "APPROOT=%~dp0"
if "%APPROOT:~-1%"=="\" set "APPROOT=%APPROOT:~0,-1%"

set "TOOLS=%LOCALAPPDATA%\vgap-tools"
if "%LOCALAPPDATA%"=="" set "TOOLS=%USERPROFILE%\AppData\Local\vgap-tools"
set "DATA=%USERPROFILE%\.vgap"
set "PY311DIR=%LOCALAPPDATA%\Programs\Python\Python311"

rem โฟลเดอร์โปรแกรมจริงหรือเปล่า - กันเผลอวางไฟล์นี้ไว้ใน Downloads แล้วลบทั้ง Downloads
set "ISROOT=0"
if exist "%APPROOT%\desktop\main.py" if exist "%APPROOT%\web" if exist "%APPROOT%\extension" set "ISROOT=1"

echo.
echo ==================================================
echo    ถอนการติดตั้ง VDO Gen Auto Pilot
echo ==================================================
echo.
echo  จะลบทั้งหมดนี้ (เฉพาะในบัญชีผู้ใช้นี้ ไม่แตะระบบ Windows):
echo.
echo    - %TOOLS%
echo      เครื่องมือ adb / scrcpy / ffmpeg + log ติดตั้ง
echo    - %DATA%
echo      ฐานข้อมูล คลิป การตั้งค่า ทั้งหมด
echo    - ทางลัด "VDO Gen Auto Pilot" บนหน้าจอ Desktop
echo    - ค่า PATH ที่ตัวติดตั้งเพิ่มไว้
echo    - นโยบาย "ไม่ถามที่บันทึกไฟล์" ของ Chrome/Edge ที่ตัวติดตั้งตั้งไว้
if "%ISROOT%"=="1" (
  echo    - %APPROOT%
  echo      โฟลเดอร์โปรแกรมทั้งโฟลเดอร์
) else (
  echo    - ^(ไฟล์นี้ไม่ได้อยู่ในโฟลเดอร์โปรแกรม - จะไม่ลบโฟลเดอร์โปรแกรมให้^)
)
echo.
set "ANS="
set /p "ANS=  พิมพ์  yes  แล้วกด Enter เพื่อยืนยัน (อย่างอื่น = ยกเลิก): "
if /i not "%ANS%"=="yes" goto :cancelled

rem ถามเรื่อง Python แยกออกมานอกวงเล็บ - ถ้าอยู่ในบล็อก ( ) ตัวแปรที่เพิ่ง set /p จะยังไม่มีค่า
set "RMPY=0"
if not exist "%PY311DIR%\python.exe" goto :no_python
echo.
echo  เจอ Python 3.11 ที่ตัวติดตั้งลงไว้: %PY311DIR%
echo  ถ้าคุณไม่ได้ใช้ Python ทำอย่างอื่น ลบได้เลย
set "PANS="
set /p "PANS=  ลบ Python 3.11 ด้วยไหม (y = ลบ / อย่างอื่น = เก็บไว้): "
if /i "%PANS%"=="y" set "RMPY=1"
:no_python

echo.
echo === หยุดโปรแกรมที่รันอยู่ ===
taskkill /im python.exe  /f >nul 2>&1
taskkill /im pythonw.exe /f >nul 2>&1
taskkill /im scrcpy.exe  /f >nul 2>&1
if exist "%TOOLS%\platform-tools\adb.exe" "%TOOLS%\platform-tools\adb.exe" kill-server >nul 2>&1
taskkill /im adb.exe /f >nul 2>&1
echo   OK

echo.
echo === ลบไฟล์ ===
call :rmdir_if "%TOOLS%" "เครื่องมือ adb/scrcpy/ffmpeg"
call :rmdir_if "%DATA%"  "ข้อมูล + การตั้งค่า"
call :del_if   "%USERPROFILE%\Desktop\VDO Gen Auto Pilot.lnk" "ทางลัดบน Desktop"
call :del_if   "%PUBLIC%\Desktop\VDO Gen Auto Pilot.lnk"      "ทางลัดบน Desktop (ส่วนกลาง)"

echo.
echo === ล้างค่า PATH ===
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); if($p){$n=($p -split ';' | Where-Object { $_ -and ($_ -notlike '*vgap-tools*') }) -join ';'; [Environment]::SetEnvironmentVariable('Path',$n,'User'); Write-Host '  OK'} else { Write-Host '  ไม่มีอะไรต้องล้าง' }"

echo.
echo === คืนค่าเบราว์เซอร์ ===
rem ตอนติดตั้งเราปิด "ถามที่บันทึกทุกครั้ง" ไว้ด้วยนโยบายระดับผู้ใช้ - เอาออกให้ครบ
rem ลบเฉพาะค่าที่เราเขียน ไม่ลบทั้งคีย์ (เผื่อมีนโยบายอื่นของผู้ใช้/ที่ทำงานอยู่ด้วย)
reg delete "HKCU\Software\Policies\Google\Chrome"  /v PromptForDownloadLocation /f >nul 2>&1
reg delete "HKCU\Software\Policies\Microsoft\Edge" /v PromptForDownloadLocation /f >nul 2>&1
echo   OK - Chrome/Edge กลับมาถามที่บันทึกตามค่าเดิม

if "%RMPY%"=="1" (
  echo.
  echo === ลบ Python 3.11 ===
  call :rmdir_if "%PY311DIR%" "Python 3.11"
  "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); if($p){$n=($p -split ';' | Where-Object { $_ -and ($_ -notlike '*Programs\Python\Python311*') }) -join ';'; [Environment]::SetEnvironmentVariable('Path',$n,'User')}"
)

echo.
echo ==================================================
echo    ถอนการติดตั้งเรียบร้อย
echo ==================================================
echo.
echo  เหลืออีก 1 อย่างที่สคริปต์ลบให้ไม่ได้:
echo    ส่วนขยายใน Chrome - เปิด chrome://extensions แล้วกด Remove ที่ VDO Gen Auto Pilot
echo.

if not "%ISROOT%"=="1" goto :done
echo  กำลังลบโฟลเดอร์โปรแกรม: %APPROOT%
echo  หน้าต่างนี้จะปิดเอง
rem ลบโฟลเดอร์ที่ตัวเองอยู่ไม่ได้ตรง ๆ - เขียนตัวช่วยไว้ที่ TEMP แล้วให้มันลบทีหลัง
rem chcp 65001 ในตัวช่วยด้วย ไม่งั้นพาธที่มีภาษาไทยจะเพี้ยนแล้วลบไม่โดน
set "HELPER=%TEMP%\vgap-uninstall-rm.bat"
 >"%HELPER%" echo @echo off
>>"%HELPER%" echo chcp 65001 ^>nul
>>"%HELPER%" echo timeout /t 3 /nobreak ^>nul
>>"%HELPER%" echo rmdir /s /q "%APPROOT%"
>>"%HELPER%" echo del /f /q "%%~f0"
cd /d "%TEMP%"
start "" /min "%HELPER%"
timeout /t 2 /nobreak >nul
exit

:done
pause
exit /b 0

:cancelled
echo.
echo  ยกเลิกแล้ว ไม่มีอะไรถูกลบ
echo.
pause
exit /b 0

:rmdir_if
if exist %1 (
  rmdir /s /q %1
  if exist %1 ( echo   x ลบไม่ได้: %~2 - ปิดโปรแกรมที่ค้างอยู่แล้วรันใหม่ ) else ( echo   OK %~2 )
) else (
  echo   - %~2 ^(ไม่มีอยู่แล้ว^)
)
goto :eof

:del_if
if not exist %1 ( echo   - %~2 ^(ไม่มีอยู่แล้ว^) & goto :eof )
del /f /q %1 >nul 2>&1
if exist %1 ( echo   x ลบไม่ได้: %~2 ) else ( echo   OK %~2 )
goto :eof
