'use client'
// หัวข้อ 1 อัน = ป้ายชื่อ + ปุ่มสลับ "เขียนเอง" + ตัวเลือกพรีเซ็ต (children) หรือช่องพิมพ์
// ปิดโหมดเขียนเอง = ล้างข้อความหัวข้อนั้นทิ้ง แล้วกลับไปใช้พรีเซ็ต
import { useState } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { GEN_PROMPT_FIELDS } from '@/lib/gen-options'

const fieldOf = key => GEN_PROMPT_FIELDS.find(f => f.key === key)

export function Topic({ label, fieldKey, prompts, onPrompts, hint, children, onClear, custom: extra }) {
  const typed = !!(prompts[fieldKey] || '').trim()
  const [custom, setCustom] = useState(typed)
  const f = fieldOf(fieldKey)

  const toggle = () => {
    const next = !custom
    setCustom(next)
    if (!next) {
      const p = { ...prompts }; delete p[fieldKey]
      onPrompts(p)
      onClear?.()
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <h3 className="t-section text-ink">{label}</h3>
        {hint && !custom && <p className="t-cap hidden sm:block">{hint}</p>}
        {fieldKey && (
          <button type="button" onClick={toggle}
            className={`ml-auto flex items-center gap-1.5 t-cap font-semibold rounded-lg px-2.5 py-1 border transition-colors
              ${custom ? 'border-accent bg-accent-wash text-accent-ink' : 'border-line text-ink-dim hover:text-ink'}`}>
            {custom ? <><RotateCcw size={13} /> ใช้ตัวเลือก</> : <><Pencil size={13} /> เขียนเอง</>}
          </button>
        )}
      </div>

      {custom
        ? <div className="flex flex-col gap-3">
            <textarea
              value={prompts[fieldKey] || ''}
              onChange={e => onPrompts({ ...prompts, [fieldKey]: e.target.value })}
              placeholder={f?.ph}
              rows={3}
              className="w-full resize-y rounded-xl border border-accent/40 bg-surface px-3.5 py-2.5 t-body
                         text-ink placeholder:text-ink-mute outline-none focus:border-accent" />
            {/* กล่องอัปรูป/บันทึกของหัวข้อนั้น — โผล่ทันทีที่กด "เขียนเอง" ไม่ต้องรอพิมพ์ก่อน */}
            {extra}
          </div>
        : children}
    </section>
  )
}

// ช่องพิมพ์เดี่ยว ๆ สำหรับหัวข้อที่ไม่มีพรีเซ็ตให้เลือก
export function PromptBox({ fieldKey, prompts, onPrompts, rows = 3 }) {
  const f = fieldOf(fieldKey)
  const typed = !!(prompts[fieldKey] || '').trim()
  return (
    <div className="flex flex-col gap-1.5">
      <p className={`t-section ${typed ? 'text-accent-ink' : 'text-ink'}`}>{f?.label}</p>
      <textarea
        value={prompts[fieldKey] || ''}
        onChange={e => onPrompts({ ...prompts, [fieldKey]: e.target.value })}
        placeholder={f?.ph}
        rows={rows}
        className={`w-full resize-y rounded-xl border bg-surface px-3.5 py-2.5 t-body text-ink
                    placeholder:text-ink-mute outline-none focus:border-accent
                    ${typed ? 'border-accent/40' : 'border-line'}`} />
    </div>
  )
}
