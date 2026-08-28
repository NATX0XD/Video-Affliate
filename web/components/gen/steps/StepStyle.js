'use client'
// ขั้น 3 — คลิปแนวไหน ยาวเท่าไร ใช้เอนจินอะไร
import { GEN_STYLES, GEN_LENS, GEN_ENGINES } from '@/lib/gen-options'
import { PickCard } from '@/components/gen/PickCard'
import { PromptBox } from '@/components/gen/CustomField'

export function StepStyle({ o, set }) {
  const prompts = o.prompts || {}
  const onPrompts = p => set({ prompts: p })
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="t-title text-ink">คลิปแนวไหน?</h2>
        <p className="t-cap mt-1">แนวคลิปคุมทั้งการเปิดเรื่อง มุมกล้อง จังหวะ และโทนบทพูด</p>
      </div>

      <section className="flex flex-col gap-2.5">
        <h3 className="t-section text-ink">แนวคลิป</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GEN_STYLES.map(s => (
            <PickCard key={s.id} active={o.style === s.id} onClick={() => set({ style: s.id })}
              title={s.name} sub={s.desc} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="t-section text-ink">ความยาว</h3>
        <div className="grid grid-cols-3 gap-3">
          {GEN_LENS.map(l => (
            <PickCard key={l.n} active={o.len === l.n} onClick={() => set({ len: l.n })}
              title={l.t} sub={l.d} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="t-section text-ink">เอนจิน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GEN_ENGINES.map(e => (
            <PickCard key={e.id} active={o.engine === e.id} onClick={() => set({ engine: e.id })}
              title={e.t} sub={e.d} />
          ))}
        </div>
      </section>

      <div className="h-px bg-line" />
      <PromptBox fieldKey="action" prompts={prompts} onPrompts={onPrompts} rows={2} />
    </div>
  )
}
