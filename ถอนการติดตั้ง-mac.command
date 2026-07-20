#!/bin/bash
# ============================================================
#  ถอนการติดตั้ง VDO Gen Auto Pilot (macOS) — ลบทุกอย่างในคลิกเดียว
#  ลบเฉพาะในโฟลเดอร์ผู้ใช้เอง ไม่แตะระบบ ไม่ต้องรหัสเครื่อง
#  ดับเบิลคลิกไฟล์นี้เพื่อถอนการติดตั้งทั้งหมด
# ============================================================
say(){ printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){  printf "\033[1;32m  \xe2\x9c\x93 %s\033[0m\n" "$1"; }

say "ถอนการติดตั้ง VDO Gen Auto Pilot"
echo "  จะลบ: แอป + เครื่องมือ + ข้อมูล (ในเครื่องคุณเท่านั้น ไม่แตะระบบ)"

# 1) หยุดโปรแกรมที่รันอยู่
pkill -f "VDO-Gen-AutoPilot/desktop.*main.py" 2>/dev/null
pkill -f "app=http://localhost:3001" 2>/dev/null
[ -x /opt/homebrew/bin/adb ] && /opt/homebrew/bin/adb kill-server 2>/dev/null
[ -x "$HOME/.vgap/bin/adb" ] && "$HOME/.vgap/bin/adb" kill-server 2>/dev/null
ok "หยุดโปรแกรม/เครื่องมือที่รันอยู่"

# 2) ลบไฟล์ทั้งหมด
rm -rf "$HOME/Applications/VDO-Gen-AutoPilot"          && ok "ลบโค้ดแอป (~/Applications/VDO-Gen-AutoPilot)"
rm -rf "$HOME/Applications/VDO Gen Auto Pilot.app"     && ok "ลบแอป (Applications)"
rm -rf "$HOME/Desktop/VDO Gen Auto Pilot.app"          && ok "ลบแอป (Desktop)"
rm -f  "$HOME/Desktop/เปิด VDO Gen Auto Pilot.command" 2>/dev/null
rm -rf "$HOME/.vgap"                                   && ok "ลบเครื่องมือ + ข้อมูล (~/.vgap)"

say "ถอนการติดตั้งเรียบร้อย"
echo "  ลบครบทั้งหมดแล้ว · ระบบ macOS ไม่ถูกแตะต้อง"
echo
echo "  (ลบไฟล์นี้เองได้เลยถ้าต้องการ)"
echo "กด Enter เพื่อปิดหน้าต่างนี้"; read -r _
