#!/bin/bash
# ============================================================
#  build-dmg.command — สร้างไฟล์ติดตั้ง macOS (.dmg) แบบไฟล์เดียว (unsigned)
#  ------------------------------------------------------------
#  โมเดลส่งมอบ = "เว็บ + สคริปต์หลังบ้าน" (เหมือนที่ทดสอบผ่านแล้ว)
#  ไม่ต้อง code-signing · ไม่ต้อง electron · ไม่ต้อง PyInstaller ฝั่ง Mac
#
#  ประกอบ payload (เฉพาะไฟล์ที่ใช้ runtime) → หุ้มเป็น .dmg ด้วย hdiutil
#    ผู้ใช้:  โหลดไฟล์เดียว (.dmg) → ดับเบิลคลิกเปิด → ลากโฟลเดอร์ออกมา →
#             ดับเบิลคลิก "ติดตั้ง-mac-noadmin.command" (ครั้งแรก) → เปิดโปรแกรม
#
#  ใส่ในแพ็ก:  desktop/ (ไม่รวม .venv/data) · extension/ · web/out · web/public ·
#             สคริปต์ติดตั้ง/เปิดโปรแกรม (mac) · คู่มือ
#  ไม่ใส่:     .git · desktop/.venv · web/node_modules · tests/ · __pycache__ · data
#
#  วิธีใช้:  ดับเบิลคลิกไฟล์นี้  (หรือ  bash build-dmg.command)
#  ผลลัพธ์:  dist/VDO-Gen-AutoPilot-<version>-mac.dmg   (dist/ ถูก gitignore)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

APP_FOLDER="VDO Gen Auto Pilot"       # ชื่อโฟลเดอร์ที่ผู้ใช้ลากออกมา
VOL_NAME="VDO Gen Auto Pilot"          # ชื่อ volume ตอน mount
DIST="$ROOT/dist"

say(){ printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }
ok(){  printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }
die(){ printf "\n\033[1;31m  ✗ %s\033[0m\n" "$1"; echo; exit 1; }

command -v hdiutil >/dev/null 2>&1 || die "ไม่พบ hdiutil (ต้องรันบน macOS)"
command -v rsync   >/dev/null 2>&1 || die "ไม่พบ rsync"

# ── เวอร์ชัน: อ่านจาก electron/package.json (มี jq ใช้ jq ไม่งั้น grep) ──
VERSION="1.0.0"
if [ -f "$ROOT/electron/package.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    VERSION="$(jq -r '.version' "$ROOT/electron/package.json" 2>/dev/null || echo "$VERSION")"
  else
    VERSION="$(grep -m1 '"version"' "$ROOT/electron/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || echo "$VERSION")"
  fi
fi
[ -n "$VERSION" ] || VERSION="1.0.0"
OUT="$DIST/VDO-Gen-AutoPilot-${VERSION}-mac.dmg"

# ── ตรวจของที่จำเป็นต้องมีก่อน build ──
say "[1/5] ตรวจไฟล์ที่ต้องมี"
[ -d "$ROOT/desktop" ]  || die "ไม่พบ desktop/"
[ -d "$ROOT/extension" ] || die "ไม่พบ extension/"
if [ ! -f "$ROOT/web/out/index.html" ]; then
  die "ไม่พบ web/out/index.html — build หน้าเว็บก่อน:  cd web && npm run build  (แล้ว commit web/out)"
fi
ok "desktop/ · extension/ · web/out พร้อม (version $VERSION)"

# ── โฟลเดอร์ staging ชั่วคราว ──
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/vgap-dmg.XXXXXX")"
PAYLOAD="$STAGE/$APP_FOLDER"
cleanup(){ rm -rf "$STAGE"; }
trap cleanup EXIT
mkdir -p "$PAYLOAD"

say "[2/5] ประกอบ payload (คัดเฉพาะไฟล์ runtime)"

# desktop/ — ตัด .venv, data, __pycache__, ไฟล์ผู้ใช้/secret ออก
rsync -a \
  --exclude '.venv' \
  --exclude 'data' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '*.pyo' \
  --exclude 'settings.json' \
  --exclude '.env' \
  "$ROOT/desktop/" "$PAYLOAD/desktop/"
ok "desktop/ (ไม่รวม .venv/data)"

# extension/
rsync -a --exclude '__pycache__' "$ROOT/extension/" "$PAYLOAD/extension/"
ok "extension/"

# web/out + web/public (ไม่รวม node_modules/.next)
mkdir -p "$PAYLOAD/web"
rsync -a "$ROOT/web/out/" "$PAYLOAD/web/out/"
[ -d "$ROOT/web/public" ] && rsync -a "$ROOT/web/public/" "$PAYLOAD/web/public/"
ok "web/out + web/public"

# สคริปต์ติดตั้ง/เปิดโปรแกรม (mac) + คู่มือ
for f in \
  "ติดตั้ง-mac-noadmin.command" \
  "ติดตั้ง.command" \
  "setup-mac.command" \
  "เปิดโปรแกรม-mac.command" \
  "คู่มือเริ่มต้น.md" \
  "README.md" ; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$PAYLOAD/$f"
done
chmod +x "$PAYLOAD"/*.command 2>/dev/null || true
ok "สคริปต์ติดตั้ง/เปิด + คู่มือ"

# อ่านก่อน — ขั้นตอนใช้งาน (วางที่รากของ volume ให้เห็นทันทีตอน mount)
cat > "$STAGE/อ่านก่อน-Mac.txt" <<'EOF'
VDO Gen Auto Pilot — ติดตั้งบน macOS (แบบไม่ต้องรหัสเครื่อง)
==============================================================

1) ลากโฟลเดอร์ "VDO Gen Auto Pilot" ออกไปวางที่ Desktop (หรือที่ไหนก็ได้)
   *ต้องลากออกมาก่อน* — รันจากในหน้าต่าง .dmg (อ่านอย่างเดียว) ไม่ได้

2) เปิดโฟลเดอร์ที่ลากออกมา → ดับเบิลคลิก "ติดตั้ง-mac-noadmin.command"
   - ถ้าเด้งเตือน "ไฟล์จากอินเทอร์เน็ต": คลิกขวาที่ไฟล์ → Open → Open
   - ตัวติดตั้งจะโหลด adb / scrcpy / ffmpeg ลงในเครื่องผู้ใช้เอง (ไม่แตะระบบ)

3) เปิดโปรแกรม: ดับเบิลคลิกทางลัดบน Desktop
   หรือดับเบิลคลิก "เปิดโปรแกรม-mac.command" ในโฟลเดอร์

ไฟล์นี้ไม่ได้เซ็นดิจิทัล (unsigned) — เป็นเรื่องปกติ กด Open ผ่านได้เลย
EOF
ok "อ่านก่อน-Mac.txt"

say "[3/5] สร้าง .dmg (hdiutil create UDZO)"
mkdir -p "$DIST"
rm -f "$OUT"
hdiutil create \
  -volname "$VOL_NAME" \
  -srcfolder "$STAGE" \
  -fs HFS+ \
  -format UDZO -imagekey zlib-level=9 \
  -ov \
  "$OUT" >/dev/null
ok "สร้างไฟล์: $OUT"
ls -lh "$OUT" | awk '{print "    ขนาด: "$5}'

# ── ตรวจสอบตัวเอง: mount → ดูข้างใน → unmount (พิสูจน์ว่าใช้ได้จริง) ──
say "[4/5] ตรวจสอบ (mount .dmg → ดูเนื้อในจริง → unmount)"
MNT="$(mktemp -d "${TMPDIR:-/tmp}/vgap-mnt.XXXXXX")"
hdiutil attach "$OUT" -mountpoint "$MNT" -nobrowse -readonly >/dev/null
ok "mount ที่ $MNT"
echo "    --- เนื้อใน .dmg ---"
ls -1 "$MNT" | sed 's/^/      /'
FAIL=0
[ -d "$MNT/$APP_FOLDER/desktop" ]                        || { warn "ขาด desktop/"; FAIL=1; }
[ -f "$MNT/$APP_FOLDER/web/out/index.html" ]             || { warn "ขาด web/out/index.html"; FAIL=1; }
[ -f "$MNT/$APP_FOLDER/ติดตั้ง-mac-noadmin.command" ]     || { warn "ขาดตัวติดตั้ง"; FAIL=1; }
[ -d "$MNT/$APP_FOLDER/extension" ]                      || { warn "ขาด extension/"; FAIL=1; }
[ ! -d "$MNT/$APP_FOLDER/desktop/.venv" ]                || { warn ".venv หลุดเข้าไป (ควรตัดออก)"; FAIL=1; }
hdiutil detach "$MNT" >/dev/null 2>&1 || hdiutil detach "$MNT" -force >/dev/null 2>&1 || true
rmdir "$MNT" 2>/dev/null || true
[ "$FAIL" -eq 0 ] && ok "ตรวจครบ: มี installer + desktop + web/out + extension, ไม่มี .venv" \
                  || die "โครงสร้างใน .dmg ไม่ครบ (ดูคำเตือนด้านบน)"

say "[5/5] เสร็จ"
echo "  ไฟล์ส่งมอบ (ไฟล์เดียว):  $OUT"
echo "  ผู้ใช้: ดับเบิลคลิก .dmg → ลากโฟลเดอร์ออก → รัน ติดตั้ง-mac-noadmin.command"
