'use client'
import { useApp } from '@/app/(app)/layout'
import { Sparkles, Film, Download, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import { useState, useEffect } from 'react'

const STAGES = {
  prompt:      { label: 'AI กำลังเขียน prompt…',   pct: 10,  icon: Sparkles },
  submit:      { label: 'ส่งให้ Veo สร้างวิดีโอ…',  pct: 20,  icon: Film },
  rendering:   { label: 'Veo กำลังเรนเดอร์',        pct: null, icon: Loader2 },
  downloading: { label: 'กำลังดาวน์โหลดคลิป…',     pct: 95,  icon: Download },
  done:        { label: 'เสร็จแล้ว ✓',              pct: 100, icon: CheckCircle2 },
  error:       { label: 'เกิดข้อผิดพลาด',           pct: 0,   icon: AlertCircle },
}

export function GenProgress() {
  const { state } = useApp()
  const gp = state.genProgress
  const [dismissed, setDismissed] = useState(null)

  // auto-clear "done" after a bit
  useEffect(() => {
    if (gp?.stage === 'done') {
      const t = setTimeout(() => setDismissed(gp.ts), 4000)
      return () => clearTimeout(t)
    }
  }, [gp?.stage, gp?.ts])

  if (!gp || dismissed === gp.ts) return null

  const s = STAGES[gp.stage] ?? STAGES.prompt
  const Icon = s.icon
  const isErr = gp.stage === 'error'
  const isDone = gp.stage === 'done'
  const spinning = gp.stage === 'rendering' || gp.stage === 'submit' || gp.stage === 'prompt'

  // rendering: estimate % from elapsed seconds (Veo ~ up to 240s)
  let pct = s.pct
  let detail = ''
  if (gp.stage === 'rendering') {
    const sec = parseInt(gp.detail) || 0
    pct = Math.min(20 + (sec / 240) * 70, 90)   // 20%→90% over ~4min
    detail = `${sec}s`
  }

  const accent = isErr ? '#f43f5e' : isDone ? '#10b981' : '#7c3aed'

  return (
    <div className="rounded-2xl border overflow-hidden"
         style={{ background: '#13131f', borderColor: isErr ? 'rgba(244,63,94,0.3)' : 'rgba(124,58,237,0.25)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="p-2 rounded-xl flex items-center justify-center"
             style={{ background: `${accent}1f` }}>
          <Icon size={16} style={{ color: accent }} className={spinning ? 'animate-spin' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-semibold">{s.label}</span>
            {detail && <span className="text-[11px] text-slate-500 tabular-nums">{detail}</span>}
          </div>
          {isErr
            ? <p className="text-rose-400 text-xs mt-0.5 leading-snug">{gp.error}</p>
            : <p className="text-slate-600 text-[11px] mt-0.5 truncate">{gp.detail || ''}</p>}
        </div>
        {(isErr || isDone) && (
          <button onClick={() => setDismissed(gp.ts)} className="text-slate-600 hover:text-white transition-colors">
            <X size={16} />
          </button>
        )}
      </div>
      {/* progress bar */}
      {!isErr && (
        <div className="h-1 bg-white/[0.05]">
          <div className="h-full transition-all duration-700 ease-out"
               style={{ width: `${pct ?? 50}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} />
        </div>
      )}
    </div>
  )
}
