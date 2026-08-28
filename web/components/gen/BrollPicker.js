'use client'
// footage แทรก (B-roll) — ตัดสลับภาพสินค้ากับคนพูดในคลิป
// ปิดเป็นค่าเริ่มต้น: คลิปที่ได้ตอนนี้ใช้งานได้อยู่แล้ว เปิดเมื่อผู้ใช้อยากได้เท่านั้น
import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, Film, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BROLL_SOURCES } from '@/lib/gen-options'
import { listFootage, addFootage, deleteFootage } from '@/lib/gen-footage'

export function BrollPicker({ o, set, onNotify, onError }) {
  const on = !!o.brollOn
  const sources = o.brollSources || []
  const [mine, setMine] = useState([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { listFootage().then(setMine).catch(() => {}) }, [])

  const toggleSource = (id) => {
    const next = sources.includes(id) ? sources.filter(s => s !== id) : [...sources, id]
    set({ brollSources: next })
  }

  const upload = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    const r = await addFootage(f).catch(() => ({ ok: false, error: 'อ่านไฟล์ไม่สำเร็จ' }))
    setBusy(false)
    if (!r.ok) { onError?.(r.error); return }
    setMine(await listFootage())
    if (!sources.includes('upload')) set({ brollSources: [...sources, 'upload'] })
    onNotify?.('เพิ่ม footage แล้ว')
  }

  const remove = async (f) => {
    await deleteFootage(f.id)
    setMine(await listFootage())
    onNotify?.('ลบ footage แล้ว')
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={on} onChange={e => set({ brollOn: e.target.checked })}
          className="mt-1 w-4 h-4 accent-[var(--accent)]" />
        <span>
          <span className="t-section text-ink flex items-center gap-1.5"><Film size={14} /> แทรก footage สินค้าในคลิป</span>
          <span className="t-cap block mt-0.5">
            ตัดสลับภาพสินค้ากับคนพูดเป็นช่วง ๆ · เสียงพูดยังต่อเนื่องทั้งคลิป · ไม่เปิดก็ได้คลิปแบบเดิม
          </span>
        </span>
      </label>

      {on && (
        <div className="flex flex-col gap-3 pl-7">
          <div>
            <p className="t-section text-ink mb-2">เอา footage มาจากไหน (เลือกได้หลายอย่าง)</p>
            <div className="flex flex-col gap-2">
              {BROLL_SOURCES.map(s => (
                <label key={s.id} className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={sources.includes(s.id)} onChange={() => toggleSource(s.id)}
                    className="mt-1 w-4 h-4 accent-[var(--accent)]" />
                  <span>
                    <span className="t-body text-ink">{s.name}</span>
                    <span className="t-cap block">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {sources.includes('flow') && (
            <div className="rounded-lg border border-line bg-elevated px-3 py-2">
              <p className="t-cap">
                Flow วาดภาพสินค้าให้ในโหมดรูปภาพ ซึ่ง<strong className="text-ink">ไม่หักเครดิตวิดีโอ</strong> —
                แต่ต้องรอเรนเดอร์เพิ่มรูปละ ~1 นาทีต่อคลิป ถ้าทำหลายสินค้าจะช้าขึ้นชัดเจน
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="t-cap">จำนวนภาพต่อคลิป</span>
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" onClick={() => set({ brollCount: n })}
                    className={`px-2.5 py-1 rounded-lg border t-cap transition-all
                      ${(o.brollCount || 2) === n ? 'border-accent text-accent bg-accent-wash' : 'border-line text-ink-mute hover:border-accent/50'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sources.includes('upload') && (
            <div>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="video/*,image/*" onChange={upload} className="hidden" />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {busy ? 'กำลังอ่านไฟล์…' : 'อัป footage ของฉัน'}
                </Button>
                <span className="t-cap">คลิปสั้น ๆ ~2-5 วิ หรือรูปก็ได้ · ไม่เกิน 6MB ต่อไฟล์</span>
              </div>
              {mine.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
                  {mine.map(f => (
                    <div key={f.id} className="relative rounded-lg overflow-hidden border border-line bg-elevated aspect-square">
                      {f.kind === 'video'
                        ? <video src={f.data} muted playsInline className="w-full h-full object-cover" />
                        : <img src={f.data} alt="" className="w-full h-full object-cover" />}
                      <button type="button" onClick={() => remove(f)}
                        title="ลบ footage นี้"
                        className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-md bg-black/60 text-white hover:bg-danger">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {on && sources.length === 0 && (
            <p className="t-cap text-danger">ยังไม่ได้เลือกแหล่ง footage — เลือกอย่างน้อย 1 อย่าง ไม่งั้นระบบจะข้ามการแทรกให้</p>
          )}
        </div>
      )}
    </section>
  )
}
