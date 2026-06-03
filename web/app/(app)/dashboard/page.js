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
  { href: '/products',  icon: Package,  title: 'นำเข้าสินค้า',  desc: 'Import JSON จาก Extension', color: 'violet' },
  { href: '/autopilot', icon: Rocket,   title: 'Auto Pilot',    desc: 'สร้างวิดีโอ + โพสต์',       color: 'emerald' },
  { href: '/mirror',    icon: Monitor,  title: 'Screen Mirror', desc: 'ดู/คุมมือถือสด',           color: 'sky' },
]

const QC = {
  violet:  'bg-violet-500/10  text-violet-400  group-hover:border-violet-500/40',
  emerald: 'bg-emerald-500/10 text-emerald-400 group-hover:border-emerald-500/40',
  sky:     'bg-sky-500/10     text-sky-400     group-hover:border-sky-500/40',
}

export default function DashboardPage() {
  const { state, patch } = useApp()
  const online = state.devices.filter(d => d.status === 'device').length

  const stats = [
    { icon: Smartphone,   label: 'Devices', value: online,        color: 'sky'     },
    { icon: ListOrdered,  label: 'Queue',   value: state.queue,   color: 'amber'   },
    { icon: CheckCircle2, label: 'Posted',  value: state.done,    color: 'emerald' },
    { icon: XCircle,      label: 'Errors',  value: state.errors,  color: 'rose'    },
  ]

  return (
    <div className="flex flex-col gap-4 p-6 h-full">

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {QUICK.map(({ href, icon: Icon, title, desc, color }) => (
          <Link key={href} href={href}
            className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-white/[0.06] transition-all hover:bg-white/[0.02]"
            style={{ background: '#111120' }}>
            <div className={`p-2.5 rounded-xl ${QC[color]} border border-transparent transition-all`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{title}</p>
              <p className="text-slate-600 text-[11px] truncate">{desc}</p>
            </div>
            <ArrowRight size={15} className="ml-auto text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
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
