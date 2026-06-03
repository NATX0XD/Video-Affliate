'use client'
import { useEffect, useRef } from 'react'
import { Terminal, Trash2 } from 'lucide-react'

const LEVEL_COLOR = {
  error:   'text-danger',
  success: 'text-success',
  warn:    'text-warning',
  info:    'text-ink-dim',
}

export function SystemLog({ logs = [], onClear }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  return (
    <div className="flex flex-col overflow-hidden h-full rounded-xl border border-line bg-surface shadow-card">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-wash">
            <Terminal size={14} className="text-accent" />
          </div>
          <span className="text-ink text-sm font-semibold">บันทึกการทำงาน</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-ink-mute font-medium bg-elevated px-2 py-0.5 rounded-full nums">
              {logs.length}
            </span>
          )}
        </div>
        <button onClick={onClear}
          className="flex items-center gap-1.5 text-[11px] text-ink-mute hover:text-ink-dim transition-colors px-2 py-1 rounded-lg hover:bg-elevated">
          <Trash2 size={11} /> ล้าง
        </button>
      </div>

      {/* Log area */}
      <div ref={ref}
           className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-base">
        {logs.length === 0
          ? <p className="text-ink-mute select-none">รอเหตุการณ์…</p>
          : logs.map((l, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-ink-mute shrink-0 nums">{l.time}</span>
                <span className={`break-all leading-relaxed ${LEVEL_COLOR[l.level] || 'text-ink-dim'}`}>
                  {l.msg}
                </span>
              </div>
            ))
        }
      </div>
    </div>
  )
}
