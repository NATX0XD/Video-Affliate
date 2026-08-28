'use client'
// ขั้น 1 — เริ่มจากสูตรที่บันทึกไว้ หรือเริ่มใหม่
import { useState, useEffect } from 'react'
import { Sparkles, Trash2, Check } from 'lucide-react'
import { listTemplates, deleteTemplate } from '@/lib/gen-templates'
import { GEN_CHARS, GEN_STYLES, GEN_BGS, cleanPrompts } from '@/lib/gen-options'

// สรุปสั้น ๆ ว่าสูตรนี้ตั้งอะไรไว้บ้าง
function summary(o) {
  const bits = [
    GEN_CHARS.find(c => c.id === o.charId)?.name,
    GEN_STYLES.find(s => s.id === o.style)?.name,
    o.prompts?.scene ? 'ฉากกำหนดเอง' : GEN_BGS.find(b => b.id === o.bg)?.name,
  ].filter(Boolean)
  const n = Object.keys(cleanPrompts(o.prompts || {})).length
  if (n) bits.push(`พรอมป์เอง ${n}`)
  return bits.join(' · ')
}

export function StepTemplate({ o, onUse, onFresh, picked, onPick, onNotify }) {
  const [list, setList] = useState([])
  useEffect(() => { setList(listTemplates()) }, [])

  const remove = (id, e) => {
    e.stopPropagation()
    deleteTemplate(id); setList(listTemplates())
    if (picked === id) onPick('')
    onNotify?.('ลบสูตรแล้ว')
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="t-title text-ink">เริ่มจากสูตรไหน?</h2>
        <p className="t-cap mt-1">เลือกสูตรที่เคยบันทึกไว้ แล้วปรับต่อได้ หรือเริ่มจากศูนย์</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* เริ่มใหม่ */}
        <button type="button" onClick={onFresh}
          className={`rounded-xl border-2 border-dashed p-5 text-left transition-colors
            ${!picked ? 'border-accent bg-accent-wash' : 'border-line hover:border-accent/50'}`}>
          <Sparkles size={20} className={!picked ? 'text-accent-ink' : 'text-ink-dim'} />
          <p className={`t-section mt-2 ${!picked ? 'text-accent-ink' : 'text-ink'}`}>เริ่มใหม่</p>
          <p className="t-cap mt-0.5">ตั้งค่าเองทีละขั้น</p>
        </button>

        {list.map(t => {
          const on = picked === t.id
          return (
            <div key={t.id} className="relative group">
              <button type="button" onClick={() => onPick(t.id)}
                className={`w-full rounded-xl border overflow-hidden text-left transition-all bg-surface
                  ${on ? 'border-accent ring-2 ring-accent/30 shadow-card' : 'border-line hover:border-accent/50 hover:shadow-card'}`}>
                <div className="aspect-[16/9] w-full relative bg-elevated"
                  style={{ background: t.opts?.bgImage ? undefined : (GEN_BGS.find(b => b.id === t.opts?.bg)?.thumb || undefined) }}>
                  {t.opts?.bgImage
                    ? <img src={t.opts.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : GEN_BGS.find(b => b.id === t.opts?.bg)?.img
                      ? <img src={GEN_BGS.find(b => b.id === t.opts?.bg).img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : null}
                  {on && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent grid place-items-center">
                      <Check size={12} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className={`t-section truncate ${on ? 'text-accent-ink' : 'text-ink'}`}>{t.name}</p>
                  <p className="t-cap mt-0.5 truncate">{summary(t.opts || {})}</p>
                </div>
              </button>
              <button type="button" onClick={e => remove(t.id, e)} title="ลบสูตรนี้"
                className="absolute top-2 left-2 w-6 h-6 rounded-full bg-surface/90 border border-line text-ink-dim
                           hover:text-danger grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>

      {picked && (
        <button type="button" onClick={onUse}
          className="self-start rounded-lg bg-accent text-white t-body font-semibold px-4 py-2 hover:bg-accent-soft transition-colors">
          ใช้สูตรนี้เลย → ข้ามไปหน้าสรุป
        </button>
      )}

      {!list.length && (
        <p className="t-cap">ยังไม่มีสูตรที่บันทึกไว้ — ตั้งค่าครบแล้วกด "บันทึกเป็นสูตร" ที่หน้าสรุป จะเก็บไว้ใช้รอบหน้า</p>
      )}
    </div>
  )
}
