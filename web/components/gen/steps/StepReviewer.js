'use client'
// ขั้น 2 — ใครเป็นคนรีวิว + ขายให้ใคร
import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GEN_CHARS, GEN_AUDS } from '@/lib/gen-options'
import { downscale } from '@/lib/downscale'
import { PickCard } from '@/components/gen/PickCard'
import { Topic, PromptBox } from '@/components/gen/CustomField'
import { ModelPreview } from '@/components/gen/ModelPreview'

export function StepReviewer({ o, set, selfPhoto, onSelfPhoto, modelRef, onSnap, onError }) {
  const fileRef = useRef(null)
  const char = GEN_CHARS.find(c => c.id === o.charId) || GEN_CHARS[0]
  const prompts = o.prompts || {}

  const pick = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try { onSelfPhoto(await downscale(f)) }
    catch { onError('อ่านรูปไม่สำเร็จ') }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="t-title text-ink">ใครเป็นคนรีวิว?</h2>
        <p className="t-cap mt-1">ตัวละครนี้จะเป็นคนถือสินค้าและพูดขายในคลิป</p>
      </div>

      <Topic label="ตัวละคร" fieldKey="char" prompts={prompts} onPrompts={p => set({ prompts: p })}
        hint="เลือกตัวละครสำเร็จรูป หรือใช้รูปตัวเอง">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {GEN_CHARS.map(c => (
              <PickCard key={c.id} active={o.charId === c.id} onClick={() => set({ charId: c.id })}
                title={c.name} sub={c.tag} />
            ))}
          </div>

          {char.model && (
            <ModelPreview key={char.id} ref={modelRef} src={`/${char.model}`} hue={char.hue} onLoad={onSnap} />
          )}

          {o.charId === 'self' && (
            <div className="rounded-xl border border-line bg-surface p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-elevated border border-line grid place-items-center shrink-0">
                {selfPhoto
                  ? <img src={selfPhoto} alt="" className="w-full h-full object-cover" />
                  : <Upload size={20} className="text-ink-mute" />}
              </div>
              <div className="flex-1">
                <p className="t-section text-ink">รูปหน้าของคุณ</p>
                <p className="t-cap mt-0.5">รูปชัด หน้าตรง แสงสว่าง — ใช้เป็นภาพอ้างอิงใบหน้าในคลิป</p>
                <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />
                <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> {selfPhoto ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Topic>

      <div className="h-px bg-line" />

      <section className="flex flex-col gap-2.5">
        <h3 className="t-section text-ink">ขายให้ใคร</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GEN_AUDS.map(a => (
            <PickCard key={a.id} active={o.aud === a.id} onClick={() => set({ aud: a.id })}
              title={a.name} sub={a.desc} />
          ))}
        </div>
      </section>
    </div>
  )
}
