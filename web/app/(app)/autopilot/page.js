'use client'
import { useState } from 'react'
import { useApp }   from '../layout'
import { api }      from '@/lib/api'
import {
  Play, Square, RefreshCw, Rocket,
  ListOrdered, CheckCircle2, XCircle,
  Loader2, Film, Send, FlaskConical, ShieldCheck, Zap
} from 'lucide-react'

const STEP_ICON = {
  pending:    { icon: ListOrdered,  color: 'text-slate-500',   label: 'รอ'          },
  generating: { icon: Film,         color: 'text-sky-400',     label: 'สร้างวิดีโอ' },
  posting:    { icon: Send,         color: 'text-amber-400',   label: 'กำลังโพสต์'  },
  done:       { icon: CheckCircle2, color: 'text-emerald-400', label: 'สำเร็จ'      },
  error:      { icon: XCircle,      color: 'text-rose-400',    label: 'ผิดพลาด'     },
}

export default function AutoPilotPage() {
  const { state, patch } = useApp()
  const [selSerial, setSelSerial] = useState('')
  const [testing, setTesting]     = useState(false)
  const [dryRun, setDryRun]       = useState(true)

  const connected = state.devices.filter(d => d.status === 'device')
  const running   = state.pilot_running
  const items     = state.queueItems ?? []
  const current   = state.currentItem
  const pending   = items.filter(i => i.status === 'pending').length
  const serial    = () => selSerial || connected[0]?.serial || ''

  const start = async () => { await api.pilotStart(serial()); patch({ pilot_running: true }) }
  const stop  = async () => { await api.pilotStop();          patch({ pilot_running: false }) }

  const testPost = async () => {
    if (!serial()) return
    setTesting(true)
    try { await api.testPost(serial(), dryRun) } catch {}
    setTimeout(() => setTesting(false), 3000)
  }

  return (
    <div className="flex flex-col gap-4 p-6">

      {/* ── Control card ── */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: '#111120' }}>

        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.05]">
          <div className="p-2 rounded-xl" style={{ background: 'rgba(124,58,237,0.15)', boxShadow: '0 0 20px rgba(124,58,237,0.15)' }}>
            <Rocket size={16} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-sm">Auto Pilot</h2>
            <p className="text-slate-600 text-[11px]">สร้างวิดีโอ AI → โพสต์ Shopee อัตโนมัติ</p>
          </div>
          {running && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              <Loader2 size={10} className="animate-spin" /> Running
            </span>
          )}
        </div>

        <div className="p-5 flex flex-col gap-5">

          {/* Current item */}
          {current && running && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">กำลังประมวลผล</p>
              <p className="text-white text-sm font-medium truncate">{current.name}</p>
              {(() => {
                const s = STEP_ICON[current.status] ?? STEP_ICON.pending
                const spin = current.status === 'generating' || current.status === 'posting'
                return (
                  <span className={`flex items-center gap-1 text-[11px] font-semibold mt-1.5 ${s.color}`}>
                    <s.icon size={11} className={spin ? 'animate-spin' : ''} /> {s.label}
                  </span>
                )
              })()}
            </div>
          )}

          {/* Device selector */}
          <div className="flex items-center gap-3">
            <label className="text-slate-500 text-sm w-16 shrink-0">Device</label>
            <select value={selSerial} onChange={e => setSelSerial(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 rounded-xl outline-none focus:border-violet-500/60 appearance-none transition-colors">
              {connected.length === 0
                ? <option value="" style={{ background: '#1a1a2e' }}>No devices connected</option>
                : connected.map(d => (
                    <option key={d.serial} value={d.serial} style={{ background: '#1a1a2e' }}>
                      {d.model} ({d.serial})
                    </option>
                  ))}
            </select>
            <button onClick={() => api.scan().then(r => patch({ devices: r.devices }))}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all">
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: ListOrdered,  label: 'Queue',   val: pending,       color: 'text-amber-400   bg-amber-500/8   border-amber-500/15'  },
              { icon: CheckCircle2, label: 'สำเร็จ',  val: state.done,    color: 'text-emerald-400 bg-emerald-500/8 border-emerald-500/15' },
              { icon: XCircle,      label: 'ผิดพลาด', val: state.errors,  color: 'text-rose-400    bg-rose-500/8    border-rose-500/15'    },
            ].map(({ icon: Icon, label, val, color }) => (
              <div key={label} className={`flex flex-col items-center py-3 rounded-xl border ${color}`}>
                <Icon size={14} className="mb-1 opacity-70" />
                <span className="text-2xl font-black tabular-nums leading-none">{val}</span>
                <span className="text-[10px] opacity-60 mt-0.5 font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Start / Stop */}
          {running ? (
            <button onClick={stop}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(244,63,94,0.2)', border: '1px solid rgba(244,63,94,0.3)' }}>
              <Square size={13} className="fill-current text-rose-400" />
              <span className="text-rose-400">Stop Auto Pilot</span>
            </button>
          ) : (
            <button onClick={start} disabled={connected.length === 0 || pending === 0}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: connected.length > 0 ? '0 4px 20px rgba(124,58,237,0.35)' : 'none' }}>
              <Play size={14} className="fill-current" />
              {items.length === 0 ? 'ส่งสินค้าจาก Extension ก่อน' : `Start Auto Pilot (${pending} รายการ)`}
            </button>
          )}
        </div>
      </div>

      {/* ── Test posting flow ── */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: '#111120' }}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.05]">
          <div className="p-1.5 rounded-lg bg-sky-500/10">
            <FlaskConical size={13} className="text-sky-400" />
          </div>
          <h3 className="text-white font-semibold text-sm">ทดสอบ flow โพสต์</h3>
          <span className="ml-auto text-[10px] text-slate-600">ใช้วิดีโอ test · ไม่กิน Veo credits</span>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Dry-run / Real toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDryRun(true)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                ${dryRun ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                         : 'border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-300'}`}>
              <ShieldCheck size={15} />
              <div className="text-left">
                <div className="font-semibold">Dry Run</div>
                <div className="text-[10px] opacity-70">หยุดก่อนกดโพสต์</div>
              </div>
            </button>
            <button onClick={() => setDryRun(false)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                ${!dryRun ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                          : 'border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-300'}`}>
              <Zap size={15} />
              <div className="text-left">
                <div className="font-semibold">โพสต์จริง</div>
                <div className="text-[10px] opacity-70">เผยแพร่ขึ้น Shopee</div>
              </div>
            </button>
          </div>

          <button onClick={testPost} disabled={connected.length === 0 || testing}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={!dryRun
              ? { background: 'linear-gradient(135deg,#e11d48,#be123c)', color: '#fff', boxShadow: '0 4px 14px rgba(225,29,72,0.3)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)' }}>
            {testing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
            {testing
              ? 'กำลังทำงาน — ดู System Log'
              : dryRun ? 'รันทดสอบ (Dry Run)' : 'รันโพสต์จริง'}
          </button>

          {!dryRun && (
            <p className="text-[11px] text-rose-400/80 text-center -mt-1">
              ⚠ จะเผยแพร่วิดีโอ test ขึ้น Shopee จริง
            </p>
          )}
        </div>
      </div>

      {/* ── Item list ── */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => {
            const s = STEP_ICON[item.status] ?? STEP_ICON.pending
            const Icon = s.icon
            const spinning = item.status === 'generating' || item.status === 'posting'
            return (
              <div key={item.pid ?? i}
                   className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                     ${item.status === 'done' ? 'border-emerald-500/15' :
                       item.status === 'error' ? 'border-rose-500/15' :
                       spinning ? 'border-violet-500/20' : 'border-white/[0.05]'}`}
                   style={{ background: '#111120' }}>
                <Icon size={14} className={`${s.color} shrink-0 ${spinning ? 'animate-spin' : ''}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{item.name}</p>
                  <p className="text-slate-600 text-xs tabular-nums">
                    {item.price ? `฿${Number(item.price).toLocaleString()}` : ''}
                    {item.commission ? ` · ${item.commission}% commission` : ''}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold shrink-0 ${s.color}`}>{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
