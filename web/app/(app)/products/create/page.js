'use client'
// หน้าสร้างคลิป 6 ขั้น — เปิดจาก /products (?ids=3,4)
// ที่เดียวที่ประกอบ gen แล้วยิงเข้าคิว ส่วนขั้นย่อยแค่แก้ค่าใน o
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronLeft, Loader2, Sparkles, FlaskConical, AlertTriangle, Package } from 'lucide-react'
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
import { getFace } from '@/lib/gen-faces'
import { Dialog } from '@/components/ui/Dialog'

const STEPS = [
  { label: 'รูปแบบคลิป' }, { label: 'ผู้รีวิว' }, { label: 'สไตล์' },
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
  const [exitOpen, setExitOpen] = useState(false)
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

  // เทมเพลตกับร่างเก็บแค่ "faceId" ไม่ได้เก็บตัวรูป (รูปอยู่ในคลังหน้าของฉัน)
  // โหลดเทมเพลตแล้วไม่ดึงรูปกลับมา → buildGen ได้ snapshot=null → ขึ้น "ไม่มีรูปหน้า (flow_char_img)"
  useEffect(() => {
    if (o.charId !== 'self' || !o.faceId || selfPhoto) return
    let dead = false
    getFace(o.faceId).then(f => { if (!dead && f?.image) setSelfPhoto(f.image) }).catch(() => {})
    return () => { dead = true }
  }, [o.charId, o.faceId, selfPhoto])

  const next = () => {
    if (step === 1) captureModel()   // เก็บมุมโมเดลที่ผู้ใช้หมุนไว้ก่อนออกจากขั้นตัวละคร
    go(Math.min(step + 1, STEPS.length - 1))
  }

  const useTemplate = async () => {
    const t = await getTemplate(tplPick)
    if (!t) return
    replace(t.opts)
    go(STEPS.length - 1)
    toast.success(`ใช้แนวทาง "${t.name}" แล้ว`)
  }

  const pickTemplate = async id => {
    setTplPick(id)
    const t = await getTemplate(id)
    if (t) replace(t.opts)
  }

  const run = async dry => {
    if (!products.length) return
    setBusy(true)
    try {
      // ไม่มีคีย์ AI = ส่วนขยายเขียนพรอมป์ไม่ได้ แล้วงานจะค้างในคิวแบบเงียบ ๆ
      // เช็กก่อนยิงเข้าคิว แล้วบอกวิธีแก้เป็นภาษาไทย ดีกว่าปล่อยให้ไปตายทีหลัง
      const setup = await api.getSetup().catch(() => null)
      if (setup && !setup.google_api_key_set) {
        toast.error('ยังไม่ได้ใส่คีย์ AI (Gemini) — สร้างคลิปไม่ได้ ไปที่หน้า "ตั้งค่า" → หัวข้อ "คีย์ AI (Gemini)" วางคีย์แล้วกดบันทึก (ขอคีย์ฟรีที่ aistudio.google.com/apikey)', { duration: 14000 })
        setBusy(false)
        return
      }
      // ส่วนขยายไม่ได้ต่อ = งานจะกองรออยู่ในคิวจนกว่าจะเปิด Chrome — เตือนแต่ยังส่งให้ (ต่อทีหลังได้)
      const st = await api.status().catch(() => null)
      if (st && !st.extension?.connected) {
        toast.warning('ส่วนขยาย Chrome ยังไม่ได้เชื่อมต่อ — งานจะรออยู่ในคิวจนกว่าจะเปิด Chrome แล้วกด reload ที่ chrome://extensions', { duration: 12000 })
      }

      const snapshot = o.charId === 'self' ? selfPhoto : (presetSnap || captureModel())
      // จับตั้งแต่ตรงนี้ ดีกว่าปล่อยไปล้มในส่วนขยายแล้วขึ้น "ไม่มีรูปหน้า (flow_char_img)"
      // เกิดได้เมื่อโหลดเทมเพลตที่อ้างรูปในคลังซึ่งถูกลบไปแล้ว
      if (!snapshot) {
        toast.error(o.charId === 'self'
          ? 'ยังไม่มีรูปหน้า — กลับไปขั้น "ใครเป็นคนรีวิว" แล้วเลือก/อัปรูปใหม่ (รูปที่เทมเพลตนี้อ้างถึงอาจถูกลบไปแล้ว)'
          : 'ยังไม่มีภาพตัวละคร — กลับไปขั้น "ใครเป็นคนรีวิว" อีกครั้ง')
        setBusy(false)
        return
      }
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
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-28">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        {/* สินค้าที่เลือกอยู่ข้างขั้นตอนบนจอใหญ่ ไม่เบียด stepper */}
        <aside className="order-2 lg:order-1 lg:sticky lg:top-6 rounded-2xl border border-line bg-surface/70 p-3.5">
          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div><p className="t-badge text-ink">สินค้าที่จะสร้าง</p><p className="t-cap mt-0.5">{products.length} รายการ</p></div>
            <Package size={17} className="text-accent shrink-0" />
          </div>
          <div className="mt-3 flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
            {products.map(p => (
              <div key={productUid(p)} className="flex items-center gap-2 rounded-xl bg-elevated/65 p-2">
                {p.image_url || p.images?.[0]
                  ? <img src={p.image_url || p.images?.[0]} alt={productName(p) || 'รูปสินค้า'} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                  : <div className="h-10 w-10 rounded-lg bg-surface grid place-items-center shrink-0"><Package size={14} /></div>}
                <span className="text-xs leading-snug text-ink line-clamp-2">{productName(p) || 'ไม่มีชื่อสินค้า'}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setExitOpen(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 t-cap font-semibold text-ink-dim hover:bg-elevated hover:text-ink">
            <ArrowLeft size={13} /> กลับไปเลือกสินค้า
          </button>
        </aside>

        <main className="order-1 lg:order-2 min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button type="button" onClick={() => step > 0 ? go(step - 1) : setExitOpen(true)} className="flex items-center gap-1.5 t-body text-ink-dim hover:text-ink">
              <ChevronLeft size={16} /> {step > 0 ? 'ย้อนกลับขั้นก่อน' : 'ออกจากการสร้าง'}
            </button>
            <span className="t-cap text-ink-mute">ขั้นที่ {step + 1} จาก {STEPS.length}</span>
          </div>

          <div className="mb-6 overflow-x-auto pb-1">
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
            onNotify={m => toast.success(m)} onError={m => toast.error(m)} products={products} />
        )}
        {step === 2 && <StepStyle o={o} set={set} products={products} />}
        {step === 3 && <StepLook o={o} set={set} onNotify={m => toast.success(m)} onError={m => toast.error(m)} products={products} />}
        {step === 4 && <StepAudio o={o} set={set} products={products} />}
        {step === 5 && (
          <StepReview o={o} set={set} products={products}
            onNotify={m => toast.success(m)} onError={m => toast.error(m)} />
        )}
          </div>
        </main>
      </div>

      {/* แถบล่างติดหน้าจอ */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-base/95 backdrop-blur border-t border-line">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2">
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
      <Dialog open={exitOpen} onClose={() => setExitOpen(false)} icon={AlertTriangle}
        title="ออกจากการสร้างคลิป?"
        description="ค่าที่กำลังตั้งอาจยังไม่ถูกบันทึก คุณต้องการกลับไปคลังสินค้าหรือไม่?"
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setExitOpen(false)}>อยู่หน้านี้ต่อ</Button>
          <Button variant="destructive" size="sm" onClick={() => router.push('/products')}>กลับคลังสินค้า</Button>
        </>} />
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
