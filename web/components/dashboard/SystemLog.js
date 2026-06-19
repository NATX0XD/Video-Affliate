'use client'
import { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2, ArrowDown } from 'lucide-react'

const MAX_ROWS = 150   // render สูงสุดแค่นี้ — DOM ไม่บวม

const LEVEL = {
  error:   'text-danger',
  success: 'text-success',
  warn:    'text-amber-400',
  info:    'text-muted-foreground',
}

export function SystemLog({ logs = [], onClear }) {
  const ref    = useRef(null)
  const pinned = useRef(true)       // true = ติดด้านล่าง
  const [showJump, setShowJump] = useState(false)

  // auto-scroll เฉพาะตอน pinned — deps: length เท่านั้น ไม่ตาม reference
  useEffect(() => {
    if (pinned.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [logs.length])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    pinned.current = atBottom
    setShowJump(!atBottom)
  }

  const jumpDown = () => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
    pinned.current = true
    setShowJump(false)
  }

  const visible = logs.slice(-MAX_ROWS)

  return (
    <div className="relative flex flex-col overflow-hidden h-full rounded-xl border border-border bg-card shadow-card">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-wash">
            <Terminal size={14} className="text-accent" />
          </div>
          <span className="text-foreground text-sm font-semibold">บันทึกการทำงาน</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-medium bg-secondary px-2 py-0.5 rounded-full nums">
              {logs.length}
            </span>
          )}
        </div>
        <button onClick={onClear}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary">
          <Trash2 size={11} /> ล้าง
        </button>
      </div>

      {/* Log body */}
      <div ref={ref} onScroll={onScroll}
           className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-black/20">
        {visible.length === 0
          ? <p className="text-muted-foreground/50 select-none">รอเหตุการณ์…</p>
          : visible.map((l, i) => (
              <div key={i} className="flex gap-3 leading-relaxed">
                <span className="text-muted-foreground/50 shrink-0 nums">{l.time}</span>
                <span className={`break-all ${LEVEL[l.level] || 'text-muted-foreground'}`}>{l.msg}</span>
              </div>
            ))
        }
      </div>

      {/* Jump-to-bottom pill — โผล่เมื่อ user เลื่อนขึ้น */}
      {showJump && (
        <button onClick={jumpDown}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] font-semibold bg-accent text-white px-3 py-1.5 rounded-full shadow-lg hover:bg-accent-soft transition-all">
          <ArrowDown size={11} /> ล่าสุด
        </button>
      )}
    </div>
  )
}
