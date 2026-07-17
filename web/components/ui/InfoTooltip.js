'use client'
import { useState, useRef, useId, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * InfoTooltip — ไอคอน "?" + คำอธิบายสั้น 1 บรรทัด
 * โชว์เมื่อ hover / focus / แตะ (มือถือ) · เรนเดอร์ผ่าน portal กันโดน overflow ตัด
 *
 * props: text (จำเป็น), label (aria), side: top|bottom|left|right, size, className
 */
export function InfoTooltip({ text, label = 'คำอธิบาย', side = 'top', size = 13, className }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef(null)
  const id = useId()

  useEffect(() => setMounted(true), [])

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 8
    let top, left
    if (side === 'bottom')      { top = r.bottom + gap;        left = r.left + r.width / 2 }
    else if (side === 'left')   { top = r.top + r.height / 2;  left = r.left - gap }
    else if (side === 'right')  { top = r.top + r.height / 2;  left = r.right + gap }
    else                        { top = r.top - gap;           left = r.left + r.width / 2 }
    setPos({ top, left })
  }, [side])

  const show = useCallback(() => { place(); setOpen(true) }, [place])
  const hide = useCallback(() => setOpen(false), [])

  // ปิดเมื่อเลื่อนจอ/ปรับขนาด (กัน tooltip ค้างผิดตำแหน่ง)
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open, hide])

  if (!text) return null

  const transform = side === 'bottom' ? 'translate(-50%, 0)'
    : side === 'left'  ? 'translate(-100%, -50%)'
    : side === 'right' ? 'translate(0, -50%)'
    : 'translate(-50%, -100%)'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? hide() : show() }}
        className={cn(
          'inline-flex items-center justify-center align-middle cursor-help shrink-0',
          'text-muted-foreground/70 hover:text-accent focus-visible:text-accent transition-colors outline-none',
          className,
        )}
      >
        <HelpCircle size={size} />
      </button>

      {mounted && open && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform, zIndex: 130, maxWidth: 260 }}
          className="pointer-events-none rounded-lg border border-border bg-popover text-popover-foreground text-[11px] leading-relaxed px-2.5 py-1.5 shadow-lift animate-fade-in"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
