'use client'
// สเตตของหน้าสร้างคลิป + เซฟร่างอัตโนมัติ
// ร่างผูกกับชุดสินค้าที่เลือก (ids) — เปิดด้วยสินค้าคนละชุดถือว่าเริ่มใหม่
import { useState, useEffect, useCallback, useRef } from 'react'
import { GEN_DEFAULT } from '@/lib/gen-options'

const KEY = 'gen_draft_v1'
const fresh = () => ({ ...GEN_DEFAULT, prompts: {} })

export function useGenDraft(ids) {
  const [o, setO] = useState(fresh)
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)      // ขั้นไกลสุดที่เคยไปถึง — ใช้คุมว่ากดข้ามไปไหนได้
  const [loaded, setLoaded] = useState(false)
  const idsKey = (ids || []).join(',')
  const skipSave = useRef(true)

  // โหลดร่างครั้งแรก (เฉพาะฝั่ง client)
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (d && d.ids === idsKey && d.o) {
        setO({ ...fresh(), ...d.o, prompts: { ...(d.o.prompts || {}) } })
        setStep(d.step || 0)
        setMaxStep(d.maxStep || d.step || 0)
      }
    } catch {}
    setLoaded(true)
    skipSave.current = false
  }, [idsKey])

  // เซฟร่างทุกครั้งที่เปลี่ยน (ข้ามรอบแรกกันเขียนทับด้วยค่าเริ่มต้น)
  useEffect(() => {
    if (skipSave.current || !loaded) return
    try { localStorage.setItem(KEY, JSON.stringify({ ids: idsKey, o, step, maxStep, at: Date.now() })) }
    catch {}
  }, [o, step, maxStep, idsKey, loaded])

  const set = useCallback(patch => setO(prev => ({ ...prev, ...patch })), [])

  const go = useCallback(n => {
    setStep(n)
    setMaxStep(m => Math.max(m, n))
  }, [])

  const reset = useCallback(() => {
    setO(fresh()); setStep(0); setMaxStep(0)
    try { localStorage.removeItem(KEY) } catch {}
  }, [])

  // แทนค่าทั้งชุด (โหลดเทมเพลต)
  const replace = useCallback(next => {
    setO({ ...fresh(), ...next, prompts: { ...(next.prompts || {}) } })
  }, [])

  const clearDraft = useCallback(() => { try { localStorage.removeItem(KEY) } catch {} }, [])

  return { o, set, replace, step, go, maxStep, reset, clearDraft, loaded }
}
