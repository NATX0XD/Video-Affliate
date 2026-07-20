'use client'
import { useState, useRef } from 'react'
import {
  X, ArrowLeft, ArrowRight, Sparkles, Upload, Check, Loader2, ChevronDown, FlaskConical,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import {
  GEN_CHARS, GEN_STYLES, GEN_AUDS, GEN_BGS, GEN_MOODS, GEN_SOUNDS,
  GEN_VOICES, GEN_LANGS, GEN_MUSICS, GEN_LENS, GEN_ENGINES, GEN_DEFAULT, buildGen, toExtProduct,
} from '@/lib/gen-options'

const STEP_TITLES = ['ใครเป็นคนรีวิว?', 'ขายให้ใคร?', 'คลิปแนวไหน?', 'พร้อมสร้างแล้ว']

// ย่อรูปผู้ใช้เป็น dataURL (กว้าง/สูงไม่เกิน 512, JPEG q0.85) — เหมือน extension gmDownscale
function downscale(file, max = 512) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width: w, height: h } = img
        if (w > h && w > max) { h = Math.round(h * max / w); w = max }
        else if (h > max) { w = Math.round(w * max / h); h = max }
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = fr.result
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

// การ์ดตัวเลือกแบบเลือกได้ (radio)
function OptCard({ active, onClick, title, sub, style }) {
  return (
    <button type="button" onClick={onClick} style={style}
      className={`text-left rounded-xl border px-3.5 py-3 transition-all cursor-pointer
        ${active
          ? 'border-accent bg-accent-wash ring-1 ring-accent/40'
          : 'border-border bg-secondary hover:border-accent/40 hover:bg-secondary/70'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${active ? 'text-accent' : 'text-foreground'}`}>{title}</span>
        {active && <Check size={13} className="text-accent ml-auto shrink-0" />}
      </div>
      {sub && <p className="text-muted-foreground text-[11px] mt-1 leading-snug">{sub}</p>}
    </button>
  )
}

export function GenWizard({ products = [], onClose, onDone }) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [o, setO] = useState({ ...GEN_DEFAULT })
  const [selfPhoto, setSelfPhoto] = useState(null)
  const [adv, setAdv] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const set = patch => setO(prev => ({ ...prev, ...patch }))

  const clips = (o.len || 1) * products.length

  const onPhoto = async e => {
    const f = e.target.files?.[0]; if (!f) return
    try { setSelfPhoto(await downscale(f)) }
    catch { toast.error('อ่านรูปไม่สำเร็จ') }
  }

  const run = async (dry) => {
    if (!products.length) return
    setBusy(true)
    try {
      const gen = buildGen(o, selfPhoto)
      const clean = products.map(({ _uid, ...p }) => toExtProduct(p))
      await api.queuePush({ payload: { type: 'flow_start', products: clean, gen, dry }, priority: dry ? 0 : 1 })
      toast.success(dry
        ? 'ส่งทดสอบเข้าคิวแล้ว — เปิด Flow (ส่วนขยาย) เพื่อดูพรอมป์'
        : `ส่ง ${products.length} สินค้าเข้าคิวสร้างคลิปแล้ว — ส่วนขยายจะเริ่มขับ Google Flow ให้`)
      onDone?.()
    } catch {
      toast.error('ส่งเข้าคิวไม่สำเร็จ — เช็คว่าโปรแกรมหลักทำงานอยู่')
    } finally { setBusy(false) }
  }

  const canNext = step < 3
  const canBack = step > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6 animate-fade-in"
      onClick={() => !busy && onClose()}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-lift animate-scale-in"
        onClick={e => e.stopPropagation()}>

        {/* Header + stepper */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-border shrink-0">
          <div>
            <h3 className="text-foreground font-bold text-lg flex items-center gap-2">
              <Sparkles size={17} className="text-accent" /> {STEP_TITLES[step]}
            </h3>
            <p className="text-muted-foreground text-xs mt-1">
              สร้างคลิปจาก {products.length} สินค้า · ขั้นที่ {step + 1}/4
            </p>
          </div>
          <button onClick={() => !busy && onClose()}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0">
            <X size={18} />
          </button>
        </div>
        {/* progress bar */}
        <div className="h-1 bg-secondary shrink-0">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${(step + 1) / 4 * 100}%` }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          {/* STEP 0 — character */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {GEN_CHARS.map(c => (
                  <OptCard key={c.id} active={o.charId === c.id} onClick={() => set({ charId: c.id })}
                    title={c.name} sub={c.tag} style={{ borderLeftColor: c.hue }} />
                ))}
              </div>
              {o.charId === 'self' && (
                <div className="rounded-xl border border-border bg-secondary p-4 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-background border border-border flex items-center justify-center shrink-0">
                    {selfPhoto
                      ? <img src={selfPhoto} alt="" className="w-full h-full object-cover" />
                      : <Upload size={20} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground text-sm font-semibold">รูปหน้าของคุณ (i2v หน้าเป๊ะ)</p>
                    <p className="text-muted-foreground text-[11px] mt-0.5">รูปชัด หน้าตรง แสงสว่าง — ใช้เป็นภาพอ้างอิงหน้า</p>
                    <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
                      <Upload size={13} /> {selfPhoto ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 1 — audience */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GEN_AUDS.map(a => (
                <OptCard key={a.id} active={o.aud === a.id} onClick={() => set({ aud: a.id })}
                  title={a.name} sub={a.desc} />
              ))}
            </div>
          )}

          {/* STEP 2 — style + length + engine + advanced */}
          {step === 2 && (
            <>
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">แนวคลิป</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GEN_STYLES.map(s => (
                    <OptCard key={s.id} active={o.style === s.id} onClick={() => set({ style: s.id })}
                      title={s.name} sub={s.desc} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">ความยาว</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {GEN_LENS.map(l => (
                    <OptCard key={l.n} active={o.len === l.n} onClick={() => set({ len: l.n })}
                      title={l.t} sub={l.d} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">เอนจิน</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {GEN_ENGINES.map(e => (
                    <OptCard key={e.id} active={o.engine === e.id} onClick={() => set({ engine: e.id })}
                      title={e.t} sub={e.d} />
                  ))}
                </div>
              </div>

              {/* advanced accordion */}
              <button type="button" onClick={() => setAdv(v => !v)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit">
                <ChevronDown size={15} className={`transition-transform ${adv ? 'rotate-180' : ''}`} />
                ตัวเลือกขั้นสูง (ฉาก / อารมณ์ / เสียง / ภาษา / เพลง)
              </button>
              {adv && (
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/40 p-4">
                  {[
                    ['ฉากหลัง', GEN_BGS, 'bg'],
                    ['อารมณ์ภาพ', GEN_MOODS, 'mood'],
                    ['เสียงพูด', GEN_SOUNDS, 'sound'],
                    ['น้ำเสียง', GEN_VOICES, 'voice'],
                    ['ภาษา', GEN_LANGS, 'lang'],
                    ['เพลง', GEN_MUSICS, 'music'],
                  ].map(([label, arr, key]) => (
                    <div key={key}>
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">{label}</p>
                      <div className="flex flex-wrap gap-2">
                        {arr.map(it => (
                          <button key={it.id} type="button" onClick={() => set({ [key]: it.id })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                              ${o[key] === it.id
                                ? 'border-accent bg-accent-wash text-accent'
                                : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}>
                            {it.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* STEP 3 — summary */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-secondary/40 p-4 grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
                {[
                  ['ตัวละคร', GEN_CHARS.find(c => c.id === o.charId)?.name],
                  ['กลุ่มเป้าหมาย', GEN_AUDS.find(a => a.id === o.aud)?.name],
                  ['แนวคลิป', GEN_STYLES.find(s => s.id === o.style)?.name],
                  ['ความยาว', GEN_LENS.find(l => l.n === o.len)?.t],
                  ['เอนจิน', GEN_ENGINES.find(e => e.id === o.engine)?.t],
                  ['ฉาก', GEN_BGS.find(b => b.id === o.bg)?.name],
                  ['ภาษา', GEN_LANGS.find(l => l.id === o.lang)?.name],
                  ['เพลง', GEN_MUSICS.find(m => m.id === o.music)?.name],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-muted-foreground text-[11px]">{k}</span>
                    <span className="text-foreground font-semibold">{v || '-'}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-accent/30 bg-accent-wash px-4 py-3 text-sm text-foreground">
                จะสร้าง <span className="font-bold text-accent">{clips} คลิป</span> จาก {products.length} สินค้า
                ({o.len} คลิป/สินค้า) · ใช้ ~{clips} เครดิต Flow
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 flex flex-col gap-2">
                <p className="text-foreground text-xs font-semibold flex items-center gap-1.5">
                  <ExternalLink size={13} className="text-accent" /> ก่อนสร้าง — เปิด Google Flow + ล็อกอินค้างไว้
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  กด "สร้างจริง" แล้วงานเข้าคิว → ส่วนขยายจะเปิด Google Flow แล้วขับสร้างให้อัตโนมัติ
                  (สร้างโปรเจกต์ใหม่ + ใส่พรอมป์ + รอเรนเดอร์). <span className="text-foreground">ต้องเปิด Chrome
                  หน้าต่างแอปค้างไว้ + ล็อกอินบัญชี Google ในหน้า Flow ก่อน</span> ครั้งแรกต้องล็อกอินเอง
                </p>
                <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline w-fit">
                  <ExternalLink size={13} /> เปิด Google Flow เพื่อล็อกอิน
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0">
          {canBack && (
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} disabled={busy}>
              <ArrowLeft size={13} /> ย้อนกลับ
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {canNext ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)}>
                ถัดไป <ArrowRight size={13} />
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => run(true)} disabled={busy}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} ทดสอบ
                </Button>
                <Button size="sm" onClick={() => run(false)} disabled={busy || !products.length}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} สร้างจริง {clips} คลิป
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
