'use client'
import { useState } from 'react'
import { useApp }   from '../layout'
import { api }      from '@/lib/api'
import { Select }    from '@/components/ui/Select'
import { PageHeader, JOB_STATUS } from '@/components/layout/PageHeader'
import {
  Play, Square, RefreshCw, Rocket, ListOrdered, CheckCircle2, XCircle,
  Loader2, Film, Send, FlaskConical, ShieldCheck, Zap, Clock
} from 'lucide-react'

const ICON = {
  pending: Clock, queued: Clock, generating: Film, generated: ListOrdered,
  posting: Send, retry: Loader2, done: CheckCircle2, posted: CheckCircle2, error: XCircle,
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
  const pending   = items.filter(i => ['pending', 'queued'].includes(i.status)).length
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
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8 max-w-[1000px]">
      <PageHeader
        title="ออโต้ไพลอต"
        subtitle="สั่งระบบสร้างวิดีโอและเผยแพร่ขึ้น Shopee อัตโนมัติ"
      />

      {/* Control card */}
      <div className="rounded-2xl border border-line bg-surface shadow-card overflow-hidden animate-fade-up">
        <div className="relative p-5 lg:p-6 flex flex-col gap-5">
          <div className="absolute -top-20 -right-12 w-56 h-56 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

          {/* Title row */}
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent-wash shrink-0">
              <Rocket size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-ink font-bold text-[15px]">ศูนย์ควบคุม</p>
              <p className="text-ink-dim text-xs">สร้างวิดีโอ → เผยแพร่ Shopee</p>
            </div>
            {running && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-accent bg-accent-wash border border-accent/20 px-3 py-1 rounded-full">
                <Loader2 size={11} className="animate-spin" /> ทำงานอยู่
              </span>
            )}
          </div>

          {/* Current item */}
          {current && running && (
            <div className="relative rounded-xl border border-accent/20 bg-accent-wash px-4 py-3">
              <p className="text-ink-mute text-[10px] font-bold uppercase tracking-widest mb-1">กำลังประมวลผล</p>
              <p className="text-ink text-sm font-medium truncate">{current.name}</p>
              <span className="text-accent text-[11px] font-semibold">
                {(JOB_STATUS[current.status] ?? JOB_STATUS.pending).label}
              </span>
            </div>
          )}

          {/* Device selector */}
          <div className="relative flex items-center gap-3">
            <label className="text-ink-dim text-sm w-16 shrink-0">มือถือ</label>
            <Select value={selSerial || connected[0]?.serial || ''} onChange={setSelSerial}
              className="flex-1"
              placeholder="ยังไม่มีเครื่องเชื่อมต่อ"
              options={connected.map(d => ({ value: d.serial, label: `${d.model} (${d.serial})` }))} />
            <button onClick={() => api.scan().then(r => patch({ devices: r.devices }))}
              className="p-2.5 rounded-lg text-ink-dim bg-elevated border border-line hover:border-accent hover:text-accent transition-all">
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Mini stats */}
          <div className="relative grid grid-cols-3 gap-3">
            {[
              { label: 'ในคิว',   val: pending },
              { label: 'สำเร็จ',  val: state.done },
              { label: 'ผิดพลาด', val: state.errors, danger: true },
            ].map(({ label, val, danger }) => (
              <div key={label} className="flex flex-col items-center py-3 rounded-xl bg-elevated border border-line">
                <span className={`text-2xl font-extrabold nums leading-none ${danger && val > 0 ? 'text-danger' : 'text-ink'}`}>{val}</span>
                <span className="text-[11px] text-ink-mute mt-1">{label}</span>
              </div>
            ))}
          </div>

          {/* Start / Stop */}
          {running ? (
            <button onClick={stop}
              className="relative flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white bg-danger hover:opacity-90 transition-all active:scale-[.98]">
              <Square size={14} className="fill-current" /> หยุดออโต้ไพลอต
            </button>
          ) : (
            <button onClick={start} disabled={connected.length === 0 || pending === 0}
              className="relative flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white bg-accent hover:bg-accent-soft glow-accent transition-all active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
              <Play size={14} className="fill-current" />
              {items.length === 0 ? 'ส่งสินค้าจาก Extension ก่อน' : `เริ่มออโต้ไพลอต (${pending} รายการ)`}
            </button>
          )}
        </div>
      </div>

      {/* Test posting */}
      <div className="rounded-2xl border border-line bg-surface shadow-card overflow-hidden animate-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-wash">
            <FlaskConical size={14} className="text-accent" />
          </div>
          <h3 className="text-ink font-semibold text-sm">ทดสอบขั้นตอนโพสต์</h3>
          <span className="ml-auto text-[10px] text-ink-mute">ใช้วิดีโอทดสอบ · ไม่กิน Flow credit</span>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setDryRun(true)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm transition-all
                ${dryRun ? 'border-accent/40 bg-accent-wash text-accent' : 'border-line bg-elevated text-ink-dim hover:text-ink'}`}>
              <ShieldCheck size={16} />
              <div className="text-left">
                <div className="font-semibold">ทดสอบ (Dry Run)</div>
                <div className="text-[10px] opacity-70">หยุดก่อนกดโพสต์</div>
              </div>
            </button>
            <button onClick={() => setDryRun(false)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm transition-all
                ${!dryRun ? 'border-danger/40 bg-danger/10 text-danger' : 'border-line bg-elevated text-ink-dim hover:text-ink'}`}>
              <Zap size={16} />
              <div className="text-left">
                <div className="font-semibold">โพสต์จริง</div>
                <div className="text-[10px] opacity-70">เผยแพร่ขึ้น Shopee</div>
              </div>
            </button>
          </div>

          <button onClick={testPost} disabled={connected.length === 0 || testing}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[.98] disabled:opacity-40
              ${!dryRun ? 'bg-danger text-white hover:opacity-90' : 'bg-elevated text-ink-dim border border-line hover:border-accent hover:text-accent'}`}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
            {testing ? 'กำลังทำงาน — ดูบันทึก' : dryRun ? 'รันทดสอบ' : 'รันโพสต์จริง'}
          </button>

          {!dryRun && (
            <p className="text-[11px] text-danger/90 text-center -mt-1">
              ⚠ จะเผยแพร่วิดีโอทดสอบขึ้น Shopee จริง
            </p>
          )}
        </div>
      </div>

      {/* Item list */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: '140ms' }}>
          {items.map((item, i) => {
            const s = JOB_STATUS[item.status] ?? JOB_STATUS.pending
            const Icon = ICON[item.status] ?? Clock
            return (
              <div key={item.pid ?? i}
                   className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-line shadow-card">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.cls}`}>
                  <Icon size={14} className={s.spin ? 'animate-spin' : ''} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm truncate">{item.name}</p>
                  <p className="text-ink-mute text-xs nums">
                    {item.price ? `฿${Number(item.price).toLocaleString()}` : ''}
                    {item.commission ? ` · ค่าคอม ${item.commission}%` : ''}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold shrink-0 ${s.cls.split(' ')[0]}`}>{s.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
