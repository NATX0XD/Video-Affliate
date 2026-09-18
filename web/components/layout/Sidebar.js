'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  CheckCircle2, Download, LayoutDashboard, Loader2,
  ListOrdered, Settings, Film, X, CheckSquare, MonitorSmartphone, ShieldAlert, GitBranch, Package, ScrollText,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { api } from '@/lib/api'

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
    { href: '/logs',      label: 'บันทึก',        icon: ScrollText      },
    { href: '/settings',  label: 'ตั้งค่า',       icon: Settings        },
  ]},
]

export function Sidebar({ wsConnected, open = false, onClose }) {
  const path = usePathname()
  const [update, setUpdate] = useState(null)
  const [checking, setChecking] = useState(false)

  const checkUpdate = async () => {
    // ถ้ากล่องแจ้งเตือนอัตโนมัติเปิดอยู่ ให้ใช้แผงนี้เป็นจุดเดียว ไม่เด้งซ้อนกัน
    try { window.dispatchEvent(new CustomEvent('vgap:update-dismiss')) } catch {}
    setChecking(true)
    try {
      const d = await api.appUpdateCheck()
      if (!d?.supported) setUpdate({ kind: 'unsupported', text: d?.reason || 'รุ่นนี้ต้องโหลดตัวติดตั้งใหม่' })
      else if (!d?.ok) setUpdate({ kind: 'error', text: d?.error || 'เช็กเวอร์ชันไม่ได้ — ลองใหม่เมื่อมีอินเทอร์เน็ต' })
      else if (!d.update_available) setUpdate({ kind: 'current', text: `ล่าสุดแล้ว (${d.current})` })
      else setUpdate({ kind: 'available', text: `มีเวอร์ชันใหม่ ${d.current} → ${d.latest}`, current: d })
    } catch { setUpdate({ kind: 'error', text: 'เช็กอัปเดตไม่ได้ — เช็คอินเทอร์เน็ต' }) }
    finally { setChecking(false) }
  }

  const runUpdate = async () => {
    setUpdate({ kind: 'updating', text: 'กำลังอัปเดต…' })
    try {
      const d = await api.appUpdate()
      if (!d?.ok) setUpdate({ kind: 'error', text: d?.error || 'อัปเดตไม่สำเร็จ' })
      else setUpdate({ kind: 'restart', text: `อัปเดตเป็น ${d.version || 'เวอร์ชันใหม่'} แล้ว — ปิดเปิดโปรแกรมใหม่`, warning: d.warning })
    } catch { setUpdate({ kind: 'error', text: 'อัปเดตไม่สำเร็จ — เช็คอินเทอร์เน็ต' }) }
  }

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
              <p className="px-3 mb-1.5 t-cap font-semibold text-muted-foreground">{group}</p>
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

        {/* Status + สลับธีม */}
        <div className="p-3 border-t border-border/50 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-secondary">
            <span className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-success animate-pulse-dot' : 'bg-muted-foreground'}`} />
            <div className="min-w-0">
              <p className="text-foreground t-badge leading-tight">สถานะระบบ</p>
              <p className="text-muted-foreground text-[12px] leading-tight">
                {wsConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ…'}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <button type="button" onClick={update?.kind === 'available' ? runUpdate : checkUpdate}
              disabled={checking || update?.kind === 'updating'}
              className="w-full flex items-center gap-2 text-left text-xs font-semibold text-foreground hover:text-accent disabled:opacity-60">
              {checking || update?.kind === 'updating' ? <Loader2 size={14} className="animate-spin" />
                : update?.kind === 'current' ? <CheckCircle2 size={14} className="text-success" /> : <Download size={14} />}
              <span className="truncate">{update?.kind === 'available' ? 'อัปเดตโปรแกรม' : 'อัปเดตโปรแกรม'}</span>
            </button>
            {update && <p className={`text-[11px] leading-relaxed mt-1 ${update.kind === 'error' ? 'text-danger' : update.kind === 'current' || update.kind === 'restart' ? 'text-success' : 'text-muted-foreground'}`}>{update.text}</p>}
            {update?.warning && <p className="text-[11px] leading-relaxed mt-1 text-amber-500">คำเตือน: {update.warning}</p>}
            {update?.kind === 'unsupported' && <p className="text-[11px] leading-relaxed mt-1 text-muted-foreground">ต้องโหลดตัวติดตั้งใหม่จากผู้พัฒนา</p>}
          </div>
          <ThemeToggle />
        </div>
      </aside>
    </>
  )
}
