#!/bin/bash
# ============================================================
#  ติดตั้งเครื่องมือสำหรับ VDO Gen Auto Pilot บน macOS
#  (คู่ขนานกับ setup-prereqs.ps1 ของ Windows)
#  วิธีใช้: ดับเบิลคลิกไฟล์นี้  หรือ  bash setup-mac.command
#  ลงให้: Homebrew · Python · adb · scrcpy · ffmpeg · Python deps
# ============================================================
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

say(){ printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){ printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }

say "[1/5] Homebrew (ตัวช่วยติดตั้งของ Mac)"
if command -v brew >/dev/null 2>&1; then ok "มีอยู่แล้ว"; else
  warn "ยังไม่มี — กำลังติดตั้ง (อาจถามรหัสเครื่อง)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # เพิ่ม brew เข้า PATH (Apple Silicon / Intel)
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
fi

say "[2/5] เครื่องมือหลัก: python adb scrcpy ffmpeg"
brew install python@3.11 android-platform-tools scrcpy ffmpeg || brew install python android-platform-tools scrcpy ffmpeg
ok "ติดตั้งเครื่องมือแล้ว"

say "[3/5] เตรียม Python env + ติดตั้ง dependencies"
PY="$(command -v python3.11 || command -v python3)"
"$PY" -m venv "$ROOT/desktop/.venv"
"$ROOT/desktop/.venv/bin/pip" install -q --upgrade pip
"$ROOT/desktop/.venv/bin/pip" install -q -r "$ROOT/desktop/requirements.txt"
ok "ติดตั้ง dependencies แล้ว (desktop/.venv)"

say "[4/5] ตรวจว่าเครื่องมือครบ"
for c in python3 adb scrcpy ffmpeg; do
  if command -v "$c" >/dev/null 2>&1; then ok "$c"; else warn "$c ยังไม่เจอ — ลองปิด-เปิด Terminal ใหม่"; fi
done

say "[5/5] เสร็จแล้ว"
cat <<EOF

  วิธีเปิดโปรแกรม (Mac):
    ดับเบิลคลิก  เปิดโปรแกรม-mac.command
    หรือรัน:     bash "$ROOT/เปิดโปรแกรม-mac.command"

  ต่อมือถือ (Android):
    1) เสียบสาย (USB-C ↔ USB-C / micro USB)
    2) เปิด USB debugging บนมือถือ แล้วกด Allow
    3) เช็ก:  adb devices   (ต้องเห็นเครื่อง)

EOF
