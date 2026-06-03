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
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.05] shrink-0"
           style={{ background: '#0a0a16' }}>

        <button onClick={() => api.mirrorStartAll()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-1.5 rounded-xl transition-all"
          style={{ background: 'linear-gradient(135deg,#059669,#047857)', boxShadow: '0 4px 12px rgba(5,150,105,0.25)' }}>
          <Play size={11} className="fill-current" /> Start All
        </button>

        <button onClick={() => api.mirrorStopAll()}
          className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 transition-all">
          <Square size={11} className="fill-current" /> Stop All
        </button>

        <div className="w-px h-4 bg-white/[0.08] mx-1" />

        <span className={`flex items-center gap-2 text-sm font-medium transition-colors
          ${streaming > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
          {streaming > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          )}
          {streaming} / {connected.length} streaming
        </span>

        <span className="ml-auto text-[11px] text-slate-700">
          Click cell → Fullscreen · Max 20 devices
        </span>
      </div>

      <div className="flex-1 overflow-hidden">
        <MirrorGrid devices={connected} />
      </div>
    </div>
  )
}
