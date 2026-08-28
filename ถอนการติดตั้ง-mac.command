#!/bin/bash
# ============================================================
#  ถอนการติดตั้ง VDO Gen Auto Pilot (macOS) — ลบทุกอย่างในคลิกเดียว
#  ลบเฉพาะในโฟลเดอร์ผู้ใช้เอง ไม่แตะระบบ ไม่ต้องรหัสเครื่อง
#  ดับเบิลคลิกไฟล์นี้เพื่อถอนการติดตั้งทั้งหมด
# ============================================================
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

say(){ printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){  printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
skip(){ printf "\033[0;90m  - %s\033[0m\n" "$1"; }

# ลบโฟลเดอร์ถ้ามีจริง — ไม่มีก็ข้าม (เดิมขึ้น ✓ ทุกอันแม้ไม่มีไฟล์ อ่านแล้วสับสน)
kill_dir(){
  if [ -e "$1" ]; then rm -rf "$1" && ok "$2" || printf "\033[1;31m  ✗ ลบไม่ได้: %s\033[0m\n" "$1"
  else skip "$2 (ไม่มีอยู่แล้ว)"; fi
}

# โฟลเดอร์โปรแกรมจริงหรือเปล่า — กันเผลอวางไฟล์นี้ไว้ใน Downloads แล้วลบทั้ง Downloads
IS_APP_ROOT=0
[ -f "$ROOT/desktop/main.py" ] && [ -d "$ROOT/web" ] && [ -d "$ROOT/extension" ] && IS_APP_ROOT=1

say "ถอนการติดตั้ง VDO Gen Auto Pilot"
echo "  จะลบทั้งหมดนี้ (เฉพาะในเครื่องคุณ ไม่แตะระบบ macOS):"
echo "    • ~/.vgap                        เครื่องมือ adb/scrcpy/ffmpeg + ฐานข้อมูล + การตั้งค่า"
echo "    • ~/Applications/VDO-Gen-AutoPilot   โค้ดแอป (ถ้าลงแบบเก่า)"
echo "    • ทางลัดบน Desktop"
if [ "$IS_APP_ROOT" = 1 ]; then
  echo "    • $ROOT"
  echo "      (โฟลเดอร์โปรแกรมทั้งโฟลเดอร์ รวม desktop/.venv และคลิปที่ยังไม่ได้ย้ายออก)"
else
  echo "    • (ไฟล์นี้ไม่ได้อยู่ในโฟลเดอร์โปรแกรม — จะไม่ลบโฟลเดอร์โปรแกรมให้)"
fi
echo
printf "  พิมพ์ \033[1;33mลบ\033[0m หรือ \033[1;33myes\033[0m แล้วกด Enter เพื่อยืนยัน (อย่างอื่น = ยกเลิก): "
read -r ANS
case "$ANS" in
  ลบ|yes|YES|Yes) ;;
  *) echo; echo "  ยกเลิกแล้ว ไม่มีอะไรถูกลบ"; echo "กด Enter เพื่อปิด"; read -r _; exit 0 ;;
esac

# 1) หยุดโปรแกรมที่รันอยู่
say "หยุดโปรแกรมที่รันอยู่"
pkill -f "VDO-Gen-AutoPilot/desktop.*main.py" 2>/dev/null
pkill -f "$ROOT/desktop.*main.py" 2>/dev/null
pkill -f "app=http://localhost:3001" 2>/dev/null
pkill -f "scrcpy" 2>/dev/null
for a in /opt/homebrew/bin/adb "$HOME/.vgap/bin/adb"; do
  [ -x "$a" ] && "$a" kill-server 2>/dev/null
done
# เซิร์ฟเวอร์ที่ยังจับพอร์ต 3001 อยู่ (รันจากพาธอื่นเลย pkill ไม่โดน)
PIDS="$(lsof -ti tcp:3001 2>/dev/null)"
[ -n "$PIDS" ] && kill -9 $PIDS 2>/dev/null
ok "หยุดโปรแกรม/เครื่องมือที่รันอยู่"

# 2) ลบไฟล์ทั้งหมด
say "ลบไฟล์"
kill_dir "$HOME/.vgap"                               "เครื่องมือ + ข้อมูล (~/.vgap)"
kill_dir "$HOME/Applications/VDO-Gen-AutoPilot"      "โค้ดแอป (~/Applications/VDO-Gen-AutoPilot)"
kill_dir "$HOME/Applications/VDO Gen Auto Pilot.app" "แอป (~/Applications)"
kill_dir "$HOME/Desktop/VDO Gen Auto Pilot.app"      "แอป (Desktop)"
kill_dir "$HOME/Desktop/เปิด VDO Gen Auto Pilot.command" "ทางลัดบน Desktop"

# 3) คืนค่าเบราว์เซอร์ที่ตัวติดตั้งไปปิดไว้ ("ถามที่บันทึกทุกครั้ง")
for b in com.google.Chrome com.microsoft.Edge; do
  defaults delete "$b" PromptForDownloadLocation 2>/dev/null || true
done
ok "คืนค่า Chrome/Edge ให้ถามที่บันทึกไฟล์ตามเดิม"

say "เสร็จแล้ว"
echo "  ระบบ macOS ไม่ถูกแตะต้อง"
echo
echo "  เหลืออีก 1 อย่างที่สคริปต์ลบให้ไม่ได้:"
echo "    ส่วนขยายใน Chrome — เปิด chrome://extensions แล้วกด Remove ที่ VDO Gen Auto Pilot"
echo

if [ "$IS_APP_ROOT" = 1 ]; then
  echo "  กำลังลบโฟลเดอร์โปรแกรม: $ROOT"
  echo "  (หน้าต่างนี้จะปิดเอง)"
  # ลบโฟลเดอร์ที่ตัวเองอยู่ไม่ได้ตรง ๆ — ย้าย cwd ออกก่อนแล้วให้ตัวช่วยลบทีหลัง
  HELPER="$(mktemp "${TMPDIR:-/tmp}/vgap-rm.XXXXXX")"
  cat > "$HELPER" <<EOF
#!/bin/bash
sleep 2
rm -rf "$ROOT"
rm -f "$HELPER"
EOF
  chmod +x "$HELPER"
  cd /tmp || exit 0
  nohup "$HELPER" >/dev/null 2>&1 &
  sleep 3
  exit 0
fi

echo "กด Enter เพื่อปิดหน้าต่างนี้"; read -r _
