# PRP Plan — Refactor VDO Gen Auto Pilot เป็น "แอปเดียว" (Unified App)

> สร้างจากการวิเคราะห์ทั้ง codebase (desktop 4.3k · extension 6.5k · web 4.4k LOC) โดย 9 agents
> Branch: `refactor/unified-app` · ผู้ใช้ปลายทาง = คนทั่วไป ไม่เขียนโค้ด บนเครื่องที่แจกให้

---

## 1. เป้าหมาย & การตัดสินใจ (ยืนยันจากเจ้าของ)

| เรื่อง | มติ |
|---|---|
| **G1 แอปเดียว** | local-server + web UI ที่ `:3001` + **PWA install** · extension = engine เบื้องหลัง · **ต้องติดตั้งแบบกดครั้งเดียว ไม่ต้องพิมพ์ command** |
| **G4 สร้างวิดีโอ** | **Dual-track + Flow adapter อัปเดตได้จากระยะไกล** — dev แก้ selector เมื่อ Google Flow เปลี่ยน UI, user กดปุ่ม "อัปเดตตัวเชื่อม Flow" (ไม่ต้องลงโปรแกรมใหม่ทั้งตัว) + นำร่อง Veo API ขนาน |
| **G5 มือถือ** | เครื่องเดียวก่อน + ออกแบบ schema/UI เผื่อหลายเครื่อง · **แก้ปัญหา Mac ต่อ ADB ไม่ติด** (สาย + ไร้สาย) · USB-C↔USB-C Android |
| **ขอบเขต** | ทำครบ 6 เฟส + autonomous loop + QA |
| API key (default) | **proxy ผ่าน backend + shared token** (เลิกส่ง plaintext) |
| AutoPilot (default) | จำค่าใน DB, ครั้งแรก default ปิด |
| License (default) | ซ่อนสถานะที่สับสนก่อน, unify + เปิดใช้เมื่อพร้อมแจก |
| Distribution (default) | run-from-source launcher (Mac+Win) + PWA · ตัด portable-exe · Electron = optional อนาคต |

---

## 2. สถาปัตยกรรมปัจจุบัน (ปัญหา)

**2 runtime + 2 state store + ส่งไฟล์ผ่านโฟลเดอร์ร่วม, ไม่มี auth (CORS \*):**
- **Extension (MV3)** — ดึงสินค้า (`content/scraper.js`) + สร้างคลิปผ่าน Google Flow (`content/flow.js` ขับ labs.google ด้วย `chrome.debugger`) + `background.js` เรียก Gemini + หมุนบัญชี/เครดิต · state ใน `chrome.storage.local` (products, flow_jobs, credits)
- **Desktop** — FastAPI `:3001` + SQLite (`db.py`) + AutoPilot โพสต์ผ่าน ADB · เสิร์ฟ web UI (`web/out`) จากพอร์ตเดียวกัน (`web_server.py:1096`)
- **สะพาน** — extension↔desktop ผ่าน `apiBase()` HTTP + ไฟล์คลิปเดินทางผ่าน `~/Downloads/flow` (hardcode)

**บั๊ก/หนี้ที่ยืนยันแล้ว:**
- 🔴 **data-loss**: `settings.json` git-tracked + `update.ps1` `git reset --hard` → ค่าตั้ง user หายทุกครั้งที่อัปเดต
- 🔴 **API key รั่ว**: `/api/flow/config` ส่ง `google_api_key` plaintext (`web_server.py:671`) ขณะที่ mask ให้ browser · CORS `*`
- 🟠 **`gen_progress` = dead code**: `web/components/GenProgress.js` รอ WS event ที่ไม่มีใครยิง → progress สร้างวิดีโอโชว์เป็นขั้นตอนไม่ได้
- 🟠 **"ได้รูปแทนวิดีโอ/error"**: DOM scraping labs.google เปราะ + ไม่ verify output จริง (เฟส frames→video ล้ม = คืนรูป)
- 🟠 **ADB not vendored**: `electron/bin` ว่าง, `manager.py`/`post_verifier.py` พึ่ง PATH → "ADB not found" (ยืนยันบน Mac) · Wi-Fi ADB ทำครึ่งเดียว
- 🟠 **verify คืน success เงียบ** เมื่อไม่มั่นใจ → move เข้า DONE ทั้งที่อาจไม่สำเร็จ
- 🟡 catch เงียบทั่วระบบ, ไม่มี validation, ช่องพอร์ตแก้อิสระ, ไม่มี lock การโพสต์

---

## 3. สถาปัตยกรรมเป้าหมาย

> **"Local server คือแอป · extension คือ engine บางๆ · SQLite คือ source of truth เดียว · web UI ที่ :3001 คือหน้าจอเดียว"**

1. **State เดียว** — SQLite เป็น source of truth ของทั้งไปป์ไลน์ (`products → jobs → clips → posts`) + `/api/queue` (push/claim/next) · extension เปลี่ยนบทเป็น "collect + drive": ดูดสินค้า→push DB, ดึงงานถัดไปจาก DB, ขับ Flow, รายงาน step, upload mp4 multipart (เลิกโฟลเดอร์ Downloads ร่วม) · ยุบ dashboard/sidepanel ของ extension เหลือ bridge บางๆ
2. **UI เดียว** ที่ backend เสิร์ฟ — onboarding stepper, ไทม์ไลน์เดียว (สินค้า→คลิป→โพสต์), progress การ gen เป็นขั้นตอน, คลังคลิป, โพสต์, จัดการมือถือ
3. **สะพานแข็งแรง** — proxy Gemini ผ่าน backend + shared localhost token + จำกัด CORS + validate settings allowlist
4. **gen แบบ dual-track** — hardening Flow (selector map + retry/verify) + **Flow adapter อัปเดต remote** + นำร่อง Veo API

---

## 4. ดีไซน์ 3 เรื่องที่เจ้าของถาม

### 4.1 ติดตั้งแบบกดครั้งเดียว (ไม่พิมพ์ command)
ตัวติดตั้ง double-click ตัวเดียวต่อ OS ที่ทำทุกอย่างอัตโนมัติ:
- **Windows** — `ติดตั้ง.bat` (ดับเบิลคลิก) → bootstrap: เช็ก/ลง Python·adb·scrcpy·ffmpeg (ผ่าน winget/direct-download ที่ `setup-prereqs.ps1` ทำอยู่แล้ว) → ดึงแอป (git/zip) → **สร้าง shortcut บน Desktop** ชี้ `เปิดโปรแกรม.vbs` → เปิดเบราว์เซอร์ให้ · โชว์ progress bar ระหว่างลง
- **Mac** — `ติดตั้ง.command` (ดับเบิลคลิก) → bootstrap: ลง Homebrew ถ้าไม่มี → `brew install python adb scrcpy ffmpeg` → ดึงแอป → สร้าง `.command` launcher + ไอคอนบน Desktop
- **PWA "ติดตั้งเป็นแอป"** — หลังเปิดครั้งแรก Chrome เด้ง "Install" → ได้ไอคอนเหมือนแอปจริง (manifest.webmanifest + service worker)
- เหตุผล: เลี่ยง packed-exe ที่โดน antivirus + ไม่ต้อง code-sign · user แค่ดาวน์โหลด 1 ไฟล์แล้วดับเบิลคลิก
- host installer บน GitHub Release / short URL

### 4.2 Flow adapter อัปเดต remote (แก้ปัญหา Google Flow เปลี่ยน UI)
แยก selector + step logic ที่เปราะออกจาก code เป็น **ไฟล์ adapter มีเวอร์ชัน** ที่ fetch จาก remote ได้:
- `flow-adapter.json` = { version, selectors{}, steps[], minAppVersion } · bundle ตัวปัจจุบันเป็น fallback
- extension อ่าน adapter ตอน runtime แทน hardcode selector
- ในแอปมีปุ่ม **"อัปเดตตัวเชื่อม Google Flow"** (+ auto-check ตอนเปิด) → fetch `flow-adapter.json` จาก GitHub raw → validate → hot-swap → โชว์เวอร์ชัน + badge "มีอัปเดต"
- workflow ของ dev: Google Flow เปลี่ยน UI → dev แก้ `flow-adapter.json` push → **user กดอัปเดตปุ่มเดียว fix ทันที ไม่ต้องลงโปรแกรมใหม่**
- 2 ช่องอัปเดตแยกกัน: **"อัปเดตโปรแกรม"** (โค้ด/ฟีเจอร์ นานๆที) กับ **"อัปเดตตัวเชื่อม Flow"** (selector เมื่อ Google เปลี่ยน — เบา/เร็ว)

### 4.3 แก้ Mac ต่อ ADB ไม่ติด
สาเหตุยืนยัน: log "ADB not found" = adb ไม่ได้ลงบน Mac (ไม่มีใน PATH)
- fix: Mac bootstrap `brew install android-platform-tools` + **vendor adb/scrcpy/ffmpeg ต่อ OS** → resolve bundled path แทนพึ่ง PATH (แก้ `manager.py` + `post_verifier.py`)
- USB-C↔USB-C Android: adb ทำงานได้เมื่อลง adb + เปิด USB debugging + กด Allow
- Wi-Fi ADB: ต้อง `adb tcpip 5555` (bootstrap ผ่าน USB ก่อน) + Android 11+ `adb pair`

---

## 5. เฟสการทำ (6 เฟส) + Validation gates

> QA gate ทุกเฟส: `py_compile` ทุกไฟล์ · `cd web && npm run build` ผ่าน · adversarial self-review (correctness + silent-failure) · ไม่มี test เดิม → เพิ่ม smoke test เท่าที่ทำได้

### Phase 0 — หยุดเลือด (S · ทำก่อน · backend-only · auto-validate ได้)
- [ ] ย้าย `DATA_ROOT` ออกนอก repo → `~/.vgap` **ทุกโหมด** (ไม่ใช่แค่ frozen) — `config.py:12-31`
- [ ] `git rm --cached desktop/settings.json` + gitignore + migrate ค่าเดิมครั้งเดียว (จาก repo → ~/.vgap)
- [ ] สร้าง `adb_path` resolver กลาง (bundled → PATH → error ชัด) แก้ `manager.py` + `post_verifier.py` ที่ hardcode `'adb'`
- [ ] harden verify: แยกสถานะ `unverified` ไม่ move เข้า DONE เงียบ — `post_verifier.py` / `autopilot.py`
- [ ] mutual-exclusion lock บนการโพสต์ ADB (กันโพสต์ชนกัน) — `autopilot.py`/`adb`
- **Gate:** py_compile ผ่าน + review ยืนยัน data-loss/verify แก้จริง + ไม่มี regression import

### Phase 1 — Quick UX win (M · เสี่ยงต่ำ · additive)
- [ ] เดินสาย `gen_progress` ครบวง: extension ยิง `{stage,detail,pct}` → `POST /api/flow/progress` → WS `gen_progress` → `GenProgress.js` เป็น vertical step checklist + ซ่อน log ดิบใต้ "รายละเอียด"
- [ ] copy/glossary กลาง (`web/lib/copy.js` + map ฝั่ง extension) แทนศัพท์ IT (License Key→รหัสเปิดใช้งาน, ADB→การเชื่อมมือถือ, prompt→คำสั่งบอก AI, render→AI กำลังสร้างวิดีโอ ฯลฯ)
- [ ] UI primitives: `Stepper`, `InfoTooltip`, `Dialog`, `FormField` + รวม design token ชุดเดียว
- [ ] global toast แทน catch เงียบ + gate ปุ่มตามสถานะเชื่อมต่อ
- **Gate:** next build ผ่าน + review UX copy + primitives reusable

### Phase 2 — Onboarding stepper + prereq/device test (L)
- [ ] stepper เดียวในเว็บ: ลง extension → เมล Google Flow + Google API key + ชื่อร้าน + ค่าเริ่มต้น (ที่เดียว) → checklist prereq (login Flow/Shopee) → เชื่อมมือถือ + ปุ่มทดสอบ · ทุกช่องมี InfoTooltip
- [ ] **ขั้น "ตรวจ/ติดตั้งเครื่องมือ" ในตัว onboarding ทั้ง Mac+Win** (feedback เจ้าของ): เช็ก adb/scrcpy/ffmpeg มีไหม → ถ้าขาด โชว์ปุ่ม/คำสั่งติดตั้ง (Win=setup-prereqs.ps1, Mac=setup-mac.command) · **สร้างแล้ว: setup-mac.command + เปิดโปรแกรม-mac.command** (Mac ไม่เคยมี = เหตุ ADB ต่อไม่ติด) · ปลายทาง Phase 5 = vendor binary ไม่พึ่ง PATH
- [ ] backend signal ตรวจ login Google Flow / Shopee (ผ่าน extension)
- [ ] Wi-Fi ADB ครบ: `adb tcpip` + pairing (Android 11+) + ช่องพอร์ต + ปุ่มทดสอบ (tap+screenshot) · แก้ Mac connect
- [ ] validate API key + ปุ่มทดสอบคีย์ · wire device-readiness (kbd/awake) จริง (เลิก mock)
- **Gate:** next build + review flow ครบ + ทดสอบ connect บนเครื่องจริง (เจ้าของ)

### Phase 3 — รวม state / flow เดียว (L · แกน G3)
- [ ] SQLite = single source of truth + `/api/queue` (push/claim/next)
- [ ] extension: push สินค้าเข้า DB + ดึงงานจาก DB + upload mp4 **multipart** (เลิก `~/Downloads/flow`) + รายงาน step · sync logic เครดิต/สลับบัญชีกับ DB
- [ ] ยุบ dashboard/sidepanel ของ extension เป็น bridge บางๆ + ไทม์ไลน์เดียวในเว็บ (สินค้า→คลิป→โพสต์)
- **Gate:** review resume/regression คิว gen เดิม + smoke: push→claim→upload path

### Phase 4 — Harden generation + ปิดช่องสะพาน (M-L)
- [ ] Flow adapter (§4.2): selector map กลาง + fetch remote + ปุ่มอัปเดต + fallback
- [ ] retry/verify ต่อเฟส + verify output จริง (`<video>` duration>0, retry เฉพาะ frames→video ไม่เสียเครดิตซ้ำ) + เลิก timeout ตายตัว
- [ ] proxy Gemini ผ่าน backend + shared token + จำกัด CORS + settings allowlist + เลิกส่ง key plaintext
- **Gate:** review security (ไม่มี key รั่ว) + build + ทดสอบ gen จริง (เจ้าของ)

### Phase 5 — Consolidate distribution + ship-ready (M)
- [ ] one-click installer §4.1 (Win `.bat` + Mac `.command`) + PWA (manifest + service worker + install prompt)
- [ ] vendor binary (adb/scrcpy/ffmpeg) ต่อ OS + pin scrcpy server jar ก่อน PATH
- [ ] เปิด/unify license gate + ตัดสิน default AutoPilot (persist DB) + ตัด portable-exe ทิ้ง
- **Gate:** ติดตั้งจริงบนเครื่องเปล่า Mac+Win (เจ้าของ)

### Phase 6 — ยุทธศาสตร์/optional (XL)
- [ ] นำร่อง Veo/Gemini video API → ถ้า cost/feature ผ่าน migrate gen ออกจาก extension = แอปเดียวจริง
- [ ] ทบทวน Electron installer + code-signing เมื่อมีงบ

---

## 6. QA Loop strategy
- ใช้ **Workflow orchestration** (native harness): แต่ละเฟส = implement → QA verify (py_compile + `next build` + adversarial review หา correctness/silent-failure/regression) → fix → วนจนผ่าน (max N รอบ)
- เฟสที่ auto-validate ได้: 0, 1, code-portion ของ 2-4
- เฟสที่ **ต้องเจ้าของทดสอบจริง** (Workflow ตรวจ code ได้แต่ runtime ไม่ได้): Google Flow gen (2,4), ADB/มือถือจริง (2,5), ติดตั้งบนเครื่องเปล่า (5)
- (caveman = external tool; harness นี้มี loop-with-QA ในตัวแล้ว ใช้ได้เลย — ถ้าอยากใช้ caveman จริงค่อยพิจารณาแยก)

## 7. ความเสี่ยงหลัก
- Google Flow อยู่นอกการควบคุม → hardening เป็นของชั่วคราว (Flow adapter ช่วยลดเวลาแก้ แต่ตัดความเสี่ยงจริงได้ด้วย Veo API เท่านั้น)
- รวม state แตะ logic เครดิต/สลับบัญชีที่ใช้งานอยู่ → เสี่ยง regression
- ไม่มี automated test + ต้องทดสอบกับ Flow/มือถือจริง → regression ตรวจยาก
- Veo API: ต้นทุน/feature parity ไม่แน่ → อย่าเดิมพันก่อนนำร่อง
