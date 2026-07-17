'use client'
import { Button } from './Button'
import { InfoTooltip } from './InfoTooltip'
import { cn } from '@/lib/utils'

/**
 * GatedButton — ปุ่มการกระทำที่ต้องพร้อมก่อนจึงกดได้
 * (เช่น ต้องเชื่อมต่อโปรแกรมหลัก/มือถือก่อน)
 *
 * props:
 *   ready   — true = กดได้ / false = ปิดปุ่ม + บอกเหตุผล
 *   reason  — ข้อความเหตุผลตอนยังกดไม่ได้ (โชว์เป็น tooltip + title)
 *   ...rest — ส่งต่อให้ <Button> (variant/size/onClick/children ฯลฯ)
 */
export function GatedButton({ ready = true, reason = '', disabled, className, children, ...rest }) {
  const blocked = !ready
  const isDisabled = blocked || disabled

  const btn = (
    <Button
      {...rest}
      disabled={isDisabled}
      title={blocked ? reason : rest.title}
      className={className}
    >
      {children}
    </Button>
  )

  if (!blocked || !reason) return btn

  // ครอบด้วย span เพื่อให้ tooltip ทำงานได้แม้ปุ่มถูก disable (ปุ่ม disabled ไม่รับ hover event)
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      {btn}
      <InfoTooltip text={reason} label="เหตุผลที่ยังกดไม่ได้" />
    </span>
  )
}
