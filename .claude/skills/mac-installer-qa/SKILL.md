---
name: mac-installer-qa
description: Real end-to-end QA for the VDO Gen Auto Pilot macOS installer + onboarding. Every check RUNS a real command and shows real output — never rubber-stamp, never write a test just to make it pass. Use before shipping the installer .dmg or after changing bootstrap.sh, build-mac-installer-app.command, ติดตั้ง-mac-noadmin.command, web/components/Onboarding.js, or the /api/ext/* backend endpoints.
---

# mac-installer-qa

Real QA runbook. **Rule: no check passes without real command output as evidence. If something cannot be run, report it as NOT VERIFIED — do not claim pass.** Fail loud.

Repo root: `/Users/nattakit/Desktop/Project/My-Work/shopee-automation`
Public distro repo (installer pulls this): `NATX0XD/Video-Affliate` branch `main`
Tarball: `https://github.com/NATX0XD/Video-Affliate/archive/refs/heads/main.tar.gz` (extract prefix `Video-Affliate-main/`)

## 1. Syntax (real)
- `bash -n build/mac-installer/bootstrap.sh build/mac-installer/installer build-mac-installer-app.command ติดตั้ง-mac-noadmin.command เปิดโปรแกรม-mac.command`
- `node -c extension/background.js`
- `python3 -c "import ast; ast.parse(open('desktop/services/web_server.py').read())"`

## 2. Web build (real — no stale web/out)
- `cd web && npm install && npm run build`  (next 16, `output:export` → `web/out`)
- Confirm new UI compiled: `grep -rl "chrome://extensions" web/out/_next` (must hit). Also "Load unpacked", "ต่อส่วนเสริมแล้ว".

## 3. Installer .dmg (real mount)
- `bash build-mac-installer-app.command` → `dist/VDO-Gen-AutoPilot-Installer-mac.dmg`
- `hdiutil attach ... -nobrowse -mountpoint /tmp/qa-dmg` (detach stale first; **always detach at end**)
- `.app` checks: `plutil -lint Contents/Info.plist`; `Contents/MacOS/installer` +x + shebang; `Contents/Resources/bootstrap.sh` +x; `icon.icns` present; `codesign --verify` = valid + `Signature=adhoc`.
- bootstrap.sh in dmg must contain: `make_launcher_app`, `self_cleanup`, auto-open (`open "$HOME/Applications/$LAUNCHER_NAME.app"`), `VGAP_NO_PAUSE=1 bash "$DEPS"`.
- `อ่านก่อน-Mac.txt` must contain `Open Anyway` + `wants to control Terminal`.

## 4. Tarball parity (remote == what installer actually downloads)
- Download + extract tarball. Compare against local `Nattakit` tree:
  - `desktop/services/web_server.py` has `/api/ext/open` + `/api/ext/path`
  - `ติดตั้ง-mac-noadmin.command` has `SCRCPY_VER="4.0"` + `VGAP_NO_PAUSE`
  - `extension/background.js` has `pingDesktop` (onInstalled/onStartup)
  - `web/out/_next` has `chrome://extensions`
- If remote is behind local Nattakit → re-push snapshot BEFORE shipping.

## 5. Runtime smoke (real server — NOT a mock)
- Fresh venv: `python3 -m venv /tmp/qa-venv && /tmp/qa-venv/bin/pip install -q -r desktop/requirements.txt`
- `cd desktop && VGAP_DATA_DIR=/tmp/qa-data(empty data/ + settings.json '{}') /tmp/qa-venv/bin/python main.py &`  (NO VGAP_OPEN_BROWSER)
- curl real: `/api/status`→200, `/api/ext/path`→`{ok,path,exists:true}`, `/api/setup`→`configured:false` (fresh), `/` serves onboarding.
- Kill server, verify `lsof -iTCP:3001` free + no `main.py` proc. Clean temp dirs. Never leave server/browser running.

## 6. Onboarding visual (real browser)
- playwright: navigate `localhost:3001`, fill ชื่อร้าน → ถัดไป → (คีย์ AI) ข้ามไปก่อน → land **step 3/5 "ส่วนเสริมเบราว์เซอร์"**. Screenshot.
- Confirm rendered: stepper shows 5 steps, ext step has "เปิด chrome://extensions + โฟลเดอร์" button + path code box + ก๊อป button + "กำลังรอตรวจจับส่วนเสริม".
- `browser_close` after. Remove stray screenshots from repo.

## 7. Adversarial review (read, hunt real bugs)
Read bootstrap.sh + Onboarding.js + web_server ext endpoints. Look for: step/gate index mismatch after 4→5 reindex; `self_cleanup` closing wrong Terminal window; auto-open racing the close; `_open_extensions_page` subprocess quoting; silent failures; ext-ping TDZ. Report file:line + concrete failure scenario, not vibes.

## Output
Per check: PASS/FAIL/NOT-VERIFIED + the real command + decisive output line. End with a go/no-go for shipping the .dmg. Any FAIL blocks ship.
