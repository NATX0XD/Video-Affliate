# Shopee VDO Gen — Production Roadmap (Commercial)

> เป้าหมาย: ยกระดับเป็นผลิตภัณฑ์ที่ **ขายให้ลูกค้าได้** — ลูกค้าติดตั้งบนคอมตัวเอง
> (1 ลูกค้า = 1 คอม + 1..n มือถือผ่าน ADB), UI ทันสมัย user-friendly,
> มี License gate + รหัสผ่าน + ตั้งชื่อร้าน

---

## 🧱 กฎเหล็ก 3 ข้อ (ทุกฟีเจอร์ต้องผ่าน)

### 1. Local-first — ไม่มี server ของเรา
ลูกค้ารันบนเครื่องตัวเองล้วน ๆ เราไม่โฮสต์อะไรให้
- ✅ รันในเครื่อง: สร้างคลิป (ffmpeg), คิว (SQLite), รายงาน, rules, ตัดต่อ, ADB
- 🟡 เรียก API ภายนอกได้ **ถ้าเครื่องลูกค้ายิงตรงด้วย key ตัวเอง** (Gemini/D-ID/Flow/โพสต์) — ไม่ถือว่าผ่าน server เรา
- 🔴 ห้าม/เลี่ยง: inbound webhook, multi-user server, cloud render
  - บอท Telegram → ใช้ long-polling จากเครื่องลูกค้า (ไม่ต้อง public URL)
  - สำรองข้อมูล → Drive ของลูกค้าเอง
  - proxy → ลูกค้าใส่เอง

### 2. Automation-first — ⭐ NEAR-ZERO TOUCH (สำคัญสุด!)
> **ลูกค้าแทบไม่แตะคอม/มือถือเลย** — ระบบเป็นเครื่องจักรที่ดูแลตัวเองได้ ไม่ใช่แค่ "กดน้อยลง"
> ตั้งครั้งเดียว → รันเองตลอด → ลูกค้าแค่ดูผ่านมือถือเป็นครั้งคราว

- ไปป์ไลน์เดียวต่อเนื่อง: หา → สร้าง → (อนุมัติ) → โพสต์ → ติดตาม รันเองหมด
- **โพสต์ = อัตโนมัติ** · **รีวิว = ออปชัน** (ดีฟอลต์ auto-approve)
- Rules engine = สมองของออโต้ ("ถ้า...แล้ว...")

**สิ่งที่ "near-zero touch" บังคับให้ต้องมี (เพราะไม่มีคนคอยแก้):**
- 🔧 **Self-healing** — ADB หลุด→ต่อใหม่เอง, login มือถือหมดอายุ→ล็อกอินเอง, error→retry/กู้คืนเอง, ไม่ค้างรอคน
- 🤖 **มือถือทำเองล้วน** — เปิดแอป/อัป/โพสต์/ปิด popup เอง + **OCR ยืนยันโพสต์สำเร็จจริง**
- 🚀 **Always-on** — auto-start เมื่อเปิดเครื่อง, รัน background, ฟื้นงานค้างหลังรีสตาร์ท
- 📲 **คุม/ดูจากมือถือทางไกล** — Telegram bot (local polling): ดูสถานะ/สั่งหยุด/อนุมัติ ได้โดยไม่ต้องนั่งหน้าคอม
- 🛡 **กันพังเงียบ** — budget/quota guard, แจ้งเตือนเมื่อพลาด/ต้องการคน, ปุ่มหยุดฉุกเฉิน
- 🎯 **Onboarding สั้นสุด** — ตั้งค่าให้น้อยที่สุด (ลูกค้าแทบไม่แตะ แม้แต่ตอนเริ่ม)

### 3. ยืดหยุ่นสุด — ปรับได้โดยไม่แก้โค้ด
- Config-driven ทั้งหมด (ไม่ hardcode)
- ตัวออกแบบเทมเพลตเอง (ลากวาง)
- Rules engine no-code ("ถ้า...แล้ว...")
- Prompt/สคริปต์ template แก้ได้
- โปรไฟล์/พรีเซ็ต import-export
- โครง plugin (เพิ่ม engine/แพลตฟอร์มได้)

---

## กลยุทธ์ 2 สเตจ (สำคัญ)

> **โฟกัสตอนนี้ = Stage A เท่านั้น** — ทำตัว local ให้เจ๋ง/ใช้ดี/ฟีเจอร์ครบก่อน
> ค่อยทำ Stage B (เปลี่ยนเป็นสินค้าขาย) ทีหลัง

| Stage | ขอบเขต | เฟส |
|-------|--------|-----|
| **A — Local product (ตอนนี้)** | ออโต้เต็มระบบ, เสถียร, UI สวย, ยืดหยุ่น, ฟีเจอร์ครบ | A0–A7 |
| **B — Commercialize (ทีหลัง)** | License, password gate, onboarding, Electron, vendor server | B1–B2 |

---

## การตัดสินใจหลัก (ตกลงแล้ว — บางส่วนใช้ตอน Stage B)

| หัวข้อ | เลือก |
|--------|-------|
| โมเดลใช้งาน | Local ต่อลูกค้า (คอม + มือถือ ADB) |
| Packaging | **Electron** คลิกเดียว (Python = sidecar, Next.js = build แล้ว serve) |
| License | **Hybrid** (online activate + offline grace) — รองรับทั้ง subscription & perpetual |
| ราคา | ยังไม่สรุป → license design ต้องรองรับทั้งสอง (`type` + `expiry`) |
| UI | ทันสมัย ไม่เหมือน AI สร้าง, user-friendly ที่สุด, ยืดหยุ่น |

---

## สถาปัตยกรรมเป้าหมาย

```
┌─ ฝั่งคนขาย (Vendor) ─────────────┐
│ License Server (เล็ก)            │  ออก/ตรวจ/revoke key, ผูก machine ID
│ License Issuer CLI               │  เซ็น license ด้วย RSA private key (keys/)
└──────────────┬───────────────────┘
               │ activate / heartbeat (online) + offline grace token
┌──────────────▼─ ฝั่งลูกค้า (1 เครื่อง) ──────────────────────────┐
│ Electron App (.dmg/.exe)                                        │
│  ├─ UI: Next.js build (login, onboarding, dashboard)            │
│  ├─ Python backend (sidecar): WebServer + workers + ADB        │
│  └─ ฝัง Chrome extension + flow ติดตั้ง                          │
│         │                                                       │
│         ▼ ADB                                                   │
│   มือถือ (โพสต์คลิป Shopee)                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## ข้อสรุปฟีเจอร์ (ล็อกแล้ว)

### จุดขายหลัก (headline)
- 🆓 **AI ออฟไลน์ฟรี (สำคัญมาก — เสาหลัก)** — local model เป็นพลเมืองชั้นหนึ่ง, API เป็นออปชัน
- 🎭 Brand persona ร้าน · 💸 คุมต้นทุน+งบ · 🧠 แอปเรียนรู้สไตล์ผู้ใช้

### หลักการเอนจินวิดีโอ (สำคัญ)
> **ตัวสร้างคลิปจริง = Google Flow** (ขับผ่าน extension `flow.js` → labs.google)
> Template(ffmpeg)/Avatar(D-ID)/Veo = ทางเลือกสำรอง
>
> แยกหน้าที่ให้ฉลาด:
> - ✍️ prompt/สคริปต์/ฮุก/แคปชัน → **AI ฟรี (local) ทำได้ดี** ประหยัด Gemini quota
> - 🎬 ตัวคลิปจริง → **Google Flow** (ใช้ Flow credit) — ไม่เปลี่ยน
> - 🔊 พากย์ (ถ้าต้อง) → local TTS (ฟรี) หรือ D-ID เดิม
>
> ต้นทุนหลักของระบบ = **Flow credit + Gemini quota** → ฟีเจอร์ "ประเมินราคาก่อนกด + คุมงบ" สำคัญมาก

### วงจรหลัก 5 ขั้น
หา → สร้าง → รีวิว(อนุมัติ) → โพสต์ → ติดตาม
- ขั้น **"หา"** ต้องมี **ค้นหาด้วยคีย์เวิร์ด** ("รองเท้า" → ดูดเฉพาะรองเท้า)
  - ฐานมีอยู่แล้วใน `scraper.js` (`#__sc_search`) → ยกเป็นฟีเจอร์หลัก
  - + ตัวกรอง: ค่าคอมขั้นต่ำ/ราคา/เรตติ้ง/จำนวน + บันทึกคีย์เวิร์ดที่ใช้บ่อย

---

## เฟสงาน — Stage A (Local product) 🎯 โฟกัสตอนนี้

> หลักคิดลำดับ: **ออโต้ต้องเสถียรก่อน → แล้วค่อยสวย → แล้วค่อยเก่ง**

### A0 — รากฐาน ⚡ ✅ เสร็จแล้ว (commit 7a79067)
- [x] `git init` ทั้ง repo เดียวที่ root (backup web/.git → `_archive/web-git-backup`)
- [x] แก้ port mismatch — `web/lib/api.js` + `web/hooks/useWebSocket.js` 5000 → 3001
- [x] ย้าย legacy → `_archive/` (`desktop/ui`, `extension-legacy`)
- [x] `chmod 600` keys/.control_* (ล็อก private key)
- [x] `.gitignore` รวม + `.env.example` (desktop+web) + `README.md`

### A1 — ความเสถียร + Near-zero touch (หัวใจของออโต้) 🔴
> "ลูกค้าแทบไม่แตะ" จะเป็นจริงได้ต้องมีอันนี้ก่อน — แตกเป็นชิ้นย่อย

- [x] **A1.1 — SQLite job store** ✅ (commit 1710d9e)
  - `services/db.py`: JobStore (lifecycle, atomic claim, retry/attempts, cost, stats)
  - `reset_stuck()` resume งานค้าง + `migrate_folders()` นำเข้าคลิปเดิม
  - wire init ใน main.py (additive — worker ยังเดิม)
- [x] **A1.2 — ย้าย pipeline มาใช้ DB** ✅ (Flow คือเส้นทางหลัก)
  - [x] A1.2a — Flow generation queue → DB (8523d48): enqueue/next/video/status
  - [x] A1.2c — PostWorker → DB (e866335): claim generated→posting→posted/error
  - [x] A1.2b — read API จาก DB (5610a95): /api/status + /api/videos เป็น source of truth
  - หมายเหตุ: legacy Veo Worker/GenWorker ยังเดิม (Flow คือเส้นทางหลัก) — migrate ภายหลังถ้าจำเป็น
- [x] **A1.3 — Retry + verify** ✅
  - [x] A1.3a — auto-retry + exponential backoff (1273d03)
  - [x] A1.3b — verify โพสต์สำเร็จด้วย Gemini Vision, conservative (e34dcad)
  - ※ ส่วนเรียก Gemini Vision จริงต้องเทสต์กับ key + มือถือจริง (ยังไม่ได้รัน)
- [x] **A1.4 — Budget/quota guard** ✅ (509be35) — งบรายเดือน+ราคาต่อคลิป, หยุดเองเมื่อเกิน, snapshot ให้ค็อกพิต
- [~] **A1.5 — Self-healing** (บางส่วน)
  - [x] keyguard auto-dismiss + keep-awake (autoposter._wake) — validate บนมือถือจริงแล้ว
  - [ ] watchdog งานค้าง generating นานเกิน → requeue (ทำได้ ไม่ต้องมีมือถือ)
  - [ ] ADB หลุด → reconnect เอง
- [ ] **A1.6 — Always-on** — auto-start เมื่อเปิดเครื่อง + ปุ่มหยุดฉุกเฉิน
- [ ] **A1.7 — คุมทางไกล + แจ้งเตือน** — Telegram bot (local polling): ดู/หยุด/อนุมัติ + เตือนเมื่อพลาด
- [x] **A1.8 — Logging + diagnostics** ✅ (9081827) — log เก็บ DB+จัด level/source, /api/logs + /api/diagnostics

### A2 — UI ใหม่ (แผงคุม + มอนิเตอร์) 🎨 (จุดเจ็บปวด #1)
> แดชบอร์ด = "ตั้งค่าออโต้ + ดูสถานะ" ไม่ใช่กดทีละขั้น
- [ ] Design tokens: สี / typography / spacing / radius / shadow (dark+light)
- [ ] ขยาย `components/ui/` (Button, Card, Badge, Input, Modal, Toast, Table, Tabs, Tooltip, Skeleton, EmptyState)
- [ ] Layout ใหม่: Sidebar + Topbar, responsive
- [ ] State ครบทุกหน้า: loading / empty / error
- [ ] Real-time monitor (ต่อ WebSocket) + Toast + progress
- [ ] (รายละเอียดดีไซน์อยู่หัวข้อ "แผนงาน UI" ด้านล่าง)

### A3 — สมองออโต้ 🧠
- [ ] **Rules engine no-code** ("ถ้าค่าคอม > X และเรตติ้ง > 4.5 → ทำคลิป")
- [ ] Orchestration ต่อวงจร หา→สร้าง→อนุมัติ→โพสต์→ติดตาม ให้รันเองครบ
- [ ] โหมดอนุมัติออปชัน (auto-approve / ถือไว้ให้อนุมัติ)

### A4 — ขั้นหา 🔍
- [ ] ค้นหาด้วยคีย์เวิร์ด ("รองเท้า" → ดูดเฉพาะรองเท้า) ยกจาก `scraper.js` เป็นฟีเจอร์หลัก
- [ ] ตัวกรอง: ค่าคอมขั้นต่ำ / ราคา / เรตติ้ง / จำนวน
- [ ] บันทึกคีย์เวิร์ดที่ใช้บ่อย + กันดูดสินค้าซ้ำ

### A5 — ขั้นสร้าง 🎬
- [ ] **AI ฟรี (local)** เขียน prompt/สคริปต์/แคปชัน
- [ ] ส่งเข้า **Google Flow** สร้างคลิป (เอนจินหลัก) + ประเมินต้นทุนก่อนยิง
- [ ] **Brand persona ร้าน** (น้ำเสียง/คาแรกเตอร์/โลโก้-ลายน้ำ)
- [ ] พากย์ออปชัน: local TTS (ฟรี) / D-ID

### A6 — ติดตาม + รายงาน 📊
- [ ] รายงานต้นทุน (Flow credit / Gemini quota)
- [ ] รายได้ affiliate + ROI ต่อสินค้า/คลิป
- [ ] ประวัติโพสต์ + dashboard สถิติ

### A7 — จุดขายเสริม ✨
- [ ] **แอปเรียนรู้สไตล์ผู้ใช้** (จากที่เลือก/ทิ้งคลิป)
- [ ] A/B test ในตัว
- [ ] 💵 คลังเทมเพลตพรีเมียม (add-on)
- [ ] ลง local model ลึกขึ้น (คุณภาพ/ออฟไลน์เต็มรูปแบบ)

---

## เฟสงาน — Stage B (Commercialize) 🔒 ทำหลัง A

### B1 — License + Auth + Onboarding
- [ ] License core: เซ็น/ตรวจด้วย RSA (keys/), machine binding, `type` + `expiry`
- [ ] Hybrid: online activate → cache signed token → offline grace
- [ ] Vendor tool: CLI ออก license + License Server เล็ก (revoke/track)
- [ ] Gate ใช้ไม่ได้ถ้าไม่มี license + Password ต่อลูกค้า + session
- [ ] Onboarding wizard: license → ชื่อร้าน → รหัสผ่าน → API keys → ต่อมือถือ
- [ ] Trial mode

### B2 — Packaging (Electron)
- [ ] Electron shell + bundle Python (PyInstaller) sidecar + serve Next.js build
- [ ] Auto-start backend + health check + พอร์ตอัตโนมัติ
- [ ] วิธีติดตั้ง/อัปเดต extension + Auto-update (electron-updater)
- [ ] Build .dmg/.exe + code signing

---

## แผนงาน UI (รายละเอียด — สำหรับ A2)

### ขอบเขต: ปรับ UI ทั้ง 2 ฝั่ง ให้เป็นภาษาเดียวกัน
**ฝั่ง Web (Next.js + React + Tailwind):**
- ทุกหน้าใน `web/app/(app)/` + `components/`

**ฝั่ง Extension (HTML/CSS/JS ล้วน — ใช้ React ไม่ได้):**
- `extension/sidepanel.html` + `sidepanel.js` (ศูนย์ควบคุม side panel)
- `extension/dashboard.html` + `dashboard.js` (แดชบอร์ดจอใหญ่)
- floating scraper panel (UI `#__sc_*` ใน `content/scraper.js` ที่ลอยบนหน้า Shopee)

**วิธีให้เหมือนกัน:** แชร์ **design tokens ชุดเดียว** (CSS variables: สี/ฟอนต์/spacing) ใช้ได้ทั้ง Tailwind (web) และ CSS ธรรมดา (extension) + ไอคอน lucide แบบ inline SVG (ไม่อิโมจิ) ทั้งสองฝั่ง

### หลักดีไซน์ (กฎที่ทำให้ "ไม่เหมือน AI สร้าง")
- ❌ **ห้ามใช้อิโมจิใน UI** → ใช้ไอคอนจริง (`lucide-react` ชุดเดียว, stroke/ขนาดสม่ำเสมอ)
- 📐 **8pt grid** — spacing เป็นระบบ
- 🔤 **type scale ชัด** — มีลำดับชั้น ไม่ใช่ขนาดเดียวหมด
- 🌫 **มิติ subtle** — เลเยอร์พื้นผิว, เส้นขอบ hairline, เงานุ่ม (ไม่แบน, ไม่ม่วง gradient)
- 🎯 **สีมีจุดประสงค์** — accent เดียว + สี semantic, ใช้อย่างประหยัด
- ✨ **micro-interaction** — progress วิ่ง, transition นุ่ม, มีชีวิต
- 🖥 **หน้าหลัก = ค็อกพิต** (automation-first): เห็นออโต้ทำอะไร + คุมได้ ไม่ใช่กดทีละขั้น
- มาตรฐาน polish สูง (เทียบ Linear/Raycast/Vercel)

### การตัดสินใจดีไซน์ (ล็อกแล้ว)
- [x] บุคลิกฐาน: **Linear + Raycast ผสม** (โครงคม + มีชีวิต/progress สด)
- [x] ธีม: **Dark หลัก + มี Light**
- [x] สี accent: **ส้ม Shopee**
- [x] ความหนาแน่น: **กลาง** (โปร่งพอสบายตา แต่เห็นข้อมูลครบ)

### Design Tokens (ร่างเริ่มต้น — Dark)
```
/* พื้นผิว (เลเยอร์ให้มีมิติ ไม่แบน) */
--bg:        #0E0F11   (พื้นหลังสุด)
--surface:   #17191C   (การ์ด)
--elevated:  #1E2125   (modal/popover)
--border:    rgba(255,255,255,.08)   (hairline)

/* ตัวอักษร */
--text:      #F2F3F5
--text-dim:  #9BA1A8
--text-mute: #6B7178

/* accent = ส้ม Shopee (ปรับให้พรีเมียมบน dark) */
--accent:        #FF5C2B
--accent-hover:  #FF6E42
--accent-glow:   0 0 24px rgba(255,92,43,.25)   (Raycast feel)

/* semantic */
--success: #2EBD85   --warning: #F5A623
--danger:  #F0413E   --info:    #4C8DFF
```

### ฟอนต์ (ไทย + ละติน/ตัวเลข)
- ไทย: **IBM Plex Sans Thai** หรือ **LINE Seed Sans TH** (โมเดิร์น อ่านง่าย)
- ละติน/ตัวเลข: **Inter** + ใช้ **tabular-nums** กับสถิติ/ตัวเลขเงิน
- (สรุปเลือกตัวจริงตอนเริ่ม A2)

### Information Architecture (ล็อกแล้ว — ป้ายไทยทั้งหมด)
```
ภาพรวม
  ◆ ค็อกพิต        สถานะออโต้สด + ปุ่มคุม (เริ่ม/พัก/หยุด) + ตัวเลขวันนี้
  ◆ ออโต้ไพลอต     ★ เมนูเด่น = สมองระบบ: กฎ/คีย์เวิร์ด/งบ/ตาราง
วงจรงาน
  ◆ คิวงาน         ไปป์ไลน์สด (กำลังหา/สร้าง/โพสต์) + retry
  ◆ สินค้า          ค้นหาคีย์เวิร์ด + ตัวกรอง + สินค้าที่ดูดมา
  ◆ คลิป            รีวิว/อนุมัติ/เวอร์ชัน/ค้นหา
  ◆ รายงาน          ต้นทุน (Flow/Gemini) / รายได้ / ROI
อุปกรณ์
  ◆ มือถือ          จัดการ ADB + Screen Mirror (รวมในหน้าเดียว)
ระบบ
  ◆ ตั้งค่า          API key / ชื่อร้าน / brand persona / โปรไฟล์
```
- ป้ายเมนู: **ไทยทั้งหมด** · Mirror รวมใน "มือถือ" · Auto-Pilot ยกขึ้นเด่น
- ❌ เลิกใช้ม่วง gradient เดิม (ตัวการ "ดู AI สร้าง") → ส้ม Shopee + พื้น near-black อุ่น

### ⚠️ หมายเหตุเทคนิคตอนลงมือ A2
- `web/AGENTS.md`: Next.js เวอร์ชันนี้ถูกแก้ มี breaking changes → **อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด**

### ถัดไปต้องคุย
- [ ] หน้าค็อกพิต (dashboard) แสดงอะไรบ้าง — เลย์เอาต์ละเอียด

---

## ความเสี่ยง/ข้อควรรู้
- **Python decompile ได้** → license ฝั่ง local กันได้ระดับหนึ่ง ไม่ 100% (ยกระดับความยากพอ)
- **ToS:** automate Shopee/Google Flow อาจขัดเงื่อนไขแพลตฟอร์ม — เป็นความเสี่ยงเชิงธุรกิจของผู้ขาย
- **ต้นทุน AI:** ลูกค้าใช้ API key ตัวเอง (Gemini/D-ID/Flow) → ลูกค้าจ่ายเอง (settings รองรับแล้ว) — ต้องสื่อสารให้ชัดตอนขาย
- **Vendor ต้อง host:** ถ้าเลือก hybrid ต้องมี license server เล็ก ๆ (ค่าโฮสต์ต่ำ)
