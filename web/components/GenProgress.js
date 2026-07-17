'use client'
import { useApp } from '@/app/(app)/layout'
import { Sparkles, Film, Loader2, Download, CheckCircle2, AlertCircle, Check, X, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

// ลำดับขั้นการสร้างคลิป — ตรงกับ stage มาตรฐานที่ extension/desktop ยิงมา
const STEPS = [
  { key: 'prompt',      label: 'AI เขียนสคริปต์วิดีโอ',  icon: Sparkles },
  { key: 'submit',      label: 'ส่งให้ Veo สร้างวิดีโอ',  icon: Film },
  { key: 'rendering',   label: 'Veo กำลังเรนเดอร์คลิป',   icon: Loader2 },
  { key: 'downloading', label: 'ดาวน์โหลดคลิป',          icon: Download },
  { key: 'done',        label: 'เสร็จแล้ว',              icon: CheckCircle2 },
]
const ORDER = STEPS.map(s => s.key)

export function GenProgress() {
  const { state } = useApp()
  const gp = state.genProgress
  const [dismissed, setDismissed] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const reachedRef = useRef(0)   // ดัชนีขั้นที่ไปถึงไกลสุด — กัน error ทำ checklist ถอยหลัง

  // อัปเดต "ขั้นที่ไปถึงไกลสุด" + รีเซ็ตเมื่อเริ่มงานใหม่ (stage กลับมา prompt)
  useEffect(() => {
    if (!gp) return
    if (gp.stage === 'prompt') { reachedRef.current = 0; return }
    if (gp.stage !== 'error') {
      const i = ORDER.indexOf(gp.stage)
      if (i > reachedRef.current) reachedRef.current = i
    }
  }, [gp?.stage, gp?.ts])

  // งานเสร็จ → เก็บ widget เองหลังโชว์สักครู่
  useEffect(() => {
    if (gp?.stage === 'done') {
      const t = setTimeout(() => setDismissed(gp.ts), 5000)
      return () => clearTimeout(t)
    }
  }, [gp?.stage, gp?.ts])

  if (!gp || dismissed === gp.ts) return null

  const isErr  = gp.stage === 'error'
  const isDone = gp.stage === 'done'
  const curIdx = isErr ? reachedRef.current : Math.max(0, ORDER.indexOf(gp.stage))

  // rendering: วินาทีที่ผ่านไป → % (Veo ~ up to 240s) เหมือน logic เดิม
  const renderSec = gp.stage === 'rendering' ? (parseInt(gp.detail) || 0) : 0
  const renderPct = Math.min(20 + (renderSec / 240) * 70, 90)

  const accent = isErr ? '#f43f5e' : isDone ? '#10b981' : '#7c3aed'
  const rawDetail = isErr ? (gp.error || gp.detail || '') : (gp.detail || '')

  return (
    <div className="rounded-2xl border overflow-hidden"
         style={{ background: '#13131f', borderColor: isErr ? 'rgba(244,63,94,0.3)' : 'rgba(124,58,237,0.25)' }}>
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <span className="text-white text-sm font-semibold flex-1">
          {isErr ? 'สร้างคลิปไม่สำเร็จ' : isDone ? 'สร้างคลิปเสร็จแล้ว' : 'กำลังสร้างคลิป…'}
        </span>
        {(isErr || isDone) && (
          <button onClick={() => setDismissed(gp.ts)}
                  className="text-slate-600 hover:text-white transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* vertical step checklist */}
      <div className="px-4 pb-2 flex flex-col">
        {STEPS.map((step, i) => {
          const done    = isDone || i < curIdx
          const active  = !isDone && !isErr && i === curIdx
          const errored = isErr && i === curIdx
          const Icon    = errored ? AlertCircle : done ? Check : step.icon
          const spin    = active && (step.key === 'rendering' || step.key === 'submit' || step.key === 'prompt')

          const dotColor = errored ? '#f43f5e' : done ? '#10b981' : active ? '#7c3aed' : 'rgba(255,255,255,0.14)'
          const txtColor = errored ? 'text-rose-400'
                         : done    ? 'text-slate-300'
                         : active  ? 'text-white font-medium'
                         : 'text-slate-600'

          return (
            <div key={step.key} className="flex items-stretch gap-3">
              {/* rail + dot */}
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                     style={{ background: `${dotColor}${done || active || errored ? '26' : ''}`,
                              border: `1.5px solid ${dotColor}` }}>
                  <Icon size={13} style={{ color: dotColor }} className={spin ? 'animate-spin' : ''} />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-px flex-1 my-0.5"
                       style={{ background: i < curIdx || isDone ? '#10b981' : 'rgba(255,255,255,0.10)' }} />
                )}
              </div>
              {/* label */}
              <div className="flex items-center gap-2 py-1 min-w-0">
                <span className={`text-[13px] leading-tight ${txtColor}`}>{step.label}</span>
                {active && step.key === 'rendering' && (
                  <span className="text-[11px] text-slate-500 tabular-nums">{renderSec}s · {Math.round(renderPct)}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* progress bar (ซ่อนตอน error) */}
      {!isErr && (
        <div className="h-1 bg-white/[0.05]">
          <div className="h-full transition-all duration-700 ease-out"
               style={{
                 width: `${isDone ? 100 : gp.stage === 'rendering' ? renderPct
                          : [10, 20, 20, 95][curIdx] ?? 50}%`,
                 background: `linear-gradient(90deg, ${accent}, ${accent}aa)`,
               }} />
        </div>
      )}

      {/* accordion: log ดิบ / รายละเอียด */}
      {rawDetail && (
        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button onClick={() => setShowDetail(v => !v)}
                  className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
            <ChevronDown size={13} className={`transition-transform ${showDetail ? 'rotate-180' : ''}`} />
            รายละเอียด
          </button>
          {showDetail && (
            <p className={`px-4 pb-3 text-[11px] leading-relaxed break-words ${isErr ? 'text-rose-400' : 'text-slate-500'}`}>
              {rawDetail}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
