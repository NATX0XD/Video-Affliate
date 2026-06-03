# _legacy — โค้ดเก่าที่เลิกใช้แล้ว (เก็บไว้อ้างอิง)

ไฟล์ในนี้ **ไม่ได้อยู่ใน `manifest.json`** จึงไม่เคยถูกโหลดตอนรันจริง
ย้ายมาเก็บไว้เผื่ออ้างอิง logic เดิม — ลบทิ้งได้ถ้าไม่ต้องการแล้ว

| ไฟล์ | เคยเป็นอะไร | ถูกแทนด้วย |
|---|---|---|
| `popup.html` / `popup.js` | UI ป๊อปอัปบน toolbar (รุ่นแรก) | Side Panel (`sidepanel.*`) |
| `dashboard.html` / `dashboard.js` | หน้า dashboard เต็มจอ เปิดจากปุ่มใน popup | Side Panel + web UI (`web/`) |
| `interceptor.js` | ดัก fetch/XHR ใน page world เพื่อแย่ง product data | scraper.js ดึงจาก DOM + Shopee API ตรงๆ แทน |

> ตอนย้าย (2026-06-01): manifest ใช้ `side_panel` + content scripts `scraper.js`/`flow.js` เท่านั้น
> `interceptor.js` ไม่มีจุดไหน inject เลย (ไม่อยู่ใน manifest, ไม่มี `executeScript`)
