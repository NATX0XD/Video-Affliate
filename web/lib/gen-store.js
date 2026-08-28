// ที่เก็บกลางของหน้าสร้างคลิป — เก็บใน app.db ผ่าน API ไม่ใช่ localStorage
//
// ทำไมย้ายมา: localStorage ผูกกับ origin ของเบราว์เซอร์ ไม่ใช่กับโปรแกรม
//   • ถอนโปรแกรมแล้วเทมเพลต/รูปหน้ายังอยู่ (ลงใหม่แล้วเจอของเก่า)
//   • ล้าง cache เบราว์เซอร์แล้วหายเกลี้ยงทั้งที่โปรแกรมยังอยู่ครบ
// อยู่ใน app.db แล้วจะหายไปพร้อมโปรแกรม และย้ายเครื่องได้พร้อมข้อมูล
import { api } from '@/lib/api'

// อ่านครั้งแรกไปโหลดจาก server แล้ว cache ไว้ — เขียนทีหลังเป็น write-through
const cache = new Map()      // name -> value
const inflight = new Map()   // name -> Promise (กันยิงซ้อนตอนหลาย component โหลดพร้อมกัน)

// คีย์ localStorage เดิม — ย้ายเข้า DB ครั้งเดียวแล้วลบทิ้ง
const LEGACY = { templates: 'gen_templates_v1', scenes: 'gen_scenes_v1', faces: 'gen_faces_v1', draft: 'gen_draft_v1' }

const legacyRead = (name) => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEGACY[name])
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
const legacyClear = (name) => { try { localStorage.removeItem(LEGACY[name]) } catch {} }

export async function loadStore(name, fallback) {
  if (cache.has(name)) return cache.get(name)
  if (inflight.has(name)) return inflight.get(name)

  const p = (async () => {
    let value = null
    try { value = (await api.genStore(name))?.value ?? null } catch { value = null }
    // ยังไม่มีใน DB แต่มีของเก่าค้างในเบราว์เซอร์ → ย้ายเข้า DB ให้ครั้งเดียว
    if (value == null) {
      const old = legacyRead(name)
      if (old != null) {
        value = old
        try { await api.genStoreSet(name, old); legacyClear(name) } catch {}
      }
    }
    if (value == null) value = fallback
    cache.set(name, value)
    inflight.delete(name)
    return value
  })()
  inflight.set(name, p)
  return p
}

// เขียนลง cache ทันที (UI ไม่ต้องรอ) แล้วค่อยยิงขึ้น server
// คืน {ok} เพื่อให้ผู้เรียกแจ้งเตือนได้เมื่อบันทึกไม่ผ่าน — ไม่กลืน error เงียบ
export async function saveStore(name, value) {
  cache.set(name, value)
  try {
    const r = await api.genStoreSet(name, value)
    return r?.ok ? { ok: true } : { ok: false, error: r?.error || 'บันทึกไม่สำเร็จ' }
  } catch (e) {
    return { ok: false, error: 'ต่อโปรแกรมหลักไม่ได้ — ข้อมูลจะยังไม่ถูกบันทึก' }
  }
}
