/**
 * เช็คความพร้อมของเครื่องสำหรับ setup ฟาร์ม (F/E).
 * ok: true=ผ่าน, false=ไม่ผ่าน, null=ยังตรวจไม่ได้ (รอ backend)
 * fixable: เตรียมอัตโนมัติได้ด้วยปุ่มเดียว · calib: ต้องเข้า wizard จูนพิกัด
 *
 * NOTE: ตอนนี้ ADBKeyboard/จอ/จูนพิกัด ยังเป็น null (mock) — จะต่อ backend เฟสถัดไป
 */
export function deviceReadiness(d = {}) {
  const items = [
    { key: 'adb',   label: 'เชื่อมต่อ ADB',           ok: d.status === 'device',          fixable: false },
    { key: 'label', label: 'ตั้งชื่อบัญชี',            ok: !!d.label,                       fixable: false },
    { key: 'plat',  label: 'เลือกแพลตฟอร์ม',          ok: (d.platforms?.length || 0) > 0,  fixable: false },
    { key: 'kbd',   label: 'ADBKeyboard (พิมพ์ไทย)',  ok: d.ready_kbd ?? null,             fixable: true  },
    { key: 'awake', label: 'จอไม่ดับ / ปลดล็อก',      ok: d.ready_awake ?? null,           fixable: true  },
    { key: 'calib', label: `จูนพิกัดรุ่น ${d.model || ''}`.trim(), ok: d.ready_calib ?? null, fixable: true, calib: true },
  ]
  const done    = items.filter(i => i.ok === true).length
  const pending = items.filter(i => i.ok !== true)
  return { items, done, total: items.length, ready: done === items.length, pending }
}
