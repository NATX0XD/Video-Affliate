'use client'
import { Label } from './label'
import { InfoTooltip } from './InfoTooltip'
import { cn } from '@/lib/utils'

/**
 * FormField — label + (ไอคอน ? อธิบาย) + ช่องกรอก + ข้อความ error/hint
 * ครอบ input/select ตัวใด ๆ ก็ได้ผ่าน children
 *
 * props:
 *   label, htmlFor, required
 *   info   — ข้อความอธิบายใน InfoTooltip (ศัพท์ยาก → คำง่าย)
 *   hint   — คำแนะนำใต้ช่อง (สีจาง) แสดงเมื่อไม่มี error
 *   error  — ข้อความ error (สีแดง) มาก่อน hint
 */
export function FormField({ label, htmlFor, info, hint, error, required, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
            {label}{required && <span className="text-accent ml-0.5">*</span>}
          </Label>
          {info && <InfoTooltip text={info} />}
        </div>
      )}
      {children}
      {error
        ? <p className="text-danger text-[11px] leading-snug">{error}</p>
        : hint ? <p className="text-muted-foreground text-[11px] leading-snug">{hint}</p> : null}
    </div>
  )
}
