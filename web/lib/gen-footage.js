// "footage ของฉัน" — คลิป/รูปสินค้าที่ผู้ใช้ถ่ายเอง ไว้ตัดสลับกับคนพูดในคลิป
// เก็บใน app.db ผ่าน gen-store (ดูเหตุผลใน gen-store.js) — โปรแกรมหลักอ่านตรงจาก DB
// ตอนตัดต่อ ไม่ต้องส่งไบต์วิดีโอผ่านคิวงาน (ก้อนใหญ่มาก)
import { loadStore, saveStore } from '@/lib/gen-store'

const NAME = 'footage'
const MAX = 4                  // เกินนี้ก็ตัดไม่หมดในคลิป 10 วิ (ดู plan_cuts ฝั่งโปรแกรมหลัก)
export const MAX_BYTES = 6 * 1024 * 1024   // ต่อไฟล์ — DB เก็บเป็น dataURL โตขึ้นอีก ~33%

const read = () => loadStore(NAME, [])

export const listFootage = async () =>
  (await read()).slice().sort((a, b) => (b.at || 0) - (a.at || 0))

export async function addFootage(file) {
  if (!file) return { ok: false, error: 'ไม่มีไฟล์' }
  const isVideo = (file.type || '').startsWith('video/')
  const isImage = (file.type || '').startsWith('image/')
  if (!isVideo && !isImage) return { ok: false, error: 'รับเฉพาะไฟล์วิดีโอหรือรูปภาพ' }
  if (file.size > MAX_BYTES)
    return { ok: false, error: `ไฟล์ใหญ่เกิน ${Math.round(MAX_BYTES / 1024 / 1024)}MB — ตัดให้สั้นลงก่อน (ใช้แค่ ~2 วิต่อช่วง)` }

  const list = await read()
  if (list.length >= MAX) return { ok: false, error: `เก็บได้สูงสุด ${MAX} ไฟล์ — ลบของเก่าออกก่อน` }

  const data = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result))
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  const at = Date.now()
  const entry = { id: `ftg_${at}_${Math.random().toString(36).slice(2, 7)}`,
                  name: file.name || 'footage', kind: isVideo ? 'video' : 'image', data, at }
  const r = await saveStore(NAME, [entry, ...list].slice(0, MAX))
  if (!r.ok) return r
  return { ok: true, id: entry.id }
}

export async function deleteFootage(id) {
  return saveStore(NAME, (await read()).filter(f => f.id !== id))
}
