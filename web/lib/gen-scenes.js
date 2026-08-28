// "ฉากของฉัน" — ฉากที่ผู้ใช้เขียน/อัปรูปเอง บันทึกไว้เรียกใช้ซ้ำได้ (โผล่เป็นการ์ดในแถวฉากหลัง)
// ต่างจาก gen-templates: อันนั้นเก็บ "ทั้งชุด" อันนี้เก็บเฉพาะฉาก (ข้อความ + รูปอ้างอิง)
const KEY = 'gen_scenes_v1'

const read = () => {
  if (typeof window === 'undefined') return []
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : [] }
  catch { return [] }
}
const write = list => { localStorage.setItem(KEY, JSON.stringify(list)) }

export const listScenes = () => read().sort((a, b) => (b.at || 0) - (a.at || 0))

// บันทึก/ทับฉากชื่อเดิม — {ok} หรือ {ok:false,error} เมื่อพื้นที่เต็ม (รูปฉากกินที่)
export function saveScene({ name, prompt, image, imageName }) {
  const nm = String(name || '').trim()
  if (!nm) return { ok: false, error: 'ยังไม่ได้ตั้งชื่อฉาก' }
  if (!String(prompt || '').trim() && !image) return { ok: false, error: 'ต้องมีคำอธิบายฉากหรือรูปฉากอย่างน้อยอย่างหนึ่ง' }
  const list = read()
  const at = Date.now()
  const found = list.find(s => s.name === nm)
  const entry = {
    id: found ? found.id : `scn_${at}_${Math.random().toString(36).slice(2, 7)}`,
    name: nm, prompt: String(prompt || '').trim(), image: image || null, imageName: imageName || '', at,
  }
  const next = found ? list.map(s => (s.id === entry.id ? entry : s)) : [entry, ...list]
  try { write(next) } catch { return { ok: false, error: 'พื้นที่เก็บเต็ม — ลบฉากเก่าก่อน' } }
  return { ok: true, id: entry.id, replaced: !!found }
}

export function deleteScene(id) {
  write(read().filter(s => s.id !== id))
}
