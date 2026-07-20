#!/bin/bash
# ============================================================
#  ติดตั้ง VDO Gen Auto Pilot บน macOS — แบบ "ไม่ต้องรหัสเครื่อง" (No-Admin)
#  ---------------------------------------------------------------------
#  ต่างจาก ติดตั้ง.command (ตัวหลัก) ที่ใช้ Homebrew + ต้องรหัส admin
#  ตัวนี้ "โหลด binary ตรง ๆ ลงในโฟลเดอร์ของผู้ใช้เอง" ($HOME/.vgap/bin)
#  ไม่แตะระบบ · ไม่ต้องรหัสเครื่อง → ใช้ได้บนเครื่อง guest / เครื่องที่ถูกล็อก
#
#  โหลด: adb (platform-tools) · scrcpy (+ server) · ffmpeg (static)
#  Python: ใช้ python3 ของ Mac ที่มีอยู่ + สร้าง venv (ไม่ต้อง brew)
#
#  วิธีใช้: ดับเบิลคลิกไฟล์นี้  (หรือ  bash ติดตั้ง-mac-noadmin.command)
#  หมายเหตุ: ไม่ทับ ติดตั้ง.command เดิม — เป็น "ทางเลือก" สำหรับเครื่องที่ลง brew ไม่ได้
# ============================================================
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

VGAP_HOME="$HOME/.vgap"
BIN="$VGAP_HOME/bin"
SCRCPY_VER="4.0"   # ★ ต้องตรงกับ SCRCPY_VERSION ในโค้ด (scrcpy_control.py) + Windows build — client/server ต้อง version เดียวกัน ไม่งั้น server abort → โพสต์ (touch/caption) ล้ม

say(){ printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){ printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }
die(){ printf "\n\033[1;31m  ✗ %s\033[0m\n" "$1"; echo; echo "กด Enter เพื่อปิดหน้าต่างนี้"; read -r _; exit 1; }
trap 'die "ติดตั้งไม่สำเร็จ — ต่อเน็ตให้เสถียรแล้วดับเบิลคลิกไฟล์นี้ใหม่ หรือส่งรูป error มาให้ทีมงาน"' ERR

# โฟลเดอร์ชั่วคราวสำหรับดาวน์โหลด/แตกไฟล์ (ลบทิ้งเมื่อจบ)
TMP="$(mktemp -d "${TMPDIR:-/tmp}/vgap-setup.XXXXXX")"
trap 'rm -rf "$TMP"; die "ติดตั้งไม่สำเร็จ — ต่อเน็ตให้เสถียรแล้วดับเบิลคลิกไฟล์นี้ใหม่ หรือส่งรูป error มาให้ทีมงาน"' ERR

# ---- ตัวช่วยโหลดไฟล์ (curl มีทุกเครื่อง Mac, ไม่ต้องลงอะไร) ----
fetch(){ # fetch <url> <out> — แสดง progress + resume ได้ (กันดูเหมือนค้าง/หลุดแล้วต่อได้)
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -C - --progress-bar -o "$2" "$1"
}

say "[1/7] ตรวจเครื่อง (arch) + เตรียมโฟลเดอร์ผู้ใช้"
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then SC_ARCH="aarch64"; else SC_ARCH="x86_64"; fi
ok "arch=$ARCH → scrcpy $SC_ARCH"
mkdir -p "$BIN"
ok "โฟลเดอร์: $BIN  (ในเครื่องผู้ใช้ ไม่แตะระบบ ไม่ต้องรหัส)"

GH="https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VER}"
ADB_URL="https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
SCRCPY_URL="$GH/scrcpy-macos-${SC_ARCH}-v${SCRCPY_VER}.tar.gz"
SCRCPY_SERVER_URL="$GH/scrcpy-server-v${SCRCPY_VER}"
FFMPEG_URL="https://evermeet.cx/ffmpeg/getrelease/zip"

say "[2/7] โหลด adb (Android platform-tools)"
fetch "$ADB_URL" "$TMP/platform-tools.zip"
unzip -oq "$TMP/platform-tools.zip" -d "$TMP"
if [ -f "$TMP/platform-tools/adb" ]; then
  cp "$TMP/platform-tools/adb" "$BIN/adb"
  # fastboot ติดมาด้วยเผื่อใช้ (ไม่บังคับ)
  [ -f "$TMP/platform-tools/fastboot" ] && cp "$TMP/platform-tools/fastboot" "$BIN/fastboot" || true
  ok "adb → $BIN/adb"
else
  die "แตกไฟล์ adb ไม่พบ — ลองใหม่อีกครั้ง"
fi

say "[3/7] โหลด scrcpy (macos $SC_ARCH) + scrcpy-server"
fetch "$SCRCPY_URL" "$TMP/scrcpy.tar.gz"
mkdir -p "$TMP/scrcpy"
tar -xzf "$TMP/scrcpy.tar.gz" -C "$TMP/scrcpy"
# หาโฟลเดอร์ที่มีไฟล์ binary ชื่อ scrcpy แล้วก็อปทั้งโฟลเดอร์ (scrcpy + .dylib + server ถ้ามี)
SC_BIN="$(find "$TMP/scrcpy" -type f -name scrcpy | head -1)"
[ -n "$SC_BIN" ] || die "แตกไฟล์ scrcpy ไม่พบ binary — ลองใหม่อีกครั้ง"
SC_DIR="$(dirname "$SC_BIN")"
cp -R "$SC_DIR"/* "$BIN"/
ok "scrcpy + libs → $BIN"
# ให้แน่ใจว่ามี scrcpy-server อยู่ข้าง ๆ scrcpy (ตัว app หาไฟล์นี้จาก which(scrcpy))
if [ ! -f "$BIN/scrcpy-server" ] && [ ! -f "$BIN/scrcpy-server.jar" ]; then
  fetch "$SCRCPY_SERVER_URL" "$BIN/scrcpy-server"
  ok "scrcpy-server → $BIN/scrcpy-server"
else
  ok "scrcpy-server มากับ tarball แล้ว"
fi

say "[4/7] โหลด ffmpeg (static build)"
warn "ffmpeg เป็นไฟล์ใหญ่ (~26MB) บาง mirror ช้า — รอสักครู่ (มีแถบ %) อย่าเพิ่งปิดหน้าต่าง"
fetch "$FFMPEG_URL" "$TMP/ffmpeg.zip"
mkdir -p "$TMP/ffmpeg"
unzip -oq "$TMP/ffmpeg.zip" -d "$TMP/ffmpeg"
FF_BIN="$(find "$TMP/ffmpeg" -type f -name ffmpeg | head -1)"
[ -n "$FF_BIN" ] || die "แตกไฟล์ ffmpeg ไม่พบ — ลองใหม่อีกครั้ง"
cp "$FF_BIN" "$BIN/ffmpeg"
ok "ffmpeg → $BIN/ffmpeg"

say "[5/7] ตั้งค่าไฟล์ให้รันได้ + ปลดล็อก quarantine (ไม่ต้องรหัส)"
chmod +x "$BIN"/* 2>/dev/null || true
# ไฟล์โหลดจากเน็ตจะติด flag com.apple.quarantine → ปลดออก (เป็นไฟล์ของผู้ใช้เอง ไม่ต้องรหัส)
xattr -dr com.apple.quarantine "$BIN" 2>/dev/null || true
ok "พร้อมรัน"

say "[6/7] เตรียม Python env + ติดตั้ง dependencies (ใช้ python3 ของ Mac)"
PY="$(command -v python3 || true)"
[ -n "$PY" ] || die "ไม่พบ python3 ในเครื่อง — เปิด Terminal พิมพ์ 'python3 --version' ถ้าเด้งให้ติดตั้ง Command Line Tools ให้กดติดตั้งก่อน แล้วรันไฟล์นี้ใหม่"
# ★ Apple Silicon: python /usr/bin/python3 เป็น universal → สลับ arch เป็น x86_64 ได้ แต่ native wheel
#   (เช่น pydantic_core) ถูกลงเป็น arm64 → mismatch → server crash. บังคับ arm64 ให้ตรงกันทุกจุด.
ARCHP=""
if [ "$ARCH" = "arm64" ]; then
  HB=""
  # เลือก 3.11/3.12 (มี wheel ครบทุก dep เช่น Pillow 10.3.0) — เลี่ยง 3.13 ที่ Pillow 10.3.0 ยังไม่มี wheel → build ล้ม
  for hp in /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.12; do [ -x "$hp" ] && { HB="$hp"; break; }; done
  if [ -n "$HB" ]; then PY="$HB"; else ARCHP="arch -arm64"; fi
fi
rm -rf "$ROOT/desktop/.venv"   # สร้าง venv ใหม่สะอาดทุกครั้ง กันของเก่าปน arch
$ARCHP "$PY" -m venv "$ROOT/desktop/.venv"
$ARCHP "$ROOT/desktop/.venv/bin/pip" install -q --upgrade pip
$ARCHP "$ROOT/desktop/.venv/bin/pip" install -q -r "$ROOT/desktop/requirements.txt"
ok "ติดตั้ง dependencies แล้ว (desktop/.venv)"

say "[7/7] สร้างทางลัดบนหน้าจอ Desktop"
LAUNCH_TARGET="$ROOT/เปิดโปรแกรม-mac.command"
chmod +x "$LAUNCH_TARGET" 2>/dev/null || true
if [ -d "$HOME/Desktop" ] && [ -f "$LAUNCH_TARGET" ]; then
  DESKTOP_LNK="$HOME/Desktop/เปิด VDO Gen Auto Pilot.command"
  cat > "$DESKTOP_LNK" <<EOF
#!/bin/bash
# ทางลัดเปิด VDO Gen Auto Pilot (สร้างโดยตัวติดตั้งแบบ No-Admin)
exec "$LAUNCH_TARGET"
EOF
  chmod +x "$DESKTOP_LNK"
  ok "สร้างทางลัดแล้ว: $DESKTOP_LNK"
else
  warn "สร้างทางลัดไม่ได้ — เปิดโปรแกรมได้จากไฟล์ เปิดโปรแกรม-mac.command ในโฟลเดอร์นี้"
fi

rm -rf "$TMP"
trap - ERR

say "เสร็จแล้ว"
cat <<EOF

  ✅ ติดตั้งเสร็จแล้ว! (แบบไม่ต้องรหัสเครื่อง — ลงในเครื่องผู้ใช้ ไม่แตะระบบ)

  เครื่องมือทั้งหมดอยู่ที่:  $BIN
    • adb · scrcpy (+ scrcpy-server) · ffmpeg

  วิธีเปิดโปรแกรม (Mac):
    • ดับเบิลคลิกทางลัด "เปิด VDO Gen Auto Pilot" บนหน้าจอ Desktop
    • หรือดับเบิลคลิก  เปิดโปรแกรม-mac.command  ในโฟลเดอร์นี้
      (launcher จะเพิ่ม $BIN เข้า PATH ให้เอง → โปรแกรมหาเครื่องมือเจอ)

  ต่อมือถือ (Android):
    1) เสียบสาย (USB-C หรือ micro USB)
    2) เปิด USB debugging บนมือถือ แล้วกด Allow
    3) เช็ก:  "$BIN/adb" devices   (ต้องเห็นเครื่อง)

EOF
if [ -z "${VGAP_NO_PAUSE:-}" ]; then
  echo "กด Enter เพื่อปิดหน้าต่างนี้"
  read -r _ || true
fi
