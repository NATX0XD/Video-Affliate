'use client'
import Link from 'next/link'
import { useApp }    from '../layout'
import { StatCard }  from '@/components/dashboard/StatCard'
import { SystemLog } from '@/components/dashboard/SystemLog'
import {
  Smartphone, ListOrdered, CheckCircle2, XCircle,
  Package, Rocket, Monitor, ArrowRight, Play
} from 'lucide-react'

const QUICK = [
  { href: '/products', icon: Package, title: 'นำเข้าสินค้า', desc: 'ดึงรายการจาก Extension' },
  { href: '/mirror',   icon: Monitor, title: 'จอมือถือ',     desc: 'ควบคุมอุปกรณ์เรียลไทม์' },
]

export default function DashboardPage() {
  const { state, patch } = useApp()
  const online  = state.devices.filter(d => d.status === 'device').length
  const running = state.pilot_running

  const stats = [
    { icon: Smartphone,   label: 'อุปกรณ์ออนไลน์', value: online },
    { icon: ListOrdered,  label: 'งานในคิว',       value: state.queue },
    { icon: CheckCircle2, label: 'เผยแพร่สำเร็จ',   value: state.done },
    { icon: XCircle,      label: 'ข้อผิดพลาด',      value: state.errors, danger: true },
  ]

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8 h-full">

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <h2 className="text-ink text-[28px] lg:text-[32px] font-extrabold tracking-tight leading-none">ภาพรวมระบบ</h2>
          <p className="text-ink-dim text-sm mt-2">ระบบสร้างและเผยแพร่วิดีโออัตโนมัติ</p>
        </div>
        <Link href="/autopilot"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold shadow-xs transition-all hover:bg-accent-soft active:scale-[.98]">
          <Play size={15} className="fill-current" /> เริ่มออโต้ไพลอต
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {stats.map((s, i) => <StatCard key={s.label} index={i} {...s} />)}
      </div>

      {/* Lower: log (กว้าง) + panel ขวา */}
      <div className="flex-1 min-h-[300px] grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity log */}
        <div className="lg:col-span-2 min-h-[300px] animate-fade-up" style={{ animationDelay: '140ms' }}>
          <SystemLog logs={state.logs} onClear={() => patch({ logs: [] })} />
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-5 animate-fade-up" style={{ animationDelay: '200ms' }}>

          {/* Auto-pilot status */}
          <div className="rounded-xl bg-surface border border-line shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent-wash">
                <Rocket size={19} strokeWidth={2.2} className="text-accent" />
              </div>
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border
                ${running ? 'bg-accent-wash text-accent border-accent/20' : 'bg-elevated text-ink-mute border-line'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-accent animate-pulse-dot' : 'bg-ink-mute'}`} />
                {running ? 'ทำงานอยู่' : 'หยุดทำงาน'}
              </span>
            </div>
            <p className="text-ink text-[15px] font-semibold">ระบบอัตโนมัติ</p>
            <p className="text-ink-dim text-sm mt-1">
              {running ? 'กำลังค้นหา สร้าง และเผยแพร่ตามลำดับ' : 'พร้อมเริ่มทำงาน ตั้งค่าแล้วกดเริ่มได้ทันที'}
            </p>
          </div>

          {/* Quick links */}
          {QUICK.map(({ href, icon: Icon, title, desc }) => (
            <Link key={href} href={href}
              className="group lift rounded-xl bg-surface border border-line shadow-card p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-elevated group-hover:bg-accent-wash transition-colors shrink-0">
                <Icon size={19} strokeWidth={2.2} className="text-ink-dim group-hover:text-accent transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-semibold">{title}</p>
                <p className="text-ink-dim text-xs truncate">{desc}</p>
              </div>
              <ArrowRight size={16} className="text-ink-mute group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
