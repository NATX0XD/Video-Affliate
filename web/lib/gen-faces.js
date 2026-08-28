// "หน้าของฉัน" — รูปหน้าที่ผู้ใช้เคยอัป เก็บไว้เลือกซ้ำ ไม่ต้องอัปใหม่ทุกครั้ง
// รูปถูกย่อ 512px มาแล้วจาก downscale() ก่อนเข้าที่นี่
const KEY = 'gen_faces_v1'
const MAX = 12   // เก็บล่าสุด 12 รูปพอ — กัน localStorage เต็ม (รูปละ ~40KB)

const read = () => {
  if (typeof window === 'undefined') return []
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : [] }
  catch { return [] }
}
const write = list => { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) }

export const listFaces = () => read().sort((a, b) => (b.at || 0) - (a.at || 0))

// เพิ่มรูปหน้า — รูปเดิม (dataURL ตรงกัน) ไม่เก็บซ้ำ คืน id ของตัวที่มีอยู่แทน
export function addFace(image, name = '') {
  if (!image) return { ok: false, error: 'ไม่มีรูป' }
  const list = read()
  const dup = list.find(f => f.image === image)
  if (dup) return { ok: true, id: dup.id, dup: true }
  const at = Date.now()
  const entry = { id: `face_${at}_${Math.random().toString(36).slice(2, 7)}`, image, name: name || `รูปที่ ${list.length + 1}`, at }
  try { write([entry, ...list]) } catch { return { ok: false, error: 'พื้นที่เก็บเต็ม — ลบรูปเก่าก่อน' } }
  return { ok: true, id: entry.id }
}

export function deleteFace(id) {
  write(read().filter(f => f.id !== id))
}
