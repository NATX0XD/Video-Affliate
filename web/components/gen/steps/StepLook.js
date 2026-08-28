'use client'
// ขั้น 4 — ลุคภาพ: ฉาก (รูปจริง + ฉากของฉัน + อัปรูปเอง) และอารมณ์ภาพ (อัปรูปโทนสีเองได้)
import { useState, useEffect } from 'react'
import { Plus, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GEN_BGS, GEN_MOODS } from '@/lib/gen-options'
import { listScenes, saveScene, deleteScene } from '@/lib/gen-scenes'
import { PickCard } from '@/components/gen/PickCard'
import { ImageSlot } from '@/components/gen/ImageSlot'
import { Topic, PromptBox } from '@/components/gen/CustomField'

export function StepLook({ o, set, onNotify, onError }) {
  const prompts = o.prompts || {}
  const onPrompts = p => set({ prompts: p })
  const [scenes, setScenes] = useState([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => { setScenes(listScenes()) }, [])

  const applyScene = s =>
    set({ prompts: { ...prompts, scene: s.prompt }, bgImage: s.image || null, bgImageName: s.imageName || '', sceneId: s.id })

  const save = () => {
    const r = saveScene({ name, prompt: prompts.scene, image: o.bgImage, imageName: o.bgImageName })
    if (!r.ok) { onError(r.error); return }
    setScenes(listScenes()); setNaming(false); set({ sceneId: r.id })
    onNotify(r.replaced ? `ทับฉาก "${name.trim()}" แล้ว` : `บันทึกฉาก "${name.trim()}" แล้ว`)
  }

  const removeScene = (s, e) => {
    e.stopPropagation()
    deleteScene(s.id); setScenes(listScenes())
    if (o.sceneId === s.id) set({ sceneId: '' })
    onNotify('ลบฉากแล้ว')
  }

  // กล่องอัปรูปฉาก + ปุ่มบันทึกฉาก — โผล่ทันทีที่กด "เขียนเอง"
  const sceneSlot = (
    <ImageSlot
      title="รูปฉากหลังที่ต้องการ (ไม่บังคับ)"
      hint="ระบบส่งรูปนี้เข้า Google Flow เป็นภาพอ้างอิงฉาก"
      image={o.bgImage} imageName={o.bgImageName}
      onPick={(img, fname) => set({ bgImage: img, bgImageName: fname })}
      onClear={() => set({ bgImage: null, bgImageName: '' })}
      onError={onError}>
      {naming ? (
        <div className="flex items-center gap-2">
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="ตั้งชื่อฉาก เช่น ร้านกาแฟไม้"
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 t-body text-ink outline-none focus:border-accent" />
          <Button size="sm" onClick={save} disabled={!name.trim()}><Save size={13} /> บันทึก</Button>
          <button type="button" onClick={() => setNaming(false)} className="t-cap hover:text-ink">ยกเลิก</button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setNaming(true)}
          disabled={!(prompts.scene || '').trim() && !o.bgImage}>
          <Plus size={13} /> บันทึกฉากนี้ไว้ใช้ซ้ำ
        </Button>
      )}
    </ImageSlot>
  )

  // กล่องอัปรูปอ้างอิงโทนสี/อารมณ์
  const moodSlot = (
    <ImageSlot
      title="รูปอ้างอิงโทนสี/อารมณ์ (ไม่บังคับ)"
      hint="ใช้เป็นตัวอย่างโทนสีและแสงที่อยากได้ ระบบส่งเข้า Flow ด้วย"
      image={o.moodImage} imageName={o.moodImageName}
      onPick={(img, fname) => set({ moodImage: img, moodImageName: fname })}
      onClear={() => set({ moodImage: null, moodImageName: '' })}
      onError={onError} />
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="t-title text-ink">ลุคภาพเป็นแบบไหน?</h2>
        <p className="t-cap mt-1">รูปที่เห็นคือตัวอย่างบรรยากาศ ไม่ใช่ภาพที่จะออกมาเป๊ะ ๆ</p>
      </div>

      <Topic label="ฉากหลัง" fieldKey="scene" prompts={prompts} onPrompts={onPrompts}
        hint="เลือกฉากสำเร็จรูป หรือกด เขียนเอง เพื่อพิมพ์ฉาก + แนบรูป"
        custom={sceneSlot}
        onClear={() => set({ bgImage: null, bgImageName: '', sceneId: '' })}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {GEN_BGS.map(b => (
            <PickCard key={b.id} active={o.bg === b.id && !prompts.scene} onClick={() => set({ bg: b.id })}
              title={b.name} img={b.img} thumb={b.thumb} />
          ))}
        </div>
      </Topic>

      {scenes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h3 className="t-section text-ink">ฉากของฉัน</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {scenes.map(s => (
              <PickCard key={s.id} active={o.sceneId === s.id} onClick={() => applyScene(s)}
                title={s.name} img={s.image} thumb="linear-gradient(135deg,#c7c7d6,#9a9ab0)"
                onDelete={e => removeScene(s, e)} />
            ))}
          </div>
        </section>
      )}

      <div className="h-px bg-line" />

      <Topic label="อารมณ์ภาพ" fieldKey="mood" prompts={prompts} onPrompts={onPrompts}
        hint="คุมโทนสีและแสงรวมของคลิป — กด เขียนเอง เพื่อพิมพ์เอง + แนบรูปอ้างอิง"
        custom={moodSlot}
        onClear={() => set({ moodImage: null, moodImageName: '' })}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {GEN_MOODS.map(m => (
            <PickCard key={m.id} active={o.mood === m.id && !prompts.mood} onClick={() => set({ mood: m.id })}
              title={m.name} img={m.img} thumb={m.thumb} />
          ))}
        </div>
      </Topic>

      <div className="h-px bg-line" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PromptBox fieldKey="light" prompts={prompts} onPrompts={onPrompts} rows={2} />
        <PromptBox fieldKey="camera" prompts={prompts} onPrompts={onPrompts} rows={2} />
      </div>
    </div>
  )
}
