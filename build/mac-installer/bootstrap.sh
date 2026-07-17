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

# ---- [4/4] เรียกตัวติดตั้ง deps ที่มากับ repo (ห้าม reimplement) ----
say "[4/4] ติดตั้งเครื่องมือ (venv + adb/scrcpy/ffmpeg ลง ~/.vgap/bin)"
DEPS="$APP_DIR/ติดตั้ง-mac-noadmin.command"
[ -f "$DEPS" ] \
  || fail "ไม่พบตัวติดตั้งเครื่องมือในโค้ดที่โหลดมา: $DEPS" \
          "โค้ดอาจโหลดมาไม่ครบ — ดับเบิลคลิกตัวติดตั้งใหม่อีกครั้ง"
# เรียกตรง ๆ ให้ผู้ใช้เห็น progress; VGAP_NO_PAUSE=1 กันตัว deps หยุดรอ Enter ซ้ำ
# (bootstrap มี hold ปิดท้ายเองแล้ว) และกัน read เจอ EOF ไปทริก set -e ใน deps
if ! VGAP_NO_PAUSE=1 bash "$DEPS"; then
  fail "ติดตั้งเครื่องมือไม่สำเร็จ" \
       "ต่อเน็ตให้เสถียรแล้วดับเบิลคลิกตัวติดตั้งใหม่ หรือส่งรูป error ในหน้าต่างให้ทีมงาน"
fi

# ---- เสร็จ ----
say "ติดตั้งเสร็จแล้ว"
cat <<EOF

  ✅ VDO Gen Auto Pilot พร้อมใช้งานแล้ว

  โค้ดโปรแกรมอยู่ที่:  $APP_DIR

  วิธีเปิดโปรแกรม:
    • ดับเบิลคลิกทางลัด "เปิด VDO Gen Auto Pilot" บนหน้าจอ Desktop
    • หรือดับเบิลคลิก  เปิดโปรแกรม-mac.command  ในโฟลเดอร์ด้านบน

  อยากอัปเดตเป็นเวอร์ชันล่าสุดภายหลัง: เปิดตัวติดตั้งนี้ซ้ำได้เลย
  (ข้อมูล/ตั้งค่าของคุณอยู่ใน ~/.vgap จะไม่ถูกลบ)
EOF
hold
