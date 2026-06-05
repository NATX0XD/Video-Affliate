'use client'
import { useApp }    from '../layout'
import { StatCard }  from '@/components/dashboard/StatCard'
import { SystemLog } from '@/components/dashboard/SystemLog'
import { api }       from '@/lib/api'
import {
  Smartphone, ListOrdered, CheckCircle2, XCircle, Wallet,
  Rocket, Play, Square, Search, Clapperboard, Send, ChevronRight,
  Sparkles, AlertTriangle
} from 'lucide-react'

const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n || 0))
const baht  = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

// ขั้นตอนของไปป์ไลน์ (ตรงกับสถานะใน DB)
const PIPELINE = [
  { key: 'queued',     label: 'รอคิว',      icon: ListOrdered },
  { key: 'generating', label: 'กำลังสร้าง', icon: Clapperboard },
  { key: 'generated',  label: 'รอเผยแพร่',  icon: Search },
  { key: 'posting',    label: 'กำลังโพสต์', icon: Send },
  { key: 'posted',     label: 'เผยแพร่แล้ว', icon: CheckCircle2 },
]

export default function DashboardPage() {
  const { state, patch } = useApp()
  const online  = state.devices.filter(d => d.status === 'device').length
  const running = state.pilot_running
  const by      = state.jobs?.by_status || {}
  const budget  = state.budget

  const toggle = () => {
    if (running) api.pilotStop().catch(() => {})
    else api.pilotStart().catch(() => {})
  }

  const stats = [
    { icon: Smartphone,   label: 'อุปกรณ์ออนไลน์', value: online },
    { icon: ListOrdered,  label: 'งานในคิว',       value: state.queue },
    { icon: CheckCircle2, label: 'เผยแพร่สำเร็จ',   value: state.done },
    { icon: XCircle,      label: 'ข้อผิดพลาด',      value: state.errors, danger: true },
  ]

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <div className="flex flex-col gap-1 animate-fade-up">
        <h2 className="text-ink text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ภาพรวมระบบ</h2>
        <p className="text-ink-dim text-sm">ระบบเผยแพร่วิดีโอ Shopee ขึ้นมือถืออัตโนมัติ</p>
      </div>

      {/* ── Auto-Pilot Control Center (hero) ── */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card animate-fade-up"
           style={{ animationDelay: '60ms' }}>
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 p-6 lg:p-7">

          <div className="flex items-center gap-4 min-w-0">
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center bg-accent-wash shrink-0">
              <Rocket size={26} strokeWidth={2} className="text-accent" />
              {running && <span className="absolute inset-0 rounded-2xl border-2 border-accent/40 animate-ping" />}
            </div>
            <div className="min-w-0">
              <p className="text-accent text-[11px] font-bold uppercase tracking-[0.15em]">โพสต์อัตโนมัติ</p>
              <p className="text-ink text-2xl font-extrabold tracking-tight leading-tight">
                {running ? 'กำลังโพสต์' : 'พร้อมโพสต์'}
              </p>
              <p className="text-ink-dim text-sm truncate">
                {running
                  ? (state.currentItem?.name ? `กำลังโพสต์: ${state.currentItem.name}` : 'กำลังเผยแพร่คลิปขึ้นมือถือทีละตัว')
                  : 'มีคลิปในคลังแล้วกดเริ่ม ระบบจะทยอยโพสต์เอง'}
              </p>
            </div>
          </div>

          <div className="lg:ml-auto flex items-center gap-3 shrink-0">
            <button onClick={toggle}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[.97]
                ${running ? 'bg-danger hover:opacity-90' : 'bg-accent hover:bg-accent-soft glow-accent'}`}>
              {running ? <Square size={16} className="fill-current" /> : <Play size={16} className="fill-current" />}
              {running ? 'ปิดอัตโนมัติ' : 'เปิดอัตโนมัติ'}
            </button>
          </div>
        </div>

        {/* Pipeline (stepper กระจายเต็มความกว้าง) */}
        <div className="relative border-t border-line px-6 lg:px-10 py-6">
          <div className="flex items-start overflow-x-auto">
            {PIPELINE.map((s, i) => {
              const n = by[s.key] || 0
              const active = n > 0
              return (
                <div key={s.key} className="flex items-center" style={{ flex: i < PIPELINE.length - 1 ? '1 1 0' : '0 0 auto' }}>
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors
                      ${active ? 'bg-accent-wash text-accent ring-2 ring-accent/20' : 'bg-elevated text-ink-mute'}`}>
                      <s.icon size={18} strokeWidth={2} />
                    </div>
                    <span className="text-ink text-lg font-bold nums leading-none">{n}</span>
                    <span className="text-ink-mute text-[11px] whitespace-nowrap">{s.label}</span>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-9 rounded-full ${active ? 'bg-accent/40' : 'bg-line'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {stats.map((s, i) => <StatCard key={s.label} index={i} {...s} />)}
      </div>

      {/* Lower: activity + budget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-[360px] animate-fade-up" style={{ animationDelay: '160ms' }}>
          <SystemLog logs={state.logs} onClear={() => patch({ logs: [] })} />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '220ms' }}>
          <BudgetCard budget={budget} cost={state.jobs?.total_cost || 0} />
        </div>
      </div>
    </div>
  )
}

function BudgetCard({ budget, cost }) {
  const unlimited = !budget || budget.unlimited
  const spent = budget?.spent ?? cost ?? 0
  const total = budget?.budget ?? 0
  const pct   = budget?.percent ?? (unlimited || !total ? 0 : Math.min(100, (spent / total) * 100))
  const alert = budget?.alert || 'ok'
  const month = budget?.month  || {}
  const today = budget?.today  || {}
  const flow  = month.flow   || { qty: 0, cost: 0 }
  const gem   = month.gemini || { qty: 0, tokens: 0, cost: 0 }

  const barCls   = alert === 'over' ? 'bg-danger' : alert === 'warn' ? 'bg-amber-400' : 'bg-accent'
  const todayCost = today.total_cost ?? 0

  return (
    <div className="h-full rounded-xl bg-surface border border-line shadow-card p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent-wash">
          <Wallet size={17} className="text-accent" />
        </div>
        <span className="text-ink text-sm font-semibold">งบ AI เดือนนี้</span>
        {alert !== 'ok' && (
          <span className={`ml-auto flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
            ${alert === 'over' ? 'bg-danger/15 text-danger' : 'bg-amber-400/15 text-amber-500'}`}>
            <AlertTriangle size={11} />{alert === 'over' ? 'เกินงบ' : 'ใกล้เต็ม'}
          </span>
        )}
      </div>

      <p className="text-ink text-[28px] font-extrabold nums leading-none">{baht(spent)}</p>
      <p className="text-ink-mute text-xs mt-1.5">
        {unlimited ? 'ไม่จำกัดงบ' : `จาก ${baht(total)}`}
        {todayCost > 0 && <span className="text-ink-dim"> · วันนี้ {baht(todayCost)}</span>}
      </p>

      {!unlimited && (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-elevated overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="text-ink-mute text-[11px] mt-2">ใช้ไป {Number(pct).toFixed(0)}%</p>
        </div>
      )}

      {/* แยกบริการ Flow / Gemini */}
      <div className="mt-5 pt-4 border-t border-line flex flex-col gap-3">
        <UsageRow icon={Clapperboard} label="Flow" sub={`${flow.qty || 0} คลิป`} cost={flow.cost} />
        <UsageRow icon={Sparkles} label="Gemini"
                  sub={`${gem.qty || 0} ครั้ง · ${fmtK(gem.tokens || 0)} token`} cost={gem.cost} />
      </div>

      <div className="mt-auto pt-4 text-[11px] text-ink-mute leading-relaxed">
        นับจริง + ประมาณบาท (ตั้งราคาต่อหน่วยในหน้าตั้งค่า)
      </div>
    </div>
  )
}

function UsageRow({ icon: Icon, label, sub, cost }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
        <Icon size={15} className="text-ink-dim" />
      </div>
      <div className="min-w-0">
        <p className="text-ink text-[13px] font-semibold leading-tight">{label}</p>
        <p className="text-ink-mute text-[11px] leading-tight">{sub}</p>
      </div>
      <span className="ml-auto text-ink text-sm font-bold nums">{baht(cost)}</span>
    </div>
  )
}
