'use client'
import { useEffect, useRef } from 'react'
import { Terminal, Trash2 } from 'lucide-react'

export function SystemLog({ logs = [], onClear }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  return (
    <div className="flex flex-col overflow-hidden h-full rounded-2xl border border-white/[0.06]"
         style={{ background: '#0e0e1c' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/10">
            <Terminal size={13} className="text-violet-400" />
          </div>
          <span className="text-slate-300 text-sm font-semibold">System Log</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-slate-600 font-medium bg-white/[0.04] px-2 py-0.5 rounded-full">
              {logs.length}
            </span>
          )}
        </div>
        <button onClick={onClear}
          className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.04]">
          <Trash2 size={11} /> Clear
        </button>
      </div>

      {/* Log area */}
      <div ref={ref}
           className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1"
           style={{ background: '#070710' }}>
        {logs.length === 0
          ? <p className="text-slate-700 select-none">Waiting for events…</p>
          : logs.map((l, i) => (
              <div key={i} className="flex gap-3 group">
                <span className="text-slate-700 shrink-0 tabular-nums">{l.time}</span>
                <span className="text-emerald-400/90 break-all leading-relaxed group-hover:text-emerald-300 transition-colors">
                  {l.msg}
                </span>
              </div>
            ))
        }
      </div>
    </div>
  )
}
