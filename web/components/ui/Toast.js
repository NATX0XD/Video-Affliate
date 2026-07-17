'use client'
import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, WifiOff, X } from 'lucide-react'
import { setApiErrorHandler } from '@/lib/api'
import { MSG } from '@/lib/copy'
import { cn } from '@/lib/utils'

const ToastCtx = createContext(null)

/** ใช้เรียก toast จากที่ไหนก็ได้ (ต้องอยู่ใต้ <ToastProvider>) */
export function useToast() {
  return useContext(ToastCtx) ?? FALLBACK
}
// กันพังถ้าถูกเรียกนอก provider (เช่นระหว่าง prerender)
const FALLBACK = { push() {}, success() {}, error() {}, warning() {}, info() {}, dismiss() {} }

const TYPE = {
  success: { Icon: CheckCircle2, cls: 'text-success' },
  error:   { Icon: AlertCircle,  cls: 'text-danger' },
  warning: { Icon: AlertCircle,  cls: 'text-amber-500' },
  info:    { Icon: Info,         cls: 'text-accent' },
  offline: { Icon: WifiOff,      cls: 'text-danger' },
}

let _id = 0

/**
 * ToastProvider — ระบบแจ้งเตือนกลาง (ครอบทั้งแอปที่ app/layout.js)
 * - เด้ง toast แทน catch เงียบ: ผูกกับ error ของ web/lib/api.js อัตโนมัติ
 * - dedupe กันเด้งรัว ๆ (เช่น poll ทุก 5 วิ ตอน backend ล่ม)
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts]   = useState([])
  const [mounted, setMounted] = useState(false)
  const dedupe = useRef(new Map())   // signature -> ts ที่โชว์ล่าสุด
  const timers = useRef(new Map())   // id -> timeout

  useEffect(() => setMounted(true), [])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const tm = timers.current.get(id)
    if (tm) { clearTimeout(tm); timers.current.delete(id) }
  }, [])

  const push = useCallback((opts) => {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {})
    const { type = 'info', message = '', title, duration, dedupeKey, dedupeMs } = o
    if (!message && !title) return

    const sig = dedupeKey || `${type}:${message}`
    const now = Date.now()
    const win = dedupeMs ?? (type === 'error' || type === 'offline' ? 8000 : 3500)
    const last = dedupe.current.get(sig)
    if (last && now - last < win) return
    dedupe.current.set(sig, now)

    const id  = ++_id
    const ttl = duration ?? (type === 'error' || type === 'offline' ? 6000 : 4000)
    setToasts((list) => [...list.slice(-3), { id, type, message, title }])
    const tm = setTimeout(() => dismiss(id), ttl)
    timers.current.set(id, tm)
    return id
  }, [dismiss])

  const value = useMemo(() => ({
    push,
    dismiss,
    success: (m, o) => push({ ...(typeof o === 'object' ? o : {}), type: 'success', message: m }),
    error:   (m, o) => push({ ...(typeof o === 'object' ? o : {}), type: 'error',   message: m }),
    warning: (m, o) => push({ ...(typeof o === 'object' ? o : {}), type: 'warning', message: m }),
    info:    (m, o) => push({ ...(typeof o === 'object' ? o : {}), type: 'info',    message: m }),
  }), [push, dismiss])

  // ผูก error ของ api.js → toast (แทน catch เงียบทั่วแอป)
  useEffect(() => {
    setApiErrorHandler((info) => {
      if (info?.kind === 'network') {
        push({ type: 'offline', message: MSG.offline, dedupeKey: 'net-offline', dedupeMs: 15000 })
      } else {
        push({ type: 'error', message: MSG.apiError, dedupeKey: `http:${info?.status || 'x'}`, dedupeMs: 8000 })
      }
    })
    return () => setApiErrorHandler(null)
  }, [push])

  // เก็บกวาด timers ตอน unmount
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear() }, [])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-4 right-4 z-[130] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] pointer-events-none">
          {toasts.map((t) => {
            const meta = TYPE[t.type] || TYPE.info
            const { Icon } = meta
            return (
              <div
                key={t.id}
                role="status"
                className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-card shadow-lift px-3.5 py-3 animate-scale-in"
              >
                <Icon size={16} className={cn('shrink-0 mt-0.5', meta.cls)} />
                <div className="flex-1 min-w-0">
                  {t.title && <p className="text-foreground text-sm font-semibold leading-tight">{t.title}</p>}
                  <p className={cn('text-xs leading-snug break-words', t.title ? 'text-muted-foreground mt-0.5' : 'text-foreground')}>
                    {t.message}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="ปิด"
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}
