#!/bin/bash
# ============================================================
#  เปิด VDO Gen Auto Pilot บน macOS
#  (คู่ขนานกับ เปิดโปรแกรม.vbs ของ Windows)
#  วิธีใช้: ดับเบิลคลิกไฟล์นี้ → server เริ่ม + เบราว์เซอร์เปิดเอง
#  ต้องรัน ติดตั้ง.command มาก่อนหนึ่งครั้ง (ติดตั้งเครื่องมือ)
# ============================================================
cd "$(dirname "$0")/desktop"

# เลือก python: venv จาก setup ก่อน ไม่งั้น python3 ระบบ
if [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"; else PY="$(command -v python3)"; fi

# ให้ brew tools (adb/scrcpy/ffmpeg) อยู่ใน PATH เสมอ
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null

# เครื่องมือแบบ No-Admin (จาก ติดตั้ง-mac-noadmin.command) — วางไว้ใน $HOME/.vgap/bin
# prepend เข้า PATH ให้โปรแกรมหา adb/scrcpy/ffmpeg เจอ (รองรับทั้ง brew และ no-admin)
if [ -d "$HOME/.vgap/bin" ]; then
  export PATH="$HOME/.vgap/bin:$PATH"
  [ -x "$HOME/.vgap/bin/adb" ] && export VGAP_ADB="$HOME/.vgap/bin/adb"
  [ -f "$HOME/.vgap/bin/scrcpy-server" ] && export VGAP_SCRCPY_SERVER="$HOME/.vgap/bin/scrcpy-server"
fi

export VGAP_OPEN_BROWSER=1
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

echo "เปิด VDO Gen Auto Pilot ... (ปิดหน้าต่างนี้ = ปิดโปรแกรม)"
exec "$PY" main.py
