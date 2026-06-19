'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// options: ['a','b'] หรือ [{value,label}]
export function Select({ value, onChange, options = [], placeholder = 'เลือก…', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h   = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', esc) }
  }, [open])

  const opts = options.map(o => (typeof o === 'string' || typeof o === 'number') ? { value: o, label: String(o) } : o)
  const cur  = opts.find(o => String(o.value) === String(value))

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-secondary border text-foreground text-sm px-3.5 py-2.5 rounded-lg outline-none transition-all
          ${open ? 'border-accent ring-2 ring-accent/20' : 'border-border hover:border-accent/50'}`}>
        <span className={cur ? 'text-foreground truncate' : 'text-muted-foreground'}>{cur ? cur.label : placeholder}</span>
        <ChevronDown size={15} className={`text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1.5 w-full rounded-xl border border-border bg-card shadow-lift p-1.5 max-h-64 overflow-auto animate-scale-in origin-top">
          {opts.map(o => {
            const sel = String(o.value) === String(value)
            return (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors
                  ${sel ? 'bg-accent-wash text-accent font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                <span className="truncate">{o.label}</span>
                {sel && <Check size={14} className="text-accent shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
