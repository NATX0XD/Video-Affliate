'use client'
// แถบ 6 ขั้น — กดย้อนกลับได้เฉพาะขั้นที่เคยไปถึงแล้ว
import { Check } from 'lucide-react'

export function StepRail({ steps, step, maxStep, onGo }) {
  return (
    <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < step
        const active = i === step
        const reachable = i <= maxStep
        return (
          <div key={s.label} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button type="button" disabled={!reachable} onClick={() => reachable && onGo(i)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors
                ${active ? 'border-accent bg-accent text-white'
                  : done ? 'border-accent/40 bg-accent-wash text-accent-ink hover:bg-accent-wash/70'
                  : reachable ? 'border-line text-ink-dim hover:text-ink'
                  : 'border-line text-ink-mute cursor-default'}`}>
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0
                ${active ? 'bg-white/20' : done ? 'bg-accent text-white' : 'bg-elevated'}`}>
                {done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span className="t-cap font-semibold whitespace-nowrap"
                    style={{ color: active ? '#fff' : undefined }}>{s.label}</span>
            </button>
            {i < steps.length - 1 && <span className={`h-px w-3 sm:w-5 ${i < step ? 'bg-accent' : 'bg-line'}`} />}
          </div>
        )
      })}
    </nav>
  )
}
