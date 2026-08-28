// เทมเพลตสูตรสร้างคลิป — เก็บทั้งชุดตัวเลือก (ตัวละคร/กลุ่มเป้าหมาย/แนวคลิป) + พรอมป์ที่เขียนเอง + รูปฉากหลัง
// เก็บใน app.db ผ่าน gen-store (ย้ายมาจาก localStorage — ดูเหตุผลใน gen-store.js)
import { loadStore, saveStore } from '@/lib/gen-store'

const NAME = 'templates'
const read = () => loadStore(NAME, [])

export const listTemplates = async () =>
  (await read()).slice().sort((a, b) => (b.at || 0) - (a.at || 0))

export const getTemplate = async id => (await read()).find(t => t.id === id) || null

// บันทึก/ทับเทมเพลตชื่อเดิม
export async function saveTemplate(name, opts) {
  const nm = String(name || '').trim()
  if (!nm) return { ok: false, error: 'ยังไม่ได้ตั้งชื่อเทมเพลต' }
  const list = await read()
  const at = Date.now()
  const found = list.find(t => t.name === nm)
  const entry = { id: found ? found.id : `tpl_${at}_${Math.random().toString(36).slice(2, 7)}`, name: nm, at, opts }
  const next = found ? list.map(t => (t.id === entry.id ? entry : t)) : [entry, ...list]
  const r = await saveStore(NAME, next)
  if (!r.ok) return r
  return { ok: true, id: entry.id, replaced: !!found }
}

export async function deleteTemplate(id) {
  return saveStore(NAME, (await read()).filter(t => t.id !== id))
}
