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
  { href: '/products',  icon: Package, title: 'นำเข้าสินค้า', desc: 'ดูดจาก Extension', tone: 'accent'  },
  { href: '/autopilot', icon: Rocket,  title: 'ออโต้ไพลอต',  desc: 'สร้าง + โพสต์',     tone: 'info'    },
  { href: '/mirror',    icon: Monitor, title: 'จอมือถือ',     desc: 'ดู/คุมมือถือสด',   tone: 'success' },
]

const QC = {
  accent:  'bg-accent/12  text-accent',
  info:    'bg-info/12    text-info',
  success: 'bg-success/12 text-success',
}

export default function DashboardPage() {
  const { state, patch } = useApp()
  const online = state.devices.filter(d => d.status === 'device').length

  const stats = [
    { icon: Smartphone,   label: 'มือถือออนไลน์', value: online,       tone: 'accent'  },
    { icon: ListOrdered,  label: 'ในคิว',         value: state.queue,  tone: 'info'    },
    { icon: CheckCircle2, label: 'โพสต์แล้ว',      value: state.done,   tone: 'success' },
    { icon: XCircle,      label: 'ผิดพลาด',        value: state.errors, tone: 'danger'  },
  ]

  return (
    <div className="flex flex-col gap-5 p-7 h-full">

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4">
        {QUICK.map(({ href, icon: Icon, title, desc, tone }) => (
          <Link key={href} href={href}
            className="group flex items-center gap-3.5 px-5 py-4 rounded-2xl bg-surface border border-line shadow-card transition-all hover:-translate-y-0.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${QC[tone]}`}>
              <Icon size={19} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="text-ink text-[15px] font-semibold truncate">{title}</p>
              <p className="text-ink-mute text-xs truncate">{desc}</p>
            </div>
            <ArrowRight size={16} className="ml-auto text-ink-mute group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </Link>
        ))}
      </div>

      {/* Log */}
      <div className="flex-1 min-h-0">
        <SystemLog logs={state.logs} onClear={() => patch({ logs: [] })} />
      </div>
    </div>
  )
}
