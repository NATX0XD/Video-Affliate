'use client'
// สเตตของหน้าสร้างคลิป + เซฟร่างอัตโนมัติ
// ร่างผูกกับชุดสินค้าที่เลือก (ids) — เปิดด้วยสินค้าคนละชุดถือว่าเริ่มใหม่
import { useState, useEffect, useCallback, useRef } from 'react'
import { GEN_DEFAULT } from '@/lib/gen-options'
import { loadStore, saveStore } from '@/lib/gen-store'

// ร่างเก็บใน app.db ผ่าน gen-store — ย้ายมาจาก localStorage (ดูเหตุผลใน gen-store.js)
const NAME = 'draft'
const fresh = () => ({ ...GEN_DEFAULT, prompts: {} })

export function useGenDraft(ids) {
  const [o, setO] = useState(fresh)
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)      // ขั้นไกลสุดที่เคยไปถึง — ใช้คุมว่ากดข้ามไปไหนได้
  const [loaded, setLoaded] = useState(false)
  const idsKey = (ids || []).join(',')
  const skipSave = useRef(true)

  // โหลดร่างครั้งแรก — อ่านจากโปรแกรมหลัก ไม่ใช่เบราว์เซอร์
  useEffect(() => {
    let dead = false
    loadStore(NAME, null).then(d => {
      if (dead) return
      if (d && d.ids === idsKey && d.o) {
        setO({ ...fresh(), ...d.o, prompts: { ...(d.o.prompts || {}) } })
        setStep(d.step || 0)
        setMaxStep(d.maxStep || d.step || 0)
      }
    }).catch(() => {}).finally(() => {
      if (dead) return
      setLoaded(true)
      skipSave.current = false
    })
    return () => { dead = true }
  }, [idsKey])

  // เซฟร่างเมื่อหยุดแก้ ~600ms (ข้ามรอบแรกกันเขียนทับด้วยค่าเริ่มต้น)
  // หน่วงไว้เพราะทุกการพิมพ์ 1 ตัวอักษรจะยิง API — เดิมเขียน localStorage เลยไม่ต้องหน่วง
  useEffect(() => {
    if (skipSave.current || !loaded) return
    const t = setTimeout(() => {
      saveStore(NAME, { ids: idsKey, o, step, maxStep, at: Date.now() })
    }, 600)
    return () => clearTimeout(t)
  }, [o, step, maxStep, idsKey, loaded])

  const set = useCallback(patch => setO(prev => ({ ...prev, ...patch })), [])

  const go = useCallback(n => {
    setStep(n)
    setMaxStep(m => Math.max(m, n))
  }, [])

  const reset = useCallback(() => {
    setO(fresh()); setStep(0); setMaxStep(0)
    saveStore(NAME, null)
  }, [])

  // แทนค่าทั้งชุด (โหลดเทมเพลต)
  const replace = useCallback(next => {
    setO({ ...fresh(), ...next, prompts: { ...(next.prompts || {}) } })
  }, [])

  const clearDraft = useCallback(() => { saveStore(NAME, null) }, [])

  return { o, set, replace, step, go, maxStep, reset, clearDraft, loaded }
}
