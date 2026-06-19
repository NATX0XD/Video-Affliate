'use client'
import { useRef, useState, useEffect } from 'react'

/**
 * วิดีโอแบบ lazy — โหลด/ฝัง <video> เฉพาะตอนเลื่อนใกล้จอ (IntersectionObserver)
 * ช่วยให้กริดที่มีคลิปเยอะ ๆ ไม่โหลด metadata พร้อมกันทีเดียวจนกระตุก
 *
 * props:
 *   src            ที่อยู่วิดีโอ
 *   className      คลาสกรอบ (ขนาด/มุม) — ควรกำหนดขนาดให้ observer จับได้
 *   videoClassName คลาสของ <video> (object-fit ฯลฯ)
 */
export function LazyVideo({ src, className = '', videoClassName = 'w-full h-full object-cover', ...rest }) {
  const ref = useRef(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || show) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShow(true); io.disconnect() }
    }, { rootMargin: '300px' })   // โหลดล่วงหน้าก่อนถึงจอ ~300px
    io.observe(el)
    return () => io.disconnect()
  }, [show])

  return (
    <div ref={ref} className={className}>
      {show && (
        <video src={src} muted playsInline preload="metadata" className={videoClassName} {...rest} />
      )}
    </div>
  )
}
