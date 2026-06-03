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
    <aside className="w-[230px] shrink-0 flex flex-col h-screen sticky top-0 bg-side-bg text-side-ink">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[68px]">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 glow-accent"
             style={{ background: 'linear-gradient(135deg,#fb8c3a,#f97316)' }}>
          <Zap size={17} className="text-white fill-white" />
        </div>
        <div>
          <p className="text-side-ink font-bold text-[15px] leading-tight tracking-tight">Shopee VDO</p>
          <p className="text-accent text-[10px] font-bold tracking-[0.2em] uppercase">Auto Pilot</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-side-mute">{group}</p>
            <div className="space-y-1">
              {items.map(({ href, label, icon: Icon }) => {
                const active = path === href || path?.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150
                      ${active
                        ? 'bg-accent text-white font-semibold shadow-[0_6px_16px_rgba(249,115,22,0.35)]'
                        : 'text-side-dim font-medium hover:text-side-ink hover:bg-white/[0.05]'}`}>
                    <Icon size={17} strokeWidth={2}
                      className={active ? 'text-white' : 'text-side-mute group-hover:text-side-dim'} />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Status chip */}
      <div className="p-3">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-side-line">
          <span className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-success animate-pulse-dot' : 'bg-side-mute'}`}
                style={wsConnected ? { boxShadow: '0 0 8px rgba(22,163,74,0.9)' } : {}} />
          <div className="min-w-0">
            <p className="text-side-ink text-xs font-semibold leading-tight">ระบบ</p>
            <p className="text-side-mute text-[10px] leading-tight">
              {wsConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ…'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
