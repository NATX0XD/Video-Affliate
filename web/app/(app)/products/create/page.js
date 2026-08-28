'use client'
// หน้าสร้างคลิป 6 ขั้น — เปิดจาก /products (?ids=3,4)
// ที่เดียวที่ประกอบ gen แล้วยิงเข้าคิว ส่วนขั้นย่อยแค่แก้ค่าใน o
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronLeft, Loader2, Sparkles, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { buildGen, toExtProduct, productUid, productName } from '@/lib/gen-options'
import { useGenDraft } from '@/components/gen/useGenDraft'
import { StepRail } from '@/components/gen/StepRail'
import { StepTemplate } from '@/components/gen/steps/StepTemplate'
import { StepReviewer } from '@/components/gen/steps/StepReviewer'
import { StepStyle } from '@/components/gen/steps/StepStyle'
import { StepLook } from '@/components/gen/steps/StepLook'
import { StepAudio } from '@/components/gen/steps/StepAudio'
import { StepReview } from '@/components/gen/steps/StepReview'
import { getTemplate } from '@/lib/gen-templates'

const STEPS = [
  { label: 'สูตร' }, { label: 'ผู้รีวิว' }, { label: 'สไตล์' },
  { label: 'ลุคภาพ' }, { label: 'เสียง & บท' }, { label: 'สรุป' },
]

function CreateInner() {
  const router = useRouter()
  const toast = useToast()
  const params = useSearchParams()
  const ids = useMemo(() => (params.get('ids') || '').split(',').filter(Boolean), [params])

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selfPhoto, setSelfPhoto] = useState(null)
  const [presetSnap, setPresetSnap] = useState(null)
  const [tplPick, setTplPick] = useState('')
  const modelRef = useRef(null)

  const { o, set, replace, step, go, maxStep, clearDraft } = useGenDraft(ids)

  // ดึงสินค้าที่เลือกไว้จาก DB (id มาจาก query string)
  useEffect(() => {
    let alive = true
    api.products()
      .then(d => {
        if (!alive) return
        const all = d.products || []
        setProducts(all.filter(p => ids.includes(String(productUid(p)))))
      })
      .catch(() => alive && toast.error('โหลดสินค้าไม่สำเร็จ — เช็คว่าโปรแกรมหลักทำงานอยู่'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [ids, toast])

  const captureModel = () => {
    const snap = modelRef.current?.capture?.()
    if (snap) { setPresetSnap(snap); return snap }
    return null
  }

  const next = () => {
    if (step === 1) captureModel()   // เก็บมุมโมเดลที่ผู้ใช้หมุนไว้ก่อนออกจากขั้นตัวละคร
    go(Math.min(step + 1, STEPS.length - 1))
  }

  const useTemplate = () => {
    const t = getTemplate(tplPick)
    if (!t) return
    replace(t.opts)
    go(STEPS.length - 1)
    toast.success(`ใช้สูตร "${t.name}" แล้ว`)
  }

  const pickTemplate = id => {
    setTplPick(id)
    const t = getTemplate(id)
    if (t) replace(t.opts)
  }

  const run = async dry => {
    if (!products.length) return
    setBusy(true)
    try {
      const snapshot = o.charId === 'self' ? selfPhoto : (presetSnap || captureModel())
      const gen = buildGen(o, snapshot)
      const clean = products.map(p => toExtProduct(p))
      await api.queuePush({ payload: { type: 'flow_start', products: clean, gen, dry }, priority: dry ? 0 : 1 })
      toast.success(dry
        ? 'ส่งทดสอบเข้าคิวแล้ว — เปิด Flow (ส่วนขยาย) เพื่อดูพรอมป์'
        : `ส่ง ${products.length} สินค้าเข้าคิวสร้างคลิปแล้ว`)
      if (!dry) { clearDraft(); router.push('/jobs') }
    } catch {
      toast.error('ส่งเข้าคิวไม่สำเร็จ — เช็คว่าโปรแกรมหลักทำงานอยู่')
    } finally { setBusy(false) }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    )
  }

  if (!products.length) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center flex flex-col items-center gap-3">
        <p className="t-title text-ink">ยังไม่ได้เลือกสินค้า</p>
        <p className="t-cap">กลับไปเลือกสินค้าที่คลังสินค้า แล้วกด "สร้างคลิปจากที่เลือก"</p>
        <Link href="/products" className="t-body font-semibold text-accent-ink hover:underline">← ไปคลังสินค้า</Link>
      </div>
    )
  }

  const last = step === STEPS.length - 1

  return (
    <div className="max-w-4xl mx-auto pb-28">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link href="/products" className="flex items-center gap-1.5 t-body text-ink-dim hover:text-ink">
          <ChevronLeft size={16} /> กลับ
        </Link>
        <p className="t-cap">
          {products.length} สินค้า · {products.slice(0, 2).map(productName).join(', ')}
          {products.length > 2 ? ` +${products.length - 2}` : ''}
        </p>
      </div>

      <div className="mb-6">
        <StepRail steps={STEPS} step={step} maxStep={maxStep} onGo={go} />
      </div>

      <div className="rounded-2xl border border-line bg-surface/60 p-5 sm:p-6">
        {step === 0 && (
          <StepTemplate o={o} picked={tplPick} onPick={pickTemplate} onUse={useTemplate}
            onFresh={() => { setTplPick(''); }} onNotify={m => toast.success(m)} />
        )}
        {step === 1 && (
          <StepReviewer o={o} set={set} selfPhoto={selfPhoto} onSelfPhoto={setSelfPhoto}
            modelRef={modelRef} onSnap={() => { const s = modelRef.current?.capture?.(); if (s) setPresetSnap(s) }}
            onError={m => toast.error(m)} />
        )}
        {step === 2 && <StepStyle o={o} set={set} />}
        {step === 3 && <StepLook o={o} set={set} onNotify={m => toast.success(m)} onError={m => toast.error(m)} />}
        {step === 4 && <StepAudio o={o} set={set} />}
        {step === 5 && (
          <StepReview o={o} set={set} products={products}
            onNotify={m => toast.success(m)} onError={m => toast.error(m)} />
        )}
      </div>

      {/* แถบล่างติดหน้าจอ */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-base/95 backdrop-blur border-t border-line">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => go(step - 1)} disabled={busy}>
              <ArrowLeft size={13} /> ย้อนกลับ
            </Button>
          )}
          <span className="t-cap ml-1">ขั้นที่ {step + 1}/{STEPS.length}</span>
          <div className="ml-auto flex items-center gap-2">
            {last ? (
              <>
                <Button variant="outline" size="sm" onClick={() => run(true)} disabled={busy}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} ทดสอบ
                </Button>
                <Button size="sm" onClick={() => run(false)} disabled={busy}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  สร้างจริง {(o.len || 1) * products.length} คลิป
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={next}>ถัดไป <ArrowRight size={13} /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CreateClipPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] grid place-items-center"><Loader2 size={22} className="animate-spin text-accent" /></div>}>
      <CreateInner />
    </Suspense>
  )
}
