'use client'
import { Fragment } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Stepper — ตัวบอกลำดับขั้น (สำหรับ wizard / onboarding เฟสถัดไป)
 *
 * props:
 *   steps: ['ขั้น 1','ขั้น 2'] หรือ [{ label, desc }]
 *   current: index ของขั้นปัจจุบัน (0-based) · ขั้นก่อนหน้า = เสร็จแล้ว
 *   orientation: 'horizontal' (ค่าเริ่ม) | 'vertical'
 */
export function Stepper({ steps = [], current = 0, orientation = 'horizontal', className }) {
  const items = steps.map((s) => (typeof s === 'string' ? { label: s } : s))

  const circle = (state) =>
    cn(
      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-colors',
      state === 'done'   && 'bg-accent border-accent text-white',
      state === 'active' && 'border-accent text-accent bg-accent-wash',
      state === 'todo'   && 'border-border text-muted-foreground',
    )

  const stateOf = (i) => (i < current ? 'done' : i === current ? 'active' : 'todo')

  if (orientation === 'vertical') {
    return (
      <div className={cn('flex flex-col', className)}>
        {items.map((step, i) => {
          const st = stateOf(i)
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={circle(st)}>{st === 'done' ? <Check size={15} strokeWidth={3} /> : i + 1}</div>
                {i < items.length - 1 && (
                  <div className={cn('w-0.5 flex-1 my-1 rounded-full', i < current ? 'bg-accent' : 'bg-border')} />
                )}
              </div>
              <div className={cn('pb-5 pt-1 min-w-0', i === items.length - 1 && 'pb-0')}>
                <p className={cn('text-sm font-semibold leading-tight',
                  st === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>{step.label}</p>
                {step.desc && <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{step.desc}</p>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('flex items-start w-full', className)}>
      {items.map((step, i) => {
        const st = stateOf(i)
        return (
          <Fragment key={i}>
            <div className="flex flex-col items-center gap-1.5 shrink-0 text-center" style={{ maxWidth: 110 }}>
              <div className={circle(st)}>{st === 'done' ? <Check size={15} strokeWidth={3} /> : i + 1}</div>
              {step.label && (
                <span className={cn('text-[11px] leading-tight px-0.5',
                  st === 'active' ? 'text-foreground font-semibold'
                  : st === 'done' ? 'text-foreground/70'
                  : 'text-muted-foreground')}>{step.label}</span>
              )}
            </div>
            {i < items.length - 1 && (
              <div className={cn('flex-1 h-0.5 mt-4 mx-1 sm:mx-2 rounded-full transition-colors',
                i < current ? 'bg-accent' : 'bg-border')} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
