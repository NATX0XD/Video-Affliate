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
      <p className="text-slate-500 text-sm">Device not found</p>
    </div>
  )

  const NAV_BTNS = [
    { label: 'Back',    icon: RotateCcw, fn: () => key('KEYCODE_BACK')      },
    { label: 'Home',    icon: Home,      fn: () => key('KEYCODE_HOME')       },
    { label: 'Recents', icon: Grid2x2,   fn: () => key('KEYCODE_APP_SWITCH') },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.05] shrink-0"
           style={{ background: '#0a0a16' }}>
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] px-3 py-1.5 rounded-lg transition-all">
          <ArrowLeft size={12} /> Grid
        </button>
        <span className="text-white font-semibold text-sm">{device.model}</span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          Live
        </span>
        <span className="ml-auto text-[11px] text-slate-700">
          Click = Tap · Drag = Swipe · Right-click = Back
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Phone screen — MJPEG stream直接ใส่ใน <img src> */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden"
             style={{ background: '#060610' }}>
          <div className="relative h-full flex items-center justify-center">
            <div className="relative rounded-[2rem] overflow-hidden border-[3px] h-full bg-black"
                 style={{
                   aspectRatio: '9/19.5',
                   borderColor: 'rgba(255,255,255,0.08)',
                   boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 80px rgba(124,58,237,0.06)',
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
        <div className="w-52 shrink-0 border-l border-white/[0.05] flex flex-col gap-5 p-4 overflow-y-auto"
             style={{ background: '#0a0a16' }}>

          <div>
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mb-2.5">Navigation</p>
            <div className="flex flex-col gap-1.5">
              {NAV_BTNS.map(({ label, icon: Icon, fn }) => (
                <button key={label} onClick={fn}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-400 text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border border-white/[0.05] transition-all">
                  <Icon size={12} strokeWidth={2} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mb-2.5">Volume</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { icon: Volume2, label: 'Up',   code: 'KEYCODE_VOLUME_UP'   },
                { icon: VolumeX, label: 'Down', code: 'KEYCODE_VOLUME_DOWN' },
              ].map(({ icon: Icon, label, code }) => (
                <button key={label} onClick={() => key(code)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-slate-400 text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border border-white/[0.05] transition-all">
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <button onClick={() => api.openShopee(device.serial)}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-semibold text-violet-400 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 transition-all">
              <ExternalLink size={11} /> Open Shopee
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
