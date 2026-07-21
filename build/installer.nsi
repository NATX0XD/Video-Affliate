; ============================================================================
;  installer.nsi — VDO Gen Auto Pilot  (RUN-FROM-SOURCE Windows installer)
; ============================================================================
;  โหมด: RUN-FROM-SOURCE (ผู้ใช้ปลายทางรัน `python main.py` ผ่าน เปิดโปรแกรม.vbs)
;  จงใจ "ไม่" แพ็กด้วย PyInstaller/electron เพื่อเลี่ยง antivirus false-positive
;  (สาเหตุที่เจ้าของทิ้ง .exe แบบ compiled แต่แรก).
;
;  *** ตัวติดตั้งนี้ UNSIGNED (ไม่มีใบเซ็นโค้ด) ***
;  → Windows SmartScreen จะเตือน 1 ครั้งตอนเปิด: กด "More info" → "Run anyway"
;    ถือว่าปกติสำหรับ installer ที่ยังไม่ได้ซื้อ code-signing certificate.
;
;  ลักษณะการติดตั้ง:
;    - per-user, ไม่ต้องสิทธิ์ admin (RequestExecutionLevel user)
;    - ลงที่ $LOCALAPPDATA\VDO-Gen-AutoPilot
;    - ก๊อป payload ทั้งหมด (desktop source + web/out + electron/bin binaries + scripts)
;    - post-install รัน setup-prereqs.ps1 (ลง Python + adb/scrcpy/ffmpeg + PATH)
;    - สร้าง Start Menu + Desktop shortcut ชี้ไป เปิดโปรแกรม.vbs (WorkingDir = install dir)
;    - เขียน uninstaller + ลงทะเบียนใน "Apps & features" (HKCU)
;
;  หมายเหตุภาษา: ใช้ language pack = English (มีติดมากับ NSIS ทุกชุดแน่นอน)
;  แต่ข้อความที่ผู้ใช้เห็นเขียนเป็นภาษาไทยผ่าน custom strings + `Unicode true`
;  (เลี่ยงพึ่ง Thai.nlf ที่บาง build ของ NSIS อาจไม่มี → กัน compile fail บน CI).
;
;  คอมไพล์ (ทำบน Windows/CI เท่านั้น — Mac ทำไม่ได้):
;    makensis /DPAYLOAD_DIR=<abs path to payload> /DOUTFILE=<abs out.exe> installer.nsi
; ============================================================================

Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ---- ค่าที่ส่งเข้ามาจาก command line (มี default กันพลาด) ----
!ifndef PAYLOAD_DIR
  !define PAYLOAD_DIR "payload"          ; โฟลเดอร์ payload ที่ CI ประกอบไว้
!endif
!ifndef OUTFILE
  !define OUTFILE "VDO-Gen-Setup.exe"
!endif

!define APP_NAME    "VDO Gen Auto Pilot"
!define APP_SLUG    "VDO-Gen-AutoPilot"
!define LAUNCHER    "เปิดโปรแกรม.vbs"       ; ตัวเปิดโปรแกรม (run-from-source)
!define UNINST_KEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_SLUG}"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
RequestExecutionLevel user                 ; per-user → ไม่ต้อง admin
InstallDir "$LOCALAPPDATA\${APP_SLUG}"
InstallDirRegKey HKCU "Software\${APP_SLUG}" "InstallDir"
ShowInstDetails show
ShowUninstDetails show

; ---- หน้าตา MUI ----
!define MUI_ABORTWARNING
; logo จริงของแอป (app.ico อยู่ใน payload จาก portable/) — ไอคอนตัวติดตั้ง .exe + wizard + uninstaller
; guard: ถ้าไม่มี app.ico ใน payload → ใช้ไอคอน NSIS default (กัน makensis ล้มทั้ง build)
!if /FileExists "${PAYLOAD_DIR}\app.ico"
  !define MUI_ICON "${PAYLOAD_DIR}\app.ico"
  !define MUI_UNICON "${PAYLOAD_DIR}\app.ico"
!else
  !define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
  !define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!endif

; Welcome
!define MUI_WELCOMEPAGE_TITLE "ติดตั้ง ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "ตัวติดตั้งนี้จะติดตั้ง ${APP_NAME} แบบเฉพาะผู้ใช้ (ไม่ต้องใช้สิทธิ์ผู้ดูแลเครื่อง)$\r$\n$\r$\nโปรแกรมทำงานแบบรันจากซอร์ส (Python) จึงเลี่ยงปัญหาโปรแกรมกันไวรัสแจ้งเตือนผิดพลาด$\r$\n$\r$\nหมายเหตุ: ตัวติดตั้งนี้ยังไม่ได้เซ็นใบรับรอง (unsigned) — ถ้า Windows ขึ้นเตือน SmartScreen ให้กด $\"More info$\" แล้ว $\"Run anyway$\"$\r$\n$\r$\nกด ถัดไป เพื่อเริ่ม"
!insertmacro MUI_PAGE_WELCOME

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Finish — มีตัวเลือกเปิดโปรแกรมเลย
!define MUI_FINISHPAGE_TITLE "ติดตั้งเสร็จแล้ว"
!define MUI_FINISHPAGE_TEXT "ติดตั้ง ${APP_NAME} เรียบร้อย$\r$\n$\r$\nเปิดโปรแกรมได้จากทางลัดบนหน้าจอ (Desktop) หรือใน Start Menu$\r$\nเบราว์เซอร์จะเปิดหน้าโปรแกรมให้เองที่ http://localhost:3001"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_RUN_TEXT "เปิด ${APP_NAME} เดี๋ยวนี้"
!insertmacro MUI_PAGE_FINISH

; Uninstall pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ใช้ English language pack (มีแน่นอนทุก build) — ข้อความไทยมาจาก custom strings ข้างบน
!insertmacro MUI_LANGUAGE "English"

; ============================================================================
;  ติดตั้ง
; ============================================================================
Section "ติดตั้งโปรแกรม" SecMain
  SetShellVarContext current                ; per-user: Desktop/Start Menu ของผู้ใช้ปัจจุบัน
  SetOutPath "$INSTDIR"

  ; ---- payload ทั้งหมด (source + web/out + electron/bin + scripts) ----
  ; PAYLOAD_DIR ถูกประกอบไว้แล้วโดย CI (กรองไฟล์ที่ไม่ต้องการออกก่อนแล้ว)
  File /r "${PAYLOAD_DIR}\*"

  ; จำ install dir ไว้
  WriteRegStr HKCU "Software\${APP_SLUG}" "InstallDir" "$INSTDIR"

  ; ---- ทางลัด (WorkingDir = $INSTDIR เพราะ SetOutPath ตั้ง $OUTDIR = $INSTDIR แล้ว) ----
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${LAUNCHER}" "" "$INSTDIR\app.ico" 0 SW_SHOWNORMAL "" "${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\ถอนการติดตั้ง.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${LAUNCHER}" "" "$INSTDIR\app.ico" 0 SW_SHOWNORMAL "" "${APP_NAME}"

  ; ---- uninstaller + ลงทะเบียน Apps & features (per-user = HKCU) ----
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\app.ico"
  WriteRegStr   HKCU "${UNINST_KEY}" "Publisher"       "VDO Gen Auto Pilot"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  ; ---- post-install: ลง Python + เครื่องมือที่จำเป็น (binary มีใน electron/bin แล้ว) ----
  ; setup-prereqs.ps1 = no-admin per-user: ลง Python, เติม adb/scrcpy/ffmpeg + PATH,
  ; ติดตั้ง pip deps, และข้าม build web เพราะมี web\out (prebuilt) อยู่แล้ว.
  ; แสดงหน้าต่าง PowerShell ให้ผู้ใช้เห็น progress (ใช้เวลา ~5-10 นาที).
  DetailPrint "กำลังติดตั้ง Python และเครื่องมือที่จำเป็น (อาจใช้เวลา 5-10 นาที ห้ามปิด)..."
  ExecWait 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\setup-prereqs.ps1"' $0
  ${If} $0 != 0
    ; ไม่ fatal — ปล่อยให้ติดตั้งเสร็จ ผู้ใช้รัน "ติดตั้ง.bat" ซ้ำเองได้ถ้าเน็ตหลุด
    DetailPrint "! setup-prereqs ยังไม่สมบูรณ์ (code $0) — เปิดโฟลเดอร์แล้วดับเบิลคลิก ติดตั้ง.bat ซ้ำได้"
  ${Else}
    DetailPrint "ติดตั้งเครื่องมือที่จำเป็นเสร็จแล้ว"
  ${EndIf}
SectionEnd

; เปิดโปรแกรมจากหน้า Finish
Function LaunchApp
  SetOutPath "$INSTDIR"
  ExecShell "" "$INSTDIR\${LAUNCHER}"
FunctionEnd

; ============================================================================
;  ถอนการติดตั้ง
; ============================================================================
; หมายเหตุ: ข้อมูลผู้ใช้ (ฐานข้อมูล/ตั้งค่า/setup_done) เก็บที่ %USERPROFILE%\.vgap
; (config.py: VGAP_DATA_DIR หรือ ~/.vgap) — ตัวรันจากซอร์ส (_run-source.bat) ไม่ตั้ง VGAP_DATA_DIR
; → data อยู่ ~/.vgap. ถอนแล้ว "ต้องลบ ~/.vgap ด้วย" ไม่งั้นลงใหม่จำ setup เก่า (หน้า setup ไม่ขึ้น)
Section "Uninstall"
  SetShellVarContext current

  ; ปิดโปรแกรมก่อน (กันไฟล์ถูกล็อก) — เงียบ ๆ ไม่ error ถ้าไม่ได้เปิดอยู่
  ExecWait 'taskkill /im vgap-server.exe /f'
  ExecWait 'taskkill /im python.exe /f'
  ExecWait 'taskkill /im pythonw.exe /f'
  ExecWait 'taskkill /im adb.exe /f'
  Sleep 800

  ; ลบทางลัด
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\ถอนการติดตั้ง.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; ลบไฟล์โปรแกรมทั้งหมด
  RMDir /r "$INSTDIR"

  ; ★ ลบข้อมูลผู้ใช้ (~/.vgap) ด้วย — ไม่งั้นลงใหม่ยังจำ setup เก่า หน้า setup ไม่ขึ้น
  RMDir /r "$PROFILE\.vgap"

  ; ลบ registry
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP_SLUG}"
SectionEnd
