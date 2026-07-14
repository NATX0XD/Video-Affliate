#!/bin/bash
# ============================================================
#  ติดตั้ง VDO Gen Auto Pilot บน macOS  (ดับเบิลคลิกครั้งเดียวจบ)
#  - ลง: Homebrew · Python · adb · scrcpy · ffmpeg · Python deps
#  - สร้างทางลัด "เปิด VDO Gen Auto Pilot" บนหน้าจอ Desktop
#  วิธีใช้: ดับเบิลคลิกไฟล์นี้  (หรือ  bash ติดตั้ง.command)
#  หมายเหตุ: นี่คือตัวติดตั้งหลัก — setup-mac.command เป็นทางลัดมาที่ไฟล์นี้
# ============================================================
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

say(){ printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){ printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }
die(){ printf "\n\033[1;31m  ✗ %s\033[0m\n" "$1"; echo; echo "กด Enter เพื่อปิดหน้าต่างนี้"; read -r _; exit 1; }
trap 'die "ติดตั้งไม่สำเร็จ — ต่อเน็ตให้เสถียรแล้วดับเบิลคลิกไฟล์นี้ใหม่ หรือส่งรูป error มาให้ทีมงาน"' ERR

say "[1/6] Homebrew (ตัวช่วยติดตั้งของ Mac)"
if command -v brew >/dev/null 2>&1; then
  ok "มีอยู่แล้ว"
else
  warn "ยังไม่มี — กำลังติดตั้ง (อาจถามรหัสเครื่อง)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
# เพิ่ม brew เข้า PATH (Apple Silicon / Intel)
if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi

say "[2/6] เครื่องมือหลัก: python adb scrcpy ffmpeg"
brew install python@3.11 android-platform-tools scrcpy ffmpeg || brew install python android-platform-tools scrcpy ffmpeg
ok "ติดตั้งเครื่องมือแล้ว"

say "[3/6] เตรียม Python env + ติดตั้ง dependencies"
PY="$(command -v python3.11 || command -v python3)"
"$PY" -m venv "$ROOT/desktop/.venv"
"$ROOT/desktop/.venv/bin/pip" install -q --upgrade pip
"$ROOT/desktop/.venv/bin/pip" install -q -r "$ROOT/desktop/requirements.txt"
ok "ติดตั้ง dependencies แล้ว (desktop/.venv)"

say "[4/6] สร้างทางลัดบนหน้าจอ Desktop"
LAUNCH_TARGET="$ROOT/เปิดโปรแกรม-mac.command"
chmod +x "$LAUNCH_TARGET" 2>/dev/null || true
if [ -d "$HOME/Desktop" ] && [ -f "$LAUNCH_TARGET" ]; then
  DESKTOP_LNK="$HOME/Desktop/เปิด VDO Gen Auto Pilot.command"
  cat > "$DESKTOP_LNK" <<EOF
#!/bin/bash
# ทางลัดเปิด VDO Gen Auto Pilot (สร้างโดยตัวติดตั้ง)
exec "$LAUNCH_TARGET"
EOF
  chmod +x "$DESKTOP_LNK"
  ok "สร้างทางลัดแล้ว: $DESKTOP_LNK"
else
  warn "สร้างทางลัดไม่ได้ — เปิดโปรแกรมได้จากไฟล์ เปิดโปรแกรม-mac.command ในโฟลเดอร์นี้"
fi

say "[5/6] ตรวจว่าเครื่องมือครบ"
for c in python3 adb scrcpy ffmpeg; do
  if command -v "$c" >/dev/null 2>&1; then ok "$c"; else warn "$c ยังไม่เจอ — ลองปิด-เปิด Terminal ใหม่"; fi
done

say "[6/6] เสร็จแล้ว"
cat <<'EOF'

  ✅ ติดตั้งเสร็จแล้ว!

  วิธีเปิดโปรแกรม (Mac):
    • ดับเบิลคลิกทางลัด "เปิด VDO Gen Auto Pilot" บนหน้าจอ Desktop
    • หรือดับเบิลคลิก  เปิดโปรแกรม-mac.command  ในโฟลเดอร์นี้

  ต่อมือถือ (Android):
    1) เสียบสาย (USB-C หรือ micro USB)
    2) เปิด USB debugging บนมือถือ แล้วกด Allow
    3) เช็ก:  adb devices   (ต้องเห็นเครื่อง)

EOF
echo "กด Enter เพื่อปิดหน้าต่างนี้"
read -r _
