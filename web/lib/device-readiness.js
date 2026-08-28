/**
 * เช็คความพร้อมของเครื่องสำหรับโพสต์ — แสดงเฉพาะข้อที่ "ตรวจได้จริง" เท่านั้น
 * ok: true=ผ่าน · false=ยังไม่ผ่าน
 *
 * ของเดิมมี ADBKeyboard / จอไม่ดับ / จูนพิกัดรุ่น เป็น mock (backend ไม่เคยส่งค่ามา
 * เลยค้างเป็นวงกลมว่างตลอด) — ถอดออกแล้ว จะใส่กลับเมื่อมีการตรวจจริง
 * ส่วนพิกัดโพสต์ย้ายไปโชว์ในหัวข้อ "พิกัดโพสต์" ซึ่งอ่านค่าจริงจาก API
 */
export function deviceReadiness(d = {}) {
  const items = [
    { key: 'adb',   label: 'เชื่อมต่อ ADB',    ok: d.status === 'device' },
    { key: 'label', label: 'ตั้งชื่อบัญชี',     ok: !!d.label },
    { key: 'plat',  label: 'เลือกแพลตฟอร์ม',   ok: (d.platforms?.length || 0) > 0 },
  ]
  const done    = items.filter(i => i.ok === true).length
  const pending = items.filter(i => i.ok !== true)
  return { items, done, total: items.length, ready: done === items.length, pending }
}
