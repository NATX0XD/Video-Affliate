#!/bin/bash
# ============================================================
#  เปิด VDO Gen Auto Pilot บน macOS
#  (คู่ขนานกับ เปิดโปรแกรม.vbs ของ Windows)
#  วิธีใช้: ดับเบิลคลิกไฟล์นี้ → server เริ่ม + เบราว์เซอร์เปิดเอง
#  ต้องรัน setup-mac.command มาก่อนหนึ่งครั้ง (ติดตั้งเครื่องมือ)
# ============================================================
cd "$(dirname "$0")/desktop"

# เลือก python: venv จาก setup ก่อน ไม่งั้น python3 ระบบ
if [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"; else PY="$(command -v python3)"; fi

# ให้ brew tools (adb/scrcpy/ffmpeg) อยู่ใน PATH เสมอ
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null

export VGAP_OPEN_BROWSER=1
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

echo "เปิด VDO Gen Auto Pilot ... (ปิดหน้าต่างนี้ = ปิดโปรแกรม)"
exec "$PY" main.py
