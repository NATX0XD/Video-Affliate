'use client'
// ขั้น 5 — เสียงและบทพูด
import { GEN_SOUNDS, GEN_VOICES, GEN_LANGS, GEN_MUSICS } from '@/lib/gen-options'
import { PillRow } from '@/components/gen/PickCard'
import { Topic, PromptBox } from '@/components/gen/CustomField'

export function StepAudio({ o, set }) {
  const prompts = o.prompts || {}
  const onPrompts = p => set({ prompts: p })
  const mute = o.sound === 'mute'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="t-title text-ink">เสียงและบทพูด</h2>
        <p className="t-cap mt-1">AI จะเขียนบทให้เอง เว้นแต่คุณกำหนดเอง</p>
      </div>

      <section className="flex flex-col gap-2.5">
        <h3 className="t-section text-ink">เสียงพูด</h3>
        <PillRow items={GEN_SOUNDS} value={o.sound} onPick={id => set({ sound: id })} />
        {mute && <p className="t-cap">โหมดเงียบ — ขายด้วยภาพและแอ็กชัน ตัวละครจะไม่พูด</p>}
      </section>

      {!mute && (
        <>
          <Topic label="น้ำเสียง" fieldKey="voice" prompts={prompts} onPrompts={onPrompts}>
            <PillRow items={GEN_VOICES} value={o.voice} onPick={id => set({ voice: id })} />
          </Topic>

          <section className="flex flex-col gap-2.5">
            <h3 className="t-section text-ink">ภาษา</h3>
            <PillRow items={GEN_LANGS} value={o.lang} onPick={id => set({ lang: id })} />
          </section>
        </>
      )}

      <Topic label="เพลงประกอบ" fieldKey="music" prompts={prompts} onPrompts={onPrompts}>
        <PillRow items={GEN_MUSICS} value={o.music} onPick={id => set({ music: id })} />
      </Topic>

      {!mute && (
        <>
          <div className="h-px bg-line" />
          <PromptBox fieldKey="script" prompts={prompts} onPrompts={onPrompts} rows={3} />
        </>
      )}
    </div>
  )
}
