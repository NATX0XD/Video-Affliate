#!/bin/bash
# ============================================================
#  bootstrap.sh — ตัวติดตั้งจริงของ "Install VDO Gen Auto Pilot.app"
#  ------------------------------------------------------------
#  ทำงาน: ดึงโค้ดล่าสุดจาก GitHub (tarball) → แตกลง ~/Applications/VDO-Gen-AutoPilot
#         → เรียกตัวติดตั้ง deps ที่มากับ repo (ติดตั้ง-mac-noadmin.command)
#
#  แบบ No-Admin: ลงในโฟลเดอร์ผู้ใช้เอง ไม่แตะระบบ · ไม่ต้องรหัสเครื่อง
#  แอปนี้ไม่ได้เซ็นดิจิทัล (unsigned) — ปกติสำหรับเครื่องมือภายใน
#
#  ข้อมูลผู้ใช้ (~/.vgap) อยู่นอก APP_DIR → รันซ้ำ = อัปเดตทับได้ ไม่ลบข้อมูล
# ============================================================
set -o pipefail
printf '\033]0;VGAP-INSTALLER\007'   # ตั้งชื่อหน้าต่าง → ปิดให้ตรงตัวตอนจบ (กันปิดผิดหน้าต่าง)

# ---- สี/ตัวช่วยข้อความ ----
say(){  printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){   printf "\033[1;32m  \xe2\x9c\x93 %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }
err(){  printf "\n\033[1;31m  \xe2\x9c\x97 %s\033[0m\n" "$1"; }
hold(){ echo; echo "กด Enter เพื่อปิดหน้าต่างนี้"; read -r _; }
fail(){ err "$1"; echo; echo "วิธีแก้: $2"; hold; exit 1; }

# ---- ค่าคงที่ ----
TARBALL="https://github.com/NATX0XD/Video-Affliate/archive/refs/heads/main.tar.gz"
# แตกออกมาจะได้ prefix โฟลเดอร์ "Video-Affliate-main/" → ตัดทิ้งด้วย --strip-components=1
APP_DIR="$HOME/Applications/VDO-Gen-AutoPilot"
LAUNCHER_NAME="VDO Gen Auto Pilot"

# สร้าง launcher .app (เปิดเว็บแอปแบบหน้าต่างแอป/PWA ผ่าน Chrome --app) ที่ตำแหน่ง $1
make_launcher_app(){
  local dest="$1"
  rm -rf "$dest"
  mkdir -p "$dest/Contents/MacOS" "$dest/Contents/Resources"
  cat > "$dest/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>${LAUNCHER_NAME}</string>
  <key>CFBundleDisplayName</key><string>${LAUNCHER_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.natx.vgap.app</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
  cat > "$dest/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "/bin/bash " & quoted form of "$APP_DIR/เปิดโปรแกรม-mac.command"'
LAUNCH
  chmod +x "$dest/Contents/MacOS/launch"
  # icon (non-fatal)
  local isrc="$APP_DIR/web/public/icons/icon-512.png"
  if [ -f "$isrc" ] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
    local iset="$dest/Contents/Resources/icon.iconset"; mkdir -p "$iset"; local iok=1
    for pair in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" "128 128x128" "256 128x128@2x" "256 256x256" "512 256x256@2x" "512 512x512" "1024 512x512@2x"; do
      set -- $pair; sips -z "$1" "$1" "$isrc" --out "$iset/icon_$2.png" >/dev/null 2>&1 || iok=0
    done
    [ "$iok" = 1 ] && iconutil -c icns "$iset" -o "$dest/Contents/Resources/icon.icns" >/dev/null 2>&1
    rm -rf "$iset"
  fi
  xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true
  codesign --force -s - "$dest" >/dev/null 2>&1 || true
}

# ปิด Terminal + eject/ลบตัวติดตั้ง (.dmg) ให้เอง — ทำ detached หลัง bash จบ
self_cleanup(){
  local boot="$1" vol="" dmg=""
  if [[ "$boot" == /Volumes/* ]]; then
    vol="/Volumes/$(printf '%s' "$boot" | cut -d/ -f3)"
    dmg=$(hdiutil info 2>/dev/null | awk -v v="$vol" '/image-path[ \t]*:/{sub(/^.*image-path[ \t]*:[ \t]*/,"");ip=$0} index($0,v){print ip; exit}')
  fi
  nohup bash -c "
    sleep 4
    [ -n \"$vol\" ] && hdiutil detach \"$vol\" -force >/dev/null 2>&1
    [ -n \"$dmg\" ] && rm -f \"$dmg\"
    osascript -e 'tell application \"Terminal\" to close (every window whose name contains \"VGAP-INSTALLER\") saving no' >/dev/null 2>&1
    sleep 1
    open \"$HOME/Applications/$LAUNCHER_NAME.app\" >/dev/null 2>&1
  " >/dev/null 2>&1 &
  disown 2>/dev/null || true
}

# ---- header ----
clear 2>/dev/null || true
cat <<'HEAD'
============================================================
   กำลังติดตั้ง VDO Gen Auto Pilot (macOS)
------------------------------------------------------------
   • ดึงโค้ดล่าสุดจาก GitHub แล้วติดตั้งลงในเครื่องคุณ
   • แบบ No-Admin: ลงในโฟลเดอร์ผู้ใช้เอง ไม่แตะระบบ ไม่ต้องรหัสเครื่อง
   • แอปตัวติดตั้งนี้ไม่ได้เซ็นดิจิทัล (unsigned) — เป็นเรื่องปกติ
   • ต้องต่ออินเทอร์เน็ตระหว่างติดตั้ง อย่าเพิ่งปิดหน้าต่างนี้
============================================================
HEAD
echo "   ปลายทาง: $APP_DIR"

# ---- [1/4] ตรวจ curl + อินเทอร์เน็ต ----
say "[1/4] ตรวจอินเทอร์เน็ต"
command -v curl >/dev/null 2>&1 \
  || fail "ไม่พบคำสั่ง curl ในเครื่อง" \
          "เปิด Terminal พิมพ์ 'xcode-select --install' เพื่อติดตั้ง Command Line Tools แล้วลองใหม่"
# ping เบา ๆ ที่ตัว host GitHub (HEAD request) เพื่อยืนยันว่าออกเน็ตได้จริง
if ! curl -fsI --connect-timeout 20 "https://github.com" >/dev/null 2>&1; then
  fail "เชื่อมต่ออินเทอร์เน็ตไม่ได้ (เข้า github.com ไม่ได้)" \
       "ต่อ Wi-Fi/เน็ตให้เสถียร ปิด VPN/Proxy ที่บล็อกอยู่ แล้วดับเบิลคลิกตัวติดตั้งใหม่"
fi
ok "อินเทอร์เน็ตพร้อม (เข้า github.com ได้)"

# ---- [2/4] ดาวน์โหลด + แตกโค้ดลง APP_DIR ----
if [ -d "$APP_DIR" ]; then
  say "[2/4] อัปเดตโค้ดล่าสุด (พบของเดิม — เขียนทับ ไม่ลบข้อมูลผู้ใช้ ~/.vgap)"
else
  say "[2/4] ดาวน์โหลดโค้ดล่าสุดจาก GitHub"
fi
mkdir -p "$APP_DIR" \
  || fail "สร้างโฟลเดอร์ปลายทางไม่ได้: $APP_DIR" \
          "ตรวจสิทธิ์โฟลเดอร์ $HOME/Applications แล้วลองใหม่"
# curl → tar : --strip-components=1 ตัด prefix "Video-Affliate-main/" ออก
# ได้ desktop/, web/out/, สคริปต์ *.command ที่ราก APP_DIR โดยตรง
if ! curl -fL --retry 3 --connect-timeout 20 "$TARBALL" | tar xz --strip-components=1 -C "$APP_DIR"; then
  fail "ดาวน์โหลดหรือแตกไฟล์โค้ดไม่สำเร็จ" \
       "เน็ตอาจหลุดกลางคัน — ต่อเน็ตให้เสถียรแล้วดับเบิลคลิกตัวติดตั้งใหม่ (รันซ้ำได้ ปลอดภัย)"
fi
ok "ได้โค้ดล่าสุดแล้ว → $APP_DIR"

# ---- [3/4] ปลดล็อก quarantine + ตั้งสิทธิ์รัน ----
say "[3/4] ปลดล็อกไฟล์ (quarantine) + ตั้งให้รันได้"
xattr -dr com.apple.quarantine "$APP_DIR" 2>/dev/null || true
chmod +x "$APP_DIR"/*.command 2>/dev/null || true
ok "พร้อมรันสคริปต์ในโฟลเดอร์"

# ---- [4/5] เรียกตัวติดตั้ง deps ที่มากับ repo (ห้าม reimplement) ----
say "[4/5] ติดตั้งเครื่องมือ (venv + adb/scrcpy/ffmpeg ลง ~/.vgap/bin)"
DEPS="$APP_DIR/ติดตั้ง-mac-noadmin.command"
[ -f "$DEPS" ] \
  || fail "ไม่พบตัวติดตั้งเครื่องมือในโค้ดที่โหลดมา: $DEPS" \
          "โค้ดอาจโหลดมาไม่ครบ — ดับเบิลคลิกตัวติดตั้งใหม่อีกครั้ง"
# VGAP_NO_PAUSE=1 กัน deps หยุดรอ Enter + กัน read EOF ทริก set -e
if ! VGAP_NO_PAUSE=1 bash "$DEPS"; then
  fail "ติดตั้งเครื่องมือไม่สำเร็จ" \
       "ต่อเน็ตให้เสถียรแล้วดับเบิลคลิกตัวติดตั้งใหม่ หรือส่งรูป error ในหน้าต่างให้ทีมงาน"
fi

# ---- [5/5] สร้างแอป (หน้าต่างแอป/PWA ของเว็บแอป) ที่ Applications + Desktop ----
say "[5/5] สร้างแอป \"$LAUNCHER_NAME\" (เปิดเว็บแอปแบบหน้าต่างแอป/PWA)"
make_launcher_app "$HOME/Applications/$LAUNCHER_NAME.app"
make_launcher_app "$HOME/Desktop/$LAUNCHER_NAME.app" 2>/dev/null || true
# ลบทางลัด .command ซ้ำที่ deps สร้าง (ใช้ .app แทน)
rm -f "$HOME/Desktop/เปิด VDO Gen Auto Pilot.command" 2>/dev/null || true
ok "แอปพร้อมแล้วที่ ~/Applications และ Desktop"

# ---- เสร็จ ----
say "ติดตั้งเสร็จแล้ว"
cat <<EOF

  ✅ VDO Gen Auto Pilot พร้อมใช้งานแล้ว

  โค้ดโปรแกรมอยู่ที่:  $APP_DIR

  เปิดโปรแกรม: ดับเบิลคลิกแอป "$LAUNCHER_NAME"
    • บนหน้าจอ Desktop  หรือใน  Applications
    • เปิดเป็น "หน้าต่างแอป" (เหมือนแอปจริง ไม่มีแถบเบราว์เซอร์)

  อัปเดตภายหลัง: เปิดตัวติดตั้งนี้ซ้ำได้เลย
  (ข้อมูล/ตั้งค่าของคุณอยู่ใน ~/.vgap จะไม่ถูกลบ)
EOF
echo
echo "  เสร็จแล้ว — เดี๋ยวเปิดแอปให้อัตโนมัติ + ปิดหน้าต่างนี้ + เก็บตัวติดตั้งเองในไม่กี่วินาที..."
self_cleanup "$0"
exit 0
