'use client'
// ขั้น 2 — ใครเป็นคนรีวิว + ขายให้ใคร
import { useState, useEffect } from 'react'
import { GEN_CHARS, GEN_AUDS } from '@/lib/gen-options'
import { listFaces, addFace, deleteFace } from '@/lib/gen-faces'
import { PickCard } from '@/components/gen/PickCard'
import { ImageSlot } from '@/components/gen/ImageSlot'
import { Topic } from '@/components/gen/CustomField'
import { ModelPreview } from '@/components/gen/ModelPreview'

export function StepReviewer({ o, set, selfPhoto, onSelfPhoto, modelRef, onSnap, onNotify, onError }) {
  const char = GEN_CHARS.find(c => c.id === o.charId) || GEN_CHARS[0]
  const prompts = o.prompts || {}
  const onPrompts = p => set({ prompts: p })
  const [faces, setFaces] = useState([])
  useEffect(() => { setFaces(listFaces()) }, [])

  // อัปรูปใหม่ → ใช้เลย + เก็บเข้าคลัง "หน้าของฉัน" อัตโนมัติ (จะได้ไม่ต้องอัปซ้ำรอบหน้า)
  const pickPhoto = (img, fname) => {
    onSelfPhoto(img)
    const r = addFace(img, fname?.replace(/\.[^.]+$/, '') || '')
    if (r.ok) { setFaces(listFaces()); set({ faceId: r.id }); if (!r.dup) onNotify?.('เก็บรูปนี้ไว้ในคลังหน้าแล้ว') }
    else onError?.(r.error)
  }

  const useFace = f => { onSelfPhoto(f.image); set({ faceId: f.id }) }

  const removeFace = (f, e) => {
    e.stopPropagation()
    deleteFace(f.id); setFaces(listFaces())
    if (o.faceId === f.id) set({ faceId: '' })
    onNotify?.('ลบรูปแล้ว')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="t-title text-ink">ใครเป็นคนรีวิว?</h2>
        <p className="t-cap mt-1">ตัวละครนี้จะเป็นคนถือสินค้าและพูดขายในคลิป</p>
      </div>

      <Topic label="ตัวละคร" fieldKey="char" prompts={prompts} onPrompts={onPrompts}
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
            <div className="flex flex-col gap-3">
              <ImageSlot
                title="รูปหน้าของคุณ"
                hint="รูปชัด หน้าตรง แสงสว่าง — ใช้เป็นภาพอ้างอิงใบหน้าในคลิป"
                image={selfPhoto} imageName=""
                max={512}
                onPick={pickPhoto}
                onClear={() => { onSelfPhoto(null); set({ faceId: '' }) }}
                onError={onError} />

              {faces.length > 0 && (
                <div>
                  <p className="t-section text-ink mb-2">หน้าของฉัน</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {faces.map(f => (
                      <PickCard key={f.id} active={o.faceId === f.id} onClick={() => useFace(f)}
                        title={f.name} img={f.image} ratio="aspect-square"
                        onDelete={e => removeFace(f, e)} />
                    ))}
                  </div>
                  <p className="t-cap mt-1.5">กดรูปเพื่อใช้ซ้ำ — รูปที่อัปใหม่จะถูกเก็บเข้าคลังให้เอง (เก็บล่าสุด 12 รูป)</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Topic>

      <div className="h-px bg-line" />

      <Topic label="ขายให้ใคร" fieldKey="aud" prompts={prompts} onPrompts={onPrompts}
        hint="เลือกกลุ่มสำเร็จรูป หรือเขียนกลุ่มเป้าหมายเอง">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GEN_AUDS.map(a => (
            <PickCard key={a.id} active={o.aud === a.id} onClick={() => set({ aud: a.id })}
              title={a.name} sub={a.desc} />
          ))}
        </div>
      </Topic>
    </div>
  )
}
