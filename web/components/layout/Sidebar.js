'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Smartphone, Monitor,
  ListOrdered, Rocket, Settings, Zap, Package, Film
} from 'lucide-react'

const NAV = [
  { group: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]},
  { group: 'Content', items: [
    { href: '/products',  label: 'Products',   icon: Package     },
    { href: '/library',   label: 'Clips',      icon: Film        },
    { href: '/queue',     label: 'Queue',      icon: ListOrdered },
    { href: '/autopilot', label: 'Auto Pilot', icon: Rocket      },
  ]},
  { group: 'Devices', items: [
    { href: '/devices',   label: 'Devices',       icon: Smartphone },
    { href: '/mirror',    label: 'Screen Mirror', icon: Monitor    },
  ]},
  { group: 'System', items: [
    { href: '/settings',  label: 'Settings', icon: Settings },
  ]},
]

export function Sidebar({ wsConnected }) {
  const path = usePathname()

  return (
    <aside className="w-[220px] shrink-0 flex flex-col h-screen sticky top-0 border-r border-white/[0.05]"
           style={{ background: '#0a0a16' }}>

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[60px]">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', boxShadow: '0 4px 14px rgba(124,58,237,0.4)' }}>
          <Zap size={15} className="text-white fill-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight tracking-tight">Shopee VDO</p>
          <p className="text-violet-400/60 text-[10px] font-medium tracking-widest uppercase">Auto Pilot</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-white/[0.05]" />

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-4 last:mb-0">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-700">{group}</p>
            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active = path === href || path?.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                      ${active ? 'text-white' : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'}`}>
                    {active && <span className="absolute inset-0 rounded-xl bg-violet-600/15 border border-violet-500/25" />}
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-violet-400" />}
                    <Icon size={15}
                      className={`shrink-0 relative z-10 transition-colors ${active ? 'text-violet-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
                    <span className="relative z-10">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Status */}
      <div className="mx-4 h-px bg-white/[0.05]" />
      <div className="px-5 py-4 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${wsConnected ? 'bg-emerald-400' : 'bg-slate-600'}`}
              style={wsConnected ? { boxShadow: '0 0 6px rgba(52,211,153,0.8)' } : {}} />
        <span className="text-[11px] text-slate-600 font-medium">
          {wsConnected ? 'Connected' : 'Connecting…'}
        </span>
      </div>
    </aside>
  )
}
