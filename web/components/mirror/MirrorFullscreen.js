'use client'
import { useRef, useCallback } from 'react'
import {
  ArrowLeft, Volume2, VolumeX, Home, RotateCcw,
  Grid2x2, ExternalLink
} from 'lucide-react'
import { api } from '@/lib/api'

export function MirrorFullscreen({ device, onBack }) {
  const imgRef  = useRef(null)
  const dragRef = useRef(null)

  const toPhone = useCallback((cx, cy) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: Math.round((cx - rect.left) / rect.width  * (device?.phoneW || 1080)),
      y: Math.round((cy - rect.top)  / rect.height * (device?.phoneH || 2340)),
    }
  }, [device?.phoneW, device?.phoneH])

  const onPointerDown = e => { dragRef.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp   = e => {
    if (!dragRef.current) return
    const dx = Math.abs(e.clientX - dragRef.current.x)
    const dy = Math.abs(e.clientY - dragRef.current.y)
    if (dx < 8 && dy < 8) {
      const p = toPhone(e.clientX, e.clientY)
      api.adbTap(device.serial, p.x, p.y)
    } else {
      const s = toPhone(dragRef.current.x, dragRef.current.y)
      const t = toPhone(e.clientX, e.clientY)
      api.adbSwipe(device.serial, s.x, s.y, t.x, t.y, 300)
    }
    dragRef.current = null
  }

  const key = code => api.adbKey(device.serial, code)

  if (!device) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-ink-mute text-sm">ไม่พบเครื่อง</p>
    </div>
  )

  const NAV_BTNS = [
    { label: 'ย้อนกลับ', icon: RotateCcw, fn: () => key('KEYCODE_BACK')      },
    { label: 'หน้าหลัก', icon: Home,      fn: () => key('KEYCODE_HOME')       },
    { label: 'แอปล่าสุด', icon: Grid2x2,  fn: () => key('KEYCODE_APP_SWITCH') },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0 bg-surface">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-dim hover:text-ink bg-elevated hover:bg-line border border-line px-3 py-1.5 rounded-lg transition-all">
          <ArrowLeft size={12} /> กริด
        </button>
        <span className="text-ink font-semibold text-sm">{device.model}</span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
          Live
        </span>
        <span className="ml-auto text-[11px] text-ink-mute">
          คลิก = แตะ · ลาก = ปัด · คลิกขวา = ย้อนกลับ
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Phone screen — MJPEG stream ใส่ใน <img src> */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden bg-base">
          <div className="relative h-full flex items-center justify-center">
            <div className="relative rounded-[2rem] overflow-hidden border-[3px] border-line h-full bg-black"
                 style={{
                   aspectRatio: '9/19.5',
                   boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 80px rgba(255,92,43,0.08)',
                 }}>
              <img
                ref={imgRef}
                src={api.streamUrl(device.serial)}
                alt="screen"
                className="w-full h-full block select-none"
                style={{ objectFit: 'fill', cursor: 'crosshair' }}
                draggable={false}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onContextMenu={e => { e.preventDefault(); key('KEYCODE_BACK') }}
              />
            </div>
          </div>
        </div>

        {/* Controls panel */}
        <div className="w-52 shrink-0 border-l border-line flex flex-col gap-5 p-4 overflow-y-auto bg-surface">

          <div>
            <p className="text-ink-mute text-[10px] font-bold uppercase tracking-widest mb-2.5">นำทาง</p>
            <div className="flex flex-col gap-1.5">
              {NAV_BTNS.map(({ label, icon: Icon, fn }) => (
                <button key={label} onClick={fn}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-ink-dim text-xs font-medium bg-elevated hover:bg-line hover:text-ink border border-line transition-all">
                  <Icon size={12} strokeWidth={2} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-ink-mute text-[10px] font-bold uppercase tracking-widest mb-2.5">เสียง</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { icon: Volume2, label: 'เพิ่ม', code: 'KEYCODE_VOLUME_UP'   },
                { icon: VolumeX, label: 'ลด',   code: 'KEYCODE_VOLUME_DOWN' },
              ].map(({ icon: Icon, label, code }) => (
                <button key={label} onClick={() => key(code)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-ink-dim text-xs font-medium bg-elevated hover:bg-line hover:text-ink border border-line transition-all">
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <button onClick={() => api.openShopee(device.serial)}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/15 border border-accent/20 transition-all">
              <ExternalLink size={11} /> เปิด Shopee
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
