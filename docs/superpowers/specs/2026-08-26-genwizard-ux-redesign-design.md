# ออกแบบใหม่: หน้าสร้างคลิป + ธีมขาว

วันที่: 2026-08-26 · ขอบเขต: หน้าสร้างคลิป (wizard) ทั้งหน้า + ระบบธีมขาวทั้งแอป

## ปัญหาที่แก้

1. ขั้น "รายละเอียด" ยาวเกินหนึ่งจอมาก — ฉาก/อารมณ์/เสียง/ภาษา/เพลง/พรอมป์ 6 ช่อง อัดอยู่ในขั้นเดียว
2. เทมเพลตเป็น dropdown เล็กมุมบน มองไม่เห็นว่ามีอะไรอยู่ในสูตร
3. ฉากและอารมณ์แสดงเป็นแถบไล่สี ผู้ใช้เดาไม่ออกว่าคลิปจะออกมาหน้าตาแบบไหน
4. มีแต่ธีมมืด (`layout.js` ฮาร์ดโค้ด `data-theme="dark"`) ทั้งที่ token ธีมขาวเขียนไว้แล้วใน `globals.css`
5. หัวข้อภาษาไทยถูกสั่ง `uppercase tracking-widest` ที่ 10px — ไทยไม่มีตัวพิมพ์ใหญ่ และการยืดตัวทำให้สระ/วรรณยุกต์ลอย อ่านยาก

## สิ่งที่ไม่เปลี่ยน

- โมเดลข้อมูล `genOpt` และ payload ที่ส่งเข้าคิว (`buildGen`) เหมือนเดิมทุก field
- `web/lib/gen-options.js` (เพิ่มเฉพาะ field `img`), `gen-templates.js`, `gen-scenes.js`, `downscale.js`
- ฝั่ง extension ทั้งหมด (`background.js`, `content/flow.js`)
- เทมเพลตและ "ฉากของฉัน" ที่ผู้ใช้บันทึกไว้แล้ว — key `gen_templates_v1` / `gen_scenes_v1` ใช้ต่อได้ ไม่ต้องย้ายข้อมูล

## 1. Design tokens

แก้ที่ `web/app/globals.css` — token ธีมขาวมีอยู่แล้ว ปรับค่าให้สะอาดขึ้นและเพิ่มเงาสำหรับพื้นสว่าง

| token | ค่าใหม่ (ธีมขาว) | ใช้กับ |
|---|---|---|
| `--c-base` | `#f5f5f8` | พื้นหน้า |
| `--c-surface` | `#ffffff` | การ์ด |
| `--c-elevated` | `#f1f1f5` | chip / hover |
| `--c-line` | `#e4e4ec` | เส้นขอบ |
| `--c-ink` | `#17171f` | ตัวหนังสือหลัก |
| `--c-ink-dim` | `#5a5a6b` | ตัวหนังสือรอง |
| `--c-ink-mute` | `#8e8e9e` | ตัวหนังสือจาง |

accent คงม่วง `#a855f7` สำหรับพื้นปุ่ม เพิ่ม `--color-accent-ink: #7c3aed` สำหรับตัวหนังสือม่วงบนพื้นขาว (คอนทราสต์ผ่าน WCAG AA)

เงาชุดใหม่ (ธีมขาว): `--shadow-card: 0 1px 2px rgba(16,16,32,.06), 0 8px 24px -12px rgba(16,16,32,.12)` · ธีมมืดคงชุดเดิม

## 2. ระบบธีม

- `web/components/ThemeToggle.js` — client component อ่าน/เขียน `localStorage.theme`, เซ็ต `document.documentElement.dataset.theme`
- ค่าเริ่มต้น = `light` (ผู้ใช้ที่เคยเลือกไว้ ใช้ค่าที่จำ)
- `layout.js` ถอด `data-theme="dark"` ออก ใส่ inline script อ่าน localStorage ก่อน paint กันจอกระพริบ
- ปุ่มสลับอยู่ท้าย sidebar ข้าง "สถานะระบบ"
- ต้องไล่แก้สีที่ฮาร์ดโค้ดไว้ให้ใช้ token: `bg-black/70` (ฉากหลัง modal), `#0d0d12` (พื้นพรีวิว 3D ใน `ModelPreview`), `text-white` บน chip ที่ active

## 3. ตัวอักษร

คงฟอนต์เดิม (Inter + IBM Plex Sans Thai) เปลี่ยนกฎการใช้

| ระดับ | ขนาด/น้ำหนัก | หมายเหตุ |
|---|---|---|
| หัวข้อหน้า | 20px / 600 | line-height 1.35 |
| หัวข้อกลุ่ม | 15px / 600 | เดิม 10px uppercase |
| เนื้อหา | 14px / 400 | line-height 1.55 |
| กำกับ | 13px / 400 | สี `ink-dim` |
| ป้ายเล็ก (badge) | 12px / 600 | ต่ำสุดที่อนุญาต |

ห้ามใช้ `uppercase` และ `tracking-widest` กับข้อความไทยทุกที่ในแอป

## 4. Flow ใหม่ — 6 ขั้น

ย้ายจาก modal ไปหน้าเต็ม `/products/create?ids=3,4`

| ขั้น | ชื่อ | เนื้อหา | หัวข้อที่ "เขียนเอง" ได้ |
|---|---|---|---|
| 1 | สูตร | การ์ดเทมเพลตรูปใหญ่ (thumbnail = รูปฉากของสูตรนั้น ถ้าไม่มีใช้ไล่สี) + การ์ด "เริ่มใหม่" + ลบเทมเพลต · เลือกสูตรแล้วมีปุ่ม "ใช้สูตรนี้เลย" กระโดดไปขั้น 6 | — |
| 2 | ผู้รีวิว | ตัวละคร (พรีวิว 3D) หรืออัปรูปตัวเอง + กลุ่มเป้าหมาย | ตัวละคร (`char`) |
| 3 | สไตล์ | แนวคลิป · ความยาว · เอนจิน | ท่าทาง (`action`) |
| 4 | ลุคภาพ | ฉาก (รูปถ่ายจริง) + ฉากของฉัน + อัปรูปฉาก · อารมณ์ (รูปถ่ายจริง) | ฉาก (`scene`) · แสง (`light`) · กล้อง (`camera`) |
| 5 | เสียง & บท | เสียงพูด · น้ำเสียง · ภาษา · เพลง | น้ำเสียง (`voice`) · เพลง (`music`) · บทพูด (`script`) |
| 6 | สรุป | สรุปทุกค่า + สถานะส่วนขยาย + ปุ่มทดสอบ/สร้างจริง + "บันทึกเป็นสูตร" | ข้อห้าม (`avoid`) |

หลักที่ยึด:

- หนึ่งขั้น = หนึ่งคำถาม เนื้อหาพอดีหนึ่งจอ ไม่ต้องเลื่อนยาว
- ปุ่ม "เขียนเอง" อยู่กับหัวข้อของมันเอง ไม่มีบล็อกพรอมป์รวมท้ายหน้าอีก
- กดหัวข้อในแถบขั้นเพื่อย้อนกลับได้ ขั้นที่ยังไม่ถึงกดไม่ได้
- ร่างเก็บอัตโนมัติ ปิดหน้าแล้วกลับมาทำต่อได้

## 5. รูปตัวอย่างจริง

- 11 รูป: ฉาก 6 (`scene-studio`, `scene-living`, `scene-kitchen`, `scene-outdoor`, `scene-neon`, `scene-minimal`) + อารมณ์ 5 (`mood-warm`, `mood-premium`, `mood-fun`, `mood-minimal`, `mood-dramatic`)
- ต้นทาง Pexels/Unsplash (ใช้เชิงพาณิชย์ได้ ไม่ต้องให้เครดิต แต่เก็บเครดิตไว้)
- ย่อ 800px กว้าง แปลงเป็น webp คุณภาพ 80 เก็บที่ `web/public/previews/`
- `web/scripts/fetch-previews.mjs` — URL ปักหมุดไว้ในสคริปต์ ดึงซ้ำได้ พร้อมเขียน `web/public/previews/CREDITS.md`
- `gen-options.js` เพิ่ม field `img` ให้ `GEN_BGS` และ `GEN_MOODS` คู่กับ `thumb` เดิม · ถ้าไฟล์รูปหาย การ์ดตกกลับไปใช้ไล่สี

## 6. โครงโค้ด

ไฟล์ใหม่:

```
web/app/(app)/products/create/page.js   เชลล์: อ่าน ?ids= · โหลดสินค้า · คุมขั้น · แถบล่าง
web/components/gen/useGenDraft.js       สเตต genOpt + เซฟร่างอัตโนมัติ
web/components/gen/StepRail.js          แถบ 6 ขั้น
web/components/gen/PickCard.js          การ์ดเลือก (รูป/ข้อความ/ไอคอน)
web/components/gen/CustomField.js       ปุ่ม "เขียนเอง" + textarea
web/components/gen/steps/StepTemplate.js
web/components/gen/steps/StepReviewer.js
web/components/gen/steps/StepStyle.js
web/components/gen/steps/StepLook.js
web/components/gen/steps/StepAudio.js
web/components/gen/steps/StepReview.js
web/components/ThemeToggle.js
web/scripts/fetch-previews.mjs
```

ลบ: `web/components/products/GenWizard.js`, `web/components/products/GenPromptStudio.js`

หน้าที่ของแต่ละชิ้น:

- `useGenDraft` — ถือ `o` (genOpt) ก้อนเดียว, `set(patch)`, `step`, และเซฟ `gen_draft_v1 = {o, step, ids, at}` ลง localStorage ทุกครั้งที่เปลี่ยน · ถ้า `ids` ในร่างไม่ตรงกับ `?ids=` ที่เปิดมา ให้เริ่มใหม่ · ล้างร่างเมื่อส่งคิวสำเร็จ
- `PickCard` — รับ `{title, sub, img, thumb, active, onClick, onDelete}` การ์ดเลือกแบบเดียวใช้ทุกขั้น
- `CustomField` — รับ `{fieldKey, prompts, onPrompts}` จัดการปุ่มสลับ + textarea + ล้างค่าเมื่อปิดโหมด
- `steps/*` — แต่ละไฟล์รับ `{o, set}` เท่านั้น ไม่รู้จักขั้นอื่น ไม่ยุ่งกับการส่งคิว
- `create/page.js` — ที่เดียวที่เรียก `buildGen` + `api.queuePush`

จุดเชื่อม: `/products` ปุ่ม "สร้างคลิปจากที่เลือก" เปลี่ยนจากเปิด modal เป็น `router.push('/products/create?ids=...')`

## 7. ความเสี่ยง

- static export + `useSearchParams` ต้องครอบ `<Suspense>` ไม่งั้น `next build` ล้ม
- สีดำฮาร์ดโค้ดกระจายหลายจุด ต้องไล่เก็บตอนทำธีมขาว (ดูข้อ 2)
- ปิด modal ทิ้งแล้ว ถ้ามีที่อื่นเรียก `GenWizard` ต้องแก้ตาม (ตรวจแล้ว: มีที่เดียวคือ `products/page.js`)

## 8. การทดสอบ

1. `npx next build` ผ่าน
2. Playwright เดินครบ 6 ขั้นบนแอปจริง (`localhost:3001`) ทั้งธีมขาวและธีมมืด
3. ส่งคิวแบบทดสอบแล้วอ่าน payload จาก SQLite เทียบกับของเดิม — ต้องมี `bgPrompt`, `promptLines`, `motionLines`, `bgImage` เท่าเดิม
4. `grep` ยืนยันว่าไม่เหลือ `uppercase` / `tracking-widest` บนข้อความไทย
5. รูป 11 ไฟล์ใน `web/public/previews/` โหลดได้ครบ (ไม่มี 404)
6. ปิด/เปิดหน้าใหม่กลางทาง แล้วร่างยังอยู่
