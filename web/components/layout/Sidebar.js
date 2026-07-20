'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ListOrdered, Settings, Film, X, CheckSquare, MonitorSmartphone, ShieldAlert, GitBranch, Package,
} from 'lucide-react'

const NAV = [
  { group: 'ภาพรวม', items: [
    { href: '/dashboard', label: 'ค็อกพิต',      icon: LayoutDashboard },
    { href: '/pipeline',  label: 'ไปป์ไลน์',     icon: GitBranch       },
  ]},
  { group: 'การทำงาน', items: [
    { href: '/products',  label: 'คลังสินค้า',    icon: Package         },
    { href: '/jobs',      label: 'งาน',           icon: ListOrdered     },
    { href: '/posts',     label: 'ผลการโพสต์',   icon: CheckSquare     },
    { href: '/library',   label: 'คลังคลิป',     icon: Film            },
  ]},
  { group: 'ฟาร์มมือถือ', items: [
    { href: '/devices',   label: 'ดูแลเครื่อง',  icon: ShieldAlert     },
    { href: '/mirror',    label: 'จอสด',          icon: MonitorSmartphone },
  ]},
  { group: 'ระบบ', items: [
    { href: '/settings',  label: 'ตั้งค่า',       icon: Settings        },
  ]},
]

export function Sidebar({ wsConnected, open = false, onClose }) {
  const path = usePathname()

  return (
    <>
      {/* Backdrop (มือถือ) */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-200
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      <aside className={`fixed lg:sticky top-0 left-0 z-50 w-[244px] shrink-0 flex flex-col h-screen
          bg-card border-r border-border transition-transform duration-200 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

        {/* Brand */}
        <div className="relative flex items-center justify-center px-5 h-[80px] border-b border-border/50 shrink-0">
          <Image
            src="/logo.png"
            alt="VDO Gen Auto Pilot"
            width={914}
            height={536}
            className="h-[64px] w-auto object-contain drop-shadow-lg"
            priority
          />
          <button onClick={onClose}
            className="absolute right-3 top-1/2 -translate-y-1/2 lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mb-5 last:mb-0">
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{group}</p>
              <div className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = path === href || path?.startsWith(href + '/')
                  return (
                    <Link key={href} href={href}
                      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
                        ${active
                          ? 'bg-accent-wash text-accent font-semibold'
                          : 'text-muted-foreground font-medium hover:text-foreground hover:bg-secondary'}`}>
                      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-accent" />}
                      <Icon size={18} strokeWidth={2}
                        className={active ? 'text-accent' : 'text-muted-foreground/70 group-hover:text-muted-foreground transition-colors'} />
                      <span>{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Status */}
        <div className="p-3 border-t border-border/50">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-secondary">
            <span className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-success animate-pulse-dot' : 'bg-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-foreground text-xs font-semibold leading-tight">สถานะระบบ</p>
              <p className="text-muted-foreground text-[10px] leading-tight">
                {wsConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ…'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
