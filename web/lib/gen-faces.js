// "หน้าของฉัน" — รูปหน้าที่ผู้ใช้เคยอัป เก็บไว้เลือกซ้ำ ไม่ต้องอัปใหม่ทุกครั้ง
// รูปถูกย่อ 512px มาแล้วจาก downscale() ก่อนเข้าที่นี่
// เก็บใน app.db ผ่าน gen-store (ย้ายมาจาก localStorage — ดูเหตุผลใน gen-store.js)
import { loadStore, saveStore } from '@/lib/gen-store'

const NAME = 'faces'
const MAX = 12   // เก็บล่าสุด 12 รูปพอ (รูปละ ~40KB) — ไม่ต้องให้ DB บวมโดยไม่จำเป็น
const read = () => loadStore(NAME, [])

export const getFace = async id => (await read()).find(f => f.id === id) || null

export const listFaces = async () =>
  (await read()).slice().sort((a, b) => (b.at || 0) - (a.at || 0))

// เพิ่มรูปหน้า — รูปเดิม (dataURL ตรงกัน) ไม่เก็บซ้ำ คืน id ของตัวที่มีอยู่แทน
export async function addFace(image, name = '') {
  if (!image) return { ok: false, error: 'ไม่มีรูป' }
  const list = await read()
  const dup = list.find(f => f.image === image)
  if (dup) return { ok: true, id: dup.id, dup: true }
  const at = Date.now()
  const entry = { id: `face_${at}_${Math.random().toString(36).slice(2, 7)}`, image, name: name || `รูปที่ ${list.length + 1}`, at }
  const r = await saveStore(NAME, [entry, ...list].slice(0, MAX))
  if (!r.ok) return r
  return { ok: true, id: entry.id }
}

export async function deleteFace(id) {
  return saveStore(NAME, (await read()).filter(f => f.id !== id))
}
