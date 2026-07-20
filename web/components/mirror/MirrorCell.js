'use client'
import { useState, useEffect } from 'react'
import { Play, Square, Maximize2, Smartphone } from 'lucide-react'
import { api } from '@/lib/api'

const BASE    = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3001')
const CELL_MS = 1000  // 1 fps for grid thumbnails

export function MirrorCell({ idx, device, onFullscreen }) {
  const streaming = device?.streaming
  const connected = !!device
  const [ts, setTs] = useState(0)

  // Low-rate thumbnail polling for grid view
  useEffect(() => {
    if (!streaming) { setTs(0); return }
    const id = setInterval(() => setTs(Date.now()), CELL_MS)
    return () => { clearInterval(id); setTs(0) }
  }, [device?.serial, streaming])

  const toggle = async e => {
    e.stopPropagation()
    if (!device) return
    streaming ? await api.mirrorStop(device.serial) : await api.mirrorStart(device.serial)
  }

  const thumbSrc = streaming && ts > 0
    ? `${BASE}/snapshot/${device.serial}?_=${ts}`
    : null

  return (
    <div
      onClick={() => connected && onFullscreen(device?.serial)}
      className={`group lift animate-fade-up relative flex flex-col rounded-2xl overflow-hidden border bg-surface shadow-card
        ${connected ? 'cursor-pointer' : ''}
        ${streaming ? 'border-success/50' : connected ? 'border-accent/40' : 'border-line'}`}
      style={{
        animationDelay: `${Math.min(idx, 16) * 30}ms`,
        ...(streaming ? { boxShadow: '0 0 0 1px rgba(34,197,94,0.35), 0 8px 22px -8px rgba(34,197,94,0.4)' } : {}),
      }}
    >
      {/* Thumbnail */}
      <div className="aspect-[9/16] relative bg-black flex items-center justify-center overflow-hidden">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={device?.model}
            className="w-full h-full"
            style={{ objectFit: 'fill', display: 'block' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 select-none p-2">
            <Smartphone size={20}
              className={connected ? 'text-accent/40' : 'text-ink-mute/30'}
              strokeWidth={1.5} />
            <span className="text-[9px] font-bold text-ink-mute tracking-wider uppercase">
              {connected ? 'พร้อม' : String(idx + 1).padStart(2, '0')}
            </span>
          </div>
        )}

        {/* Live badge */}
        {streaming && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5">
            <span className="w-1 h-1 rounded-full bg-success animate-pulse-dot" />
            <span className="text-[8px] text-success font-black tracking-wider">LIVE</span>
          </div>
        )}

        {/* Fullscreen hint */}
        {connected && (
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm rounded-lg p-1">
            <Maximize2 size={9} className="text-white/60" />
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className={`text-xs truncate font-medium ${connected ? 'text-ink' : 'text-ink-mute'}`}>
          {device?.label || device?.model || `ช่อง ${String(idx + 1).padStart(2, '0')}`}
        </span>
        {connected && (
          <button onClick={toggle}
            className={`flex items-center justify-center w-6 h-6 rounded-lg shrink-0 transition-all
              ${streaming
                ? 'bg-danger/15 text-danger hover:bg-danger/25'
                : 'bg-accent/15 text-accent hover:bg-accent/25'}`}>
            {streaming
              ? <Square size={9} className="fill-current" />
              : <Play   size={9} className="fill-current" />}
          </button>
        )}
      </div>
    </div>
  )
}
