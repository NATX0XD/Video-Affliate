// "ฉากของฉัน" — ฉากที่ผู้ใช้เขียน/อัปรูปเอง บันทึกไว้เรียกใช้ซ้ำได้ (โผล่เป็นการ์ดในแถวฉากหลัง)
// ต่างจาก gen-templates: อันนั้นเก็บ "ทั้งชุด" อันนี้เก็บเฉพาะฉาก (ข้อความ + รูปอ้างอิง)
// เก็บใน app.db ผ่าน gen-store (ย้ายมาจาก localStorage — ดูเหตุผลใน gen-store.js)
import { loadStore, saveStore } from '@/lib/gen-store'

const NAME = 'scenes'
const read = () => loadStore(NAME, [])

export const listScenes = async () =>
  (await read()).slice().sort((a, b) => (b.at || 0) - (a.at || 0))

// บันทึก/ทับฉากชื่อเดิม
export async function saveScene({ name, prompt, image, imageName }) {
  const nm = String(name || '').trim()
  if (!nm) return { ok: false, error: 'ยังไม่ได้ตั้งชื่อฉาก' }
  if (!String(prompt || '').trim() && !image) return { ok: false, error: 'ต้องมีคำอธิบายฉากหรือรูปฉากอย่างน้อยอย่างหนึ่ง' }
  const list = await read()
  const at = Date.now()
  const found = list.find(s => s.name === nm)
  const entry = {
    id: found ? found.id : `scn_${at}_${Math.random().toString(36).slice(2, 7)}`,
    name: nm, prompt: String(prompt || '').trim(), image: image || null, imageName: imageName || '', at,
  }
  const next = found ? list.map(s => (s.id === entry.id ? entry : s)) : [entry, ...list]
  const r = await saveStore(NAME, next)
  if (!r.ok) return r
  return { ok: true, id: entry.id, replaced: !!found }
}

export async function deleteScene(id) {
  return saveStore(NAME, (await read()).filter(s => s.id !== id))
}
