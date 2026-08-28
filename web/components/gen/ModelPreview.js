'use client'
// พรีวิว 3D ตัวละคร (.glb) หมุนดูได้ — exposes capture() คืน dataURL PNG จากมุมที่ผู้ใช้หมุนไว้
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Loader2 } from 'lucide-react'

// โหลด <model-viewer> แบบ lazy — กัน SSR/export พัง + โหลดเฉพาะตอนเปิดหน้าสร้างคลิป
let _mvLoading = null
function ensureModelViewer() {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.customElements?.get('model-viewer')) return Promise.resolve(true)
  if (!_mvLoading) _mvLoading = import('@google/model-viewer').then(() => true).catch(() => false)
  return _mvLoading
}

export const ModelPreview = forwardRef(function ModelPreview({ src, hue, onLoad }, ref) {
  const [ready, setReady] = useState(false)
  const mvRef = useRef(null)
  useEffect(() => { let alive = true; ensureModelViewer().then(ok => alive && setReady(ok)); return () => { alive = false } }, [])
  useEffect(() => {
    if (!ready) return
    const mv = mvRef.current
    if (!mv) return
    const h = () => onLoad?.()
    mv.addEventListener('load', h)
    return () => mv.removeEventListener('load', h)
  }, [ready, onLoad])
  useImperativeHandle(ref, () => ({
    capture() {
      const mv = mvRef.current
      if (!mv || typeof mv.toDataURL !== 'function') return null
      try { const d = mv.toDataURL('image/png'); return d && d.length > 200 ? d : null }
      catch { return null }
    },
  }), [])
  return (
    <div className="relative rounded-xl border border-line overflow-hidden h-56 sm:h-64 bg-elevated"
      style={{ backgroundImage: `radial-gradient(circle at 50% 40%, ${hue}22, transparent 70%)` }}>
      {ready ? (
        <model-viewer
          ref={mvRef}
          src={src}
          camera-controls=""
          auto-rotate=""
          auto-rotate-delay="0"
          rotation-per-second="24deg"
          interaction-prompt="none"
          disable-tap=""
          shadow-intensity="0.6"
          exposure="1.05"
          style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 size={22} className="animate-spin text-accent" />
        </div>
      )}
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 t-cap bg-ink/70 text-white px-2 py-0.5 rounded-full pointer-events-none">
        ลากหมุนดูได้
      </span>
    </div>
  )
})
