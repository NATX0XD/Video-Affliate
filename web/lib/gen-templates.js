// เทมเพลตสูตรสร้างคลิป — เก็บทั้งชุดตัวเลือก (ตัวละคร/กลุ่มเป้าหมาย/แนวคลิป) + พรอมป์ที่เขียนเอง + รูปฉากหลัง
// เก็บใน localStorage ของเครื่อง (โปรแกรมรันโลคัล ผู้ใช้เครื่องเดียว) — ไม่ต้องพึ่ง backend
const KEY = 'gen_templates_v1'

const read = () => {
  if (typeof window === 'undefined') return []
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : [] }
  catch { return [] }
}
const write = list => { localStorage.setItem(KEY, JSON.stringify(list)) }

export const listTemplates = () => read().sort((a, b) => (b.at || 0) - (a.at || 0))

export const getTemplate = id => read().find(t => t.id === id) || null

// บันทึก/ทับเทมเพลตชื่อเดิม — คืน {ok} หรือ {ok:false,error} เมื่อพื้นที่เต็ม (รูปฉากหลังกินที่)
export function saveTemplate(name, opts) {
  const nm = String(name || '').trim()
  if (!nm) return { ok: false, error: 'ยังไม่ได้ตั้งชื่อเทมเพลต' }
  const list = read()
  const at = Date.now()
  const found = list.find(t => t.name === nm)
  const entry = { id: found ? found.id : `tpl_${at}_${Math.random().toString(36).slice(2, 7)}`, name: nm, at, opts }
  const next = found ? list.map(t => (t.id === entry.id ? entry : t)) : [entry, ...list]
  try { write(next) } catch { return { ok: false, error: 'พื้นที่เก็บเต็ม — ลบเทมเพลตเก่าหรือเอารูปฉากหลังออกก่อน' } }
  return { ok: true, id: entry.id, replaced: !!found }
}

export function deleteTemplate(id) {
  write(read().filter(t => t.id !== id))
}
