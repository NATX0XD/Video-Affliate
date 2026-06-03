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
    { href: '/autopilot', label: 'ออโต้ไพลอต',  icon: Rocket },
  ]},
  { group: 'การทำงาน', items: [
    { href: '/queue',     label: 'คิวงาน',  icon: ListOrdered },
    { href: '/products',  label: 'สินค้า',  icon: Package     },
    { href: '/library',   label: 'คลังคลิป', icon: Film        },
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
    <aside className="w-[244px] shrink-0 flex flex-col h-screen sticky top-0 bg-surface border-r border-line">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[64px] border-b border-line-soft">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 glow-accent"
             style={{ background: 'linear-gradient(135deg,#b975f9,#a855f7)' }}>
          <Zap size={17} className="text-white fill-white" />
        </div>
        <div>
          <p className="text-ink font-bold text-[15px] leading-tight tracking-tight">Shopee VDO</p>
          <p className="text-accent text-[10px] font-bold tracking-[0.18em] uppercase">Auto Pilot</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-mute">{group}</p>
            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active = path === href || path?.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
                      ${active
                        ? 'bg-accent-wash text-accent font-semibold'
                        : 'text-ink-dim font-medium hover:text-ink hover:bg-elevated'}`}>
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent" />}
                    <Icon size={18} strokeWidth={2}
                      className={active ? 'text-accent' : 'text-ink-mute group-hover:text-ink-dim transition-colors'} />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Status */}
      <div className="p-3 border-t border-line-soft">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-elevated">
          <span className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-success animate-pulse-dot' : 'bg-ink-mute'}`} />
          <div className="min-w-0">
            <p className="text-ink text-xs font-semibold leading-tight">สถานะระบบ</p>
            <p className="text-ink-mute text-[10px] leading-tight">
              {wsConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ…'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
