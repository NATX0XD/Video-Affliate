# Shopee VDO Gen Auto Pilot — Product Checklist

เป้าหมาย: ทำให้ครบทุกข้อ เพื่อยกระดับเป็นโปรดักต์ระดับมืออาชีพพร้อมขาย
กฎเหล็ก: Local-first · Automation-first (near-zero-touch) · ยืดหยุ่น
ขอบเขต desktop: **ลงคลิป + จัดการแพลตฟอร์ม + จัดการมือถือ** (ไม่สร้างคลิป — extension สร้าง)

สถานะ: `[x]` เสร็จ · `[~]` มีบางส่วน · `[ ]` ยังไม่ทำ

---

## A. Dashboard / ภาพรวม (ค็อกพิต)
- [~] สถานะระบบสด: autopilot on/off, มือถือออนไลน์กี่เครื่อง, กำลังโพสต์อะไร
- [~] ไปป์ไลน์คลิป: queued → generated → posting → posted
- [ ] รายได้รวมวันนี้/เดือนนี้ + เทียบช่วงก่อน
- [ ] การ์ดเตือนด่วน (เครื่องร้อน/แบตต่ำ/โพสต์ล้ม/credit ใกล้หมด)
- [ ] **สรุปงบ AI: ใช้เครดิตไปเท่าไรแล้ว (วันนี้/เดือนนี้) เห็นเด่นบนค็อกพิต**

## B. รายได้ & วิเคราะห์  ← ของใหม่ที่ต้องทำ
- [ ] ตกลงแหล่งข้อมูลรายได้ก่อน (Shopee Affiliate dashboard → extension ดูดมาให้?)
- [ ] รายได้รวม + แยกตามแพลตฟอร์ม (Shopee/TikTok/Reels/IG/YT)
- [ ] รายได้แยกตามเครื่อง/บัญชี และตามสินค้า (คลิปไหนทำเงินดีสุด — top performers)
- [ ] funnel: โพสต์ → วิว → คลิก → ขาย → คอมมิชชั่น
- [ ] ROI: ต้นทุน AI (Flow/Gemini) เทียบรายได้

## C. คิวงาน / ความคืบหน้าคลิป
- [x] คลิปอยู่สเตจไหน (สถานะ + หลอด %)
- [~] โพสต์ไปแพลตฟอร์มไหนแล้ว/ค้างไหน (ต่อคลิป × ต่อแพลตฟอร์ม)
- [x] preview คลิป + ตะกร้า/ลิงก์ + ปุ่มลองใหม่/ทิ้ง

## D. คลังคลิป
- [~] คลิปทั้งหมด + metadata
- [ ] กรอง: ยังไม่ลง / ลงแล้ว / reuse
- [ ] โพสต์ซ้ำข้ามแพลตฟอร์มจากคลังได้

## E. ฟาร์มมือถือ / ดูแลอุปกรณ์  ← เน้น
- [~] กริด mirror หลายจอ + คุมเครื่องระยะไกล (tap/swipe/nav)
- [x] แบต % ต่อเครื่อง (+ สถานะชาร์จ)
- [x] **อุณหภูมิ/ความร้อนต่อเครื่อง** (dumpsys battery → °C, สีเตือนบนการ์ด)
- [x] สถานะชาร์จ · RAM / storage(/data) / เน็ต (wifi/mobile/offline) — อ่าน 1 call throttle 20 วิ
- [x] **ดูแลอัตโนมัติ: ร้อนเกิน≥45°C/แบตต่ำ≤20% → พักเครื่อง (cooldown) กันเครื่องพัง** (hysteresis: ฟื้นเมื่อเย็น<41°C / ชาร์จถึง 50%)
- [x] เครื่องไหนกำลังทำอะไร (ว่าง/โพสต์/พัก) — ป้าย activity บนการ์ดเครื่อง
- [x] ตั้งชื่อบัญชี + เลือกแพลตฟอร์มต่อเครื่อง
- [~] WiFi ADB / USB

> E คืบ — ตั้งเกณฑ์ cooldown ได้ใน Settings; แบตต่ำพักจนชาร์จถึงเกณฑ์, ร้อนพักขั้นต่ำ N นาที

## F. แพลตฟอร์ม  ← เน้น "platform ไหนกำลังทำอะไร"
- [x] registry แพลตฟอร์ม plugin (BasePoster) — ทุกตัวเลือกได้, route ไป poster เฉพาะ
- [ ] หน้าสถานะแพลตฟอร์ม: active/ว่าง/โพสต์อยู่/ล็อกอินหลุด
- [ ] กฎต่อแพลตฟอร์ม (caption/hashtag/โควต้า/เวลา แยกราย platform)
- [ ] อัตราสำเร็จ-ล้มเหลวต่อแพลตฟอร์ม
- [~] flow โพสต์จริง TikTok/Reels/IG/YouTube — flow ตั้งต้น text-based (UIAutomator) ครบทุกตัว, รอจูนกับเครื่องจริง (Shopee จูนแล้ว)
- [x] โพสต์คลิปเดียว → ทุกแพลตฟอร์มพร้อมกัน + ทดสอบทุกแพลตฟอร์มทีเดียว (/api/test/post)
- [ ] account rotation กันแบน

> F คืบ — Shopee เป็น 1 แพลตฟอร์ม (ไม่ใช่แกน); BasePoster + posters TikTok/Reels/IG/YT;
> ทุกแพลตฟอร์ม ready=True (tuned=False ยกเว้น Shopee) → เลือก/ทดสอบรวมได้; แหล่งสินค้า/affiliate ยังเป็น Shopee

## G. ตารางเวลา & กฎอัตโนมัติ
- [x] ช่วงเวลาโพสต์ + โควต้า/วัน + โหมดอนุมัติ + delay สุ่ม
- [ ] โควต้าแยกต่อแพลตฟอร์ม/ต่อเครื่อง
- [x] กฎ cooldown เครื่อง (ผูกกับ E) — เกณฑ์ร้อน/แบต ตั้งได้ใน Settings

## H. รีวิว/อนุมัติก่อนโพสต์
- [~] โหมด hold/auto
- [ ] หน้ารีวิว: ดูคลิป+caption ก่อนปล่อย → อนุมัติ/แก้/ทิ้ง

## I. แจ้งเตือน
- [ ] ในแอป: เครื่องหลุด/ร้อน/โพสต์ล้ม/credit หมด
- [ ] ช่องทางนอก: LINE / Telegram (ออปชั่น)

## J. งบ & ต้นทุน AI  ← เน้นหนัก (ดูใช้เครดิตไปเท่าไรแล้ว)
- [x] เพดานงบรายเดือน + spend เดือนนี้ (อ่านจาก usage ledger)
- [x] หยุดเมื่อถึงเพดาน (BudgetGuard + extension เช็ก budget ก่อนสร้าง)
- [x] แยกการใช้ตามบริการ: Flow (clip) / Gemini (prompt+verify) — ตาราง usage
- [x] ตัวนับการใช้จริง: จำนวนคลิป Flow, จำนวน call + token Gemini
- [x] สรุป "วันนี้ / เดือนนี้ / คงเหลือ" — การ์ด "งบ AI" บน Dashboard + กราฟ stacked 14 วันในรายงาน
- [x] เตือน 80% (ใกล้เต็ม) / 100% (เกินงบ) — badge บนการ์ด + สีหลอด
- [x] ราคาต่อหน่วยตั้งได้ใน Settings (฿/คลิป Flow, ฿/1k token Gemini)

> J เสร็จ — extension รายงาน token Gemini กลับ /api/flow/usage; verify token เข้า ledger

## K. รายงาน export
- [~] สรุป 14 วัน + error list
- [ ] สรุปวัน/สัปดาห์/เดือน + export CSV

## L. ตั้งค่า
- [x] ร้าน / API key / caption / แพลตฟอร์ม / งบ / ตาราง (post-only)

## M. Logs / Diagnostics
- [x] log สด + ระดับ + ล้าง
- [x] diagnostics (ADB/เครื่องมือพร้อมใช้)
- [ ] log แยกต่อเครื่อง

## N. Onboarding
- [x] ตั้งค่าครั้งแรก (ร้าน + AI key)
- [ ] ตรวจ ADB/scrcpy/ffmpeg/ADBKeyboard พร้อมใช้ ตอนเริ่ม

## O. License / ระบบขาย  ← เพราะจะขาย
- [ ] ล็อกรหัส/license — ไม่มี key ใช้ไม่ได้
- [ ] จำกัดจำนวนเครื่อง/ฟีเจอร์ตาม tier
- [ ] activation + ตรวจสอบ + อัปเดต

## P. ความสะอาดของโค้ด (พื้นฐานก่อนต่อยอด)
- [x] ผ่าซากโค้ดสร้างคลิปออกจาก desktop (ลบ 7 ไฟล์: video/template/avatar_generator, gen_worker, worker, post_worker, api_server)
- [x] ตัด endpoint generation (/api/generate, /api/gen/*, /api/post/*, /api/video/*) + เลิก wire ใน main.py
- [x] ย้ายการเขียน prompt + คิวสินค้า ไปฝั่ง extension (เพิ่ม /api/flow/config; ลบ flow/next, flow/enqueue, flow/prompt, prompt_builder.py)
- [x] extension: คิวอยู่ใน chrome.storage.local.flow_jobs; background เขียน prompt เอง (template JS / AI เรียก Gemini ตรง); manifest +generativelanguage host

> P เสร็จสมบูรณ์ — desktop = post-only ล้วน, extension = สร้างคลิป+เขียน prompt เอง

---

### หมายเหตุที่ต้องตกลงก่อนเริ่มบางหมวด
1. **B + J:** รายได้และ "เครดิต Flow" ดึงจากไหน — extension ต้องเป็นคนดูดจาก Shopee Affiliate / Google Flow มาส่งให้ desktop หรือไม่
2. **F:** จะลุยแพลตฟอร์มใหม่เลย หรือทำ Shopee ให้นิ่งก่อน
3. **P:** เคลียร์ซากเก่าก่อนเริ่มสร้างของใหม่ (กันมั่ว) — รออนุมัติ
