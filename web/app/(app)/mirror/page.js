'use client'
import { useApp }      from '../layout'
import { MirrorGrid }  from '@/components/mirror/MirrorGrid'
import { api }         from '@/lib/api'
import { Play, Square } from 'lucide-react'

export default function MirrorPage() {
  const { state } = useApp()
  const connected = state.devices.filter(d => d.status === 'device')
  const streaming = connected.filter(d => d.streaming).length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0 bg-surface">

        <button onClick={() => api.mirrorStartAll()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-1.5 rounded-xl bg-success hover:opacity-90 transition-all active:scale-[.98]">
          <Play size={11} className="fill-current" /> เปิดทั้งหมด
        </button>

        <button onClick={() => api.mirrorStopAll()}
          className="flex items-center gap-1.5 text-xs font-semibold text-danger px-3.5 py-1.5 rounded-xl bg-danger/10 hover:bg-danger/15 border border-danger/20 transition-all active:scale-[.98]">
          <Square size={11} className="fill-current" /> หยุดทั้งหมด
        </button>

        <div className="w-px h-4 bg-line mx-1" />

        <span className={`flex items-center gap-2 text-sm font-medium transition-colors
          ${streaming > 0 ? 'text-success' : 'text-ink-mute'}`}>
          {streaming > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
          )}
          <span className="nums">{streaming} / {connected.length}</span> กำลังสตรีม
        </span>

        <span className="ml-auto text-[11px] text-ink-mute">
          คลิกเครื่อง → จอเต็ม · สูงสุด 20 เครื่อง
        </span>
      </div>

      <div className="flex-1 overflow-hidden">
        <MirrorGrid devices={connected} />
      </div>
    </div>
  )
}
