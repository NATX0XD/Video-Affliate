'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Smartphone, Monitor,
  ListOrdered, Rocket, Settings, Zap, Package, Film
} from 'lucide-react'

const NAV = [
  { group: 'ภาพรวม', items: [
    { href: '/dashboard', label: 'ค็อกพิต',     icon: LayoutDashboard },
    { href: '/autopilot', label: 'ออโต้ไพลอต',  icon: Rocket, star: true },
  ]},
  { group: 'วงจรงาน', items: [
    { href: '/queue',     label: 'คิวงาน',  icon: ListOrdered },
    { href: '/products',  label: 'สินค้า',  icon: Package     },
    { href: '/library',   label: 'คลิป',    icon: Film        },
  ]},
  { group: 'อุปกรณ์', items: [
    { href: '/mirror',    label: 'จอมือถือ',     icon: Monitor    },
    { href: '/devices',   label: 'จัดการเครื่อง', icon: Smartphone },
  ]},
  { group: 'ระบบ', items: [
    { href: '/settings',  label: 'ตั้งค่า', icon: Settings },
  ]},
]

export function Sidebar({ wsConnected }) {
  const path = usePathname()

  return (
    <aside className="w-[220px] shrink-0 flex flex-col h-screen sticky top-0 border-r border-line bg-surface">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[60px]">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 glow-accent"
             style={{ background: 'linear-gradient(135deg,#ff6e42,#ff5c2b)' }}>
          <Zap size={15} className="text-white fill-white" />
        </div>
        <div>
          <p className="text-ink font-bold text-sm leading-tight tracking-tight">Shopee VDO</p>
          <p className="text-accent/70 text-[10px] font-semibold tracking-widest uppercase">Auto Pilot</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-line" />

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-4 last:mb-0">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-mute">{group}</p>
            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon, star }) => {
                const active = path === href || path?.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                      ${active ? 'text-ink' : 'text-ink-dim hover:text-ink hover:bg-line'}`}>
                    {active && <span className="absolute inset-0 rounded-xl bg-accent/12 border border-accent/25" />}
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />}
                    <Icon size={16}
                      className={`shrink-0 relative z-10 transition-colors ${active ? 'text-accent' : 'text-ink-mute group-hover:text-ink-dim'}`} />
                    <span className="relative z-10 flex-1">{label}</span>
                    {star && <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Status */}
      <div className="mx-4 h-px bg-line" />
      <div className="px-5 py-4 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${wsConnected ? 'bg-success animate-pulse-dot' : 'bg-ink-mute'}`}
              style={wsConnected ? { boxShadow: '0 0 6px rgba(46,189,133,0.8)' } : {}} />
        <span className="text-[11px] text-ink-mute font-medium">
          {wsConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ…'}
        </span>
      </div>
    </aside>
  )
}
