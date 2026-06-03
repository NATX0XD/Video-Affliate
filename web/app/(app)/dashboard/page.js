'use client'
import Link from 'next/link'
import { useApp }    from '../layout'
import { StatCard }  from '@/components/dashboard/StatCard'
import { SystemLog } from '@/components/dashboard/SystemLog'
import {
  Smartphone, ListOrdered, CheckCircle2, XCircle,
  Package, Rocket, Monitor, ArrowRight
} from 'lucide-react'

const QUICK = [
  { href: '/products',  icon: Package, title: 'นำเข้าสินค้า', desc: 'ดูดจาก Extension' },
  { href: '/autopilot', icon: Rocket,  title: 'ออโต้ไพลอต',  desc: 'สร้างวิดีโอ + โพสต์' },
  { href: '/mirror',    icon: Monitor, title: 'จอมือถือ',     desc: 'ดู/คุมมือถือสด' },
]

export default function DashboardPage() {
  const { state, patch } = useApp()
  const online = state.devices.filter(d => d.status === 'device').length

  const stats = [
    { icon: Smartphone,   label: 'มือถือ',  value: online,       tone: 'accent'  },
    { icon: ListOrdered,  label: 'ในคิว',   value: state.queue,  tone: 'neutral' },
    { icon: CheckCircle2, label: 'โพสต์แล้ว', value: state.done,   tone: 'success' },
    { icon: XCircle,      label: 'ผิดพลาด', value: state.errors, tone: 'danger'  },
  ]

  return (
    <div className="flex flex-col gap-4 p-6 h-full">

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {QUICK.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}
            className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-line bg-surface transition-all hover:border-accent/40 hover:bg-elevated">
            <div className="p-2.5 rounded-xl bg-elevated group-hover:bg-accent/10 transition-colors">
              <Icon size={18} className="text-ink-dim group-hover:text-accent transition-colors" />
            </div>
            <div className="min-w-0">
              <p className="text-ink text-sm font-semibold truncate">{title}</p>
              <p className="text-ink-mute text-[11px] truncate">{desc}</p>
            </div>
            <ArrowRight size={15} className="ml-auto text-ink-mute group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Log */}
      <div className="flex-1 min-h-0">
        <SystemLog logs={state.logs} onClear={() => patch({ logs: [] })} />
      </div>
    </div>
  )
}
