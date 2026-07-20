#!/bin/bash
# ============================================================
#  build-mac-installer-app.command
#  ------------------------------------------------------------
#  ประกอบ "Install VDO Gen Auto Pilot.app" (installer แบบ no-admin ที่ดึงโค้ด
#  ล่าสุดจาก GitHub ตอนติดตั้ง) → ใส่ icon → ad-hoc codesign → หุ้มเป็น .dmg
#
#  โครง .app:
#    Install VDO Gen Auto Pilot.app/
#      Contents/Info.plist
#      Contents/MacOS/installer        (เปิด Terminal รัน bootstrap.sh)
#      Contents/Resources/bootstrap.sh (ตัวติดตั้งจริง — ดึง repo + รัน deps)
#      Contents/Resources/icon.icns
#
#  วิธีใช้:  ดับเบิลคลิกไฟล์นี้  (หรือ  bash build-mac-installer-app.command)
#  ผลลัพธ์:  dist/VDO-Gen-AutoPilot-Installer-mac.dmg
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

SRC="$ROOT/build/mac-installer"
STAGE="$ROOT/dist/mac-installer-stage"
APP="$STAGE/Install VDO Gen Auto Pilot.app"
ICON_SRC="$ROOT/web/public/icons/icon-512.png"
DMG="$ROOT/dist/VDO-Gen-AutoPilot-Installer-mac.dmg"

say(){  printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){   printf "\033[1;32m  \xe2\x9c\x93 %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }
die(){  printf "\n\033[1;31m  \xe2\x9c\x97 %s\033[0m\n" "$1"; echo; exit 1; }

command -v hdiutil  >/dev/null 2>&1 || die "ไม่พบ hdiutil (ต้องรันบน macOS)"
command -v codesign >/dev/null 2>&1 || die "ไม่พบ codesign (ต้องรันบน macOS)"

# ── [1/6] ตรวจไฟล์ต้นทาง ──
say "[1/6] ตรวจไฟล์ต้นทาง"
[ -f "$SRC/Info.plist" ]    || die "ไม่พบ $SRC/Info.plist"
[ -f "$SRC/installer" ]     || die "ไม่พบ $SRC/installer"
[ -f "$SRC/bootstrap.sh" ]  || die "ไม่พบ $SRC/bootstrap.sh"
plutil -lint "$SRC/Info.plist" >/dev/null || die "Info.plist ไม่ผ่าน plutil -lint"
ok "Info.plist ผ่าน lint · installer · bootstrap.sh พร้อม"

# ── [2/6] สร้างโครง .app ──
say "[2/6] ประกอบโครง .app"
rm -rf "$STAGE"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$SRC/Info.plist"   "$APP/Contents/Info.plist"
cp "$SRC/installer"    "$APP/Contents/MacOS/installer"
cp "$SRC/bootstrap.sh" "$APP/Contents/Resources/bootstrap.sh"
chmod +x "$APP/Contents/MacOS/installer" "$APP/Contents/Resources/bootstrap.sh"
ok "โครง .app: MacOS/installer + Resources/bootstrap.sh"

# ── [3/6] สร้าง icon.icns (non-fatal ถ้าเครื่องมือ sips/iconutil ล้ม) ──
say "[3/6] สร้างไอคอน (.icns) จาก icon-512.png"
if [ -f "$ICON_SRC" ] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  ICONSET="$STAGE/icon.iconset"
  mkdir -p "$ICONSET"
  ICON_OK=1
  gen(){ sips -z "$1" "$1" "$ICON_SRC" --out "$ICONSET/$2" >/dev/null 2>&1 || ICON_OK=0; }
  gen 16   icon_16x16.png
  gen 32   icon_16x16@2x.png
  gen 32   icon_32x32.png
  gen 64   icon_32x32@2x.png
  gen 128  icon_128x128.png
  gen 256  icon_128x128@2x.png
  gen 256  icon_256x256.png
  gen 512  icon_256x256@2x.png
  gen 512  icon_512x512.png
  gen 1024 icon_512x512@2x.png
  if [ "$ICON_OK" = "1" ] && iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns" >/dev/null 2>&1; then
    ok "icon.icns → Contents/Resources/icon.icns"
  else
    warn "สร้าง icon.icns ไม่สำเร็จ — ข้าม (แอปยังใช้งานได้ ใช้ไอคอนเริ่มต้น)"
  fi
  rm -rf "$ICONSET"
else
  warn "ไม่พบ icon-512.png หรือ sips/iconutil — ข้ามการทำไอคอน (non-fatal)"
fi

# ── [4/6] ad-hoc codesign (ช่วยให้เรียบร้อยบน Apple Silicon — executable เป็น
#     เชลล์สคริปต์จึงไม่ "บังคับ" ให้เปิดได้ แต่เซ็นไว้ปลอดภัย/สม่ำเสมอกว่า) ──
say "[4/6] เซ็นแบบ ad-hoc"
codesign --force -s - "$APP" || die "codesign ล้มเหลว"
codesign -dv "$APP" 2>&1 | sed 's/^/    /' || true
ok "ad-hoc signed"

# ── [5/6] README ในดีเอ็มจี ──
say "[5/6] สร้าง อ่านก่อน-Mac.txt"
cat > "$STAGE/อ่านก่อน-Mac.txt" <<'EOF'
Install VDO Gen Auto Pilot — ตัวติดตั้งสำหรับ macOS
==============================================================

แอปนี้ยังไม่ได้ซื้อใบรับรอง (unsigned) — macOS จะเตือน 1 ครั้งตอนเปิดครั้งแรก
เป็นเรื่องปกติของเครื่องมือภายใน ทำตาม 4 ขั้นนี้ ครั้งเดียวจบ:

  1) ดับเบิลคลิกแอป — ถ้าขึ้นกล่อง "Apple could not verify..." ให้กด  Done
  2) เปิด  เมนู Apple  >  System Settings  >  Privacy & Security
  3) เลื่อนลงล่างสุด จะเห็น "Install VDO Gen Auto Pilot ถูกบล็อก"
     แล้วกดปุ่ม  Open Anyway
  4) ยืนยันด้วย Touch ID หรือรหัสเครื่อง → แอปเปิดและเริ่มติดตั้ง
     (ครั้งต่อไปดับเบิลคลิกเปิดได้เลย ไม่ต้องทำซ้ำ)

  (macOS รุ่นเก่ากว่า 15: คลิกขวาที่แอป > Open > Open ก็ได้)

หมายเหตุ: ครั้งแรกอาจมีป๊อปอัป "...wants to control Terminal" ให้กด  OK / Allow
  (ตัวติดตั้งใช้ Terminal แสดงความคืบหน้า แล้วปิดหน้าต่างให้เองเมื่อเสร็จ)

ตัวติดตั้งจะทำอะไร:
  • ดึงโค้ดล่าสุดจาก GitHub ลงที่  ~/Applications/VDO-Gen-AutoPilot
  • ลงเครื่องมือ (adb / scrcpy / ffmpeg + Python) ในโฟลเดอร์ผู้ใช้เอง
    ไม่แตะระบบ · ไม่ต้องใช้รหัสเครื่อง (admin)
  • ต้องต่ออินเทอร์เน็ต · เสร็จแล้วเปิดแอปให้เองอัตโนมัติ
EOF
ok "อ่านก่อน-Mac.txt"

# ── [6/6] สร้าง .dmg ──
say "[6/6] หุ้มเป็น .dmg (hdiutil UDZO)"
mkdir -p "$ROOT/dist"
rm -f "$DMG"
hdiutil create \
  -volname "VDO Gen Auto Pilot" \
  -srcfolder "$STAGE" \
  -ov -format UDZO \
  "$DMG" >/dev/null
ok "สร้างไฟล์: $DMG"
ls -lh "$DMG" | awk '{print "    ขนาด: "$5}'

say "เสร็จ"
echo "  ไฟล์ส่งมอบ:  $DMG"
