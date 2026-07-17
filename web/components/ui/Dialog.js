'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }

/**
 * Dialog / Modal — โมดอลกลาง ใช้สไตล์เดียวกับโมดอลเดิมในแอป
 * (overlay เบลอ + การ์ด rounded-2xl + ปิดด้วย Esc / คลิกนอก / ปุ่ม X + ล็อกสกรอลล์)
 *
 * props:
 *   open, onClose            — คุมการเปิด/ปิด
 *   title, description, icon — หัวโมดอล (ไอคอน = lucide component)
 *   footer                   — แถบปุ่มด้านล่าง (node)
 *   size: sm|md|lg|xl        — ความกว้าง (ค่าเริ่ม md)
 *   closeOnOverlay           — คลิกพื้นหลังเพื่อปิด (ค่าเริ่ม true)
 */
export function Dialog({
  open, onClose, title, description, icon: Icon,
  children, footer, size = 'md', closeOnOverlay = true, className,
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-6 animate-fade-in"
      onClick={() => closeOnOverlay && onClose?.()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'w-full rounded-2xl border border-border bg-card shadow-lift animate-scale-in flex flex-col max-h-[90vh]',
          SIZES[size] || SIZES.md,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || Icon) && (
          <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-border shrink-0">
            {Icon && (
              <div className="w-9 h-9 rounded-xl bg-accent-wash flex items-center justify-center shrink-0">
                <Icon size={17} className="text-accent" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {title && <h3 className="text-foreground font-bold text-base leading-tight">{title}</h3>}
              {description && <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="ปิด"
              className="p-1.5 -mr-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="px-5 sm:px-6 py-5 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
