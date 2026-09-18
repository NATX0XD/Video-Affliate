'use client'
import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { Sidebar  } from '@/components/layout/Sidebar'
import { Topbar   } from '@/components/layout/Topbar'
import { GenProgress } from '@/components/GenProgress'
import { PostBlockedPrompt } from '@/components/PostBlockedPrompt'
import { Onboarding } from '@/components/Onboarding'
import LicenseActivation from '@/components/LicenseActivation'
import { useStatus } from '@/hooks/useStatus'
import { useToast } from '@/components/ui/Toast'
import { MSG } from '@/lib/copy'
import { api } from '@/lib/api'
import { usePathname } from 'next/navigation'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const TITLES = {
  '/dashboard': 'ค็อกพิต',
  '/pipeline':  'ไปป์ไลน์',
  '/products':  'คลังสินค้า',
  '/reports':   'รายงาน',
  '/jobs':      'งาน',
  '/posts':     'ผลการโพสต์',
  '/library':   'คลังคลิป',
  '/devices':   'ดูแลเครื่อง',
  '/mirror':    'จอสด',
  '/logs':      'บันทึก',
  '/settings':  'ตั้งค่า',
}

export default function AppLayout({ children }) {
  const { state, patch, refresh } = useStatus()
  const path   = usePathname()
  const title  = TITLES[path] ?? 'VDO Gen Auto Pilot'
  const online = state.devices.filter(d => d.status === 'device').length

  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => { setNavOpen(false) }, [path])   // ปิด drawer เมื่อเปลี่ยนหน้า

  // แจ้งเตือนเมื่อการเชื่อมต่อโปรแกรมหลัก (WebSocket) หลุด/กลับมา
  const toast = useToast()
  const wsState = useRef(false)   // false=ยังไม่เคยต่อ · true=ต่ออยู่ · 'lost'=หลุด
  useEffect(() => {
    if (state.ws_connected) {
      if (wsState.current === 'lost') toast.success(MSG.wsBack)
      wsState.current = true
    } else if (wsState.current === true) {
      wsState.current = 'lost'
      toast.error(MSG.wsLost)
    }
  }, [state.ws_connected, toast])

  // แจ้งผลโพสต์ทันทีที่คลิปจบ — เด้งได้จากทุกหน้า ไม่ต้องเปิดค้างที่หน้ารายการคลิป
  // (หน้ารายการ poll ทุก 4 วิอยู่แล้ว แต่ถ้าไม่นั่งจ้องก็ไม่รู้ว่าสถานะเปลี่ยนไปแล้ว)
  const lastPost = useRef(0)
  useEffect(() => {
    const r = state.postResult
    if (!r || r.ts === lastPost.current) return
    lastPost.current = r.ts
    const who = r.name ? `"${String(r.name).slice(0, 28)}"` : 'คลิป'
    const where = r.platforms?.length ? ` → ${r.platforms.join(', ')}` : ''
    if (r.outcome === 'posted')          toast.success(`โพสต์ ${who} สำเร็จ${where}`)
    else if (r.outcome === 'unverified') toast.warning(`โพสต์ ${who} แล้ว แต่ยืนยันผลไม่ได้ — เปิดแอปตรวจว่าขึ้นจริงไหม`)
    else if (r.outcome === 'retry')      toast.info(`โพสต์ ${who} ไม่ผ่าน — ${r.detail || 'จะลองใหม่ให้'}`)
    else                                 toast.error(`โพสต์ ${who} ไม่สำเร็จ${where} — ${r.detail || 'ดูรายละเอียดที่หน้างาน'}`)
  }, [state.postResult, toast])

  const lastFlowBlock = useRef(0)
  useEffect(() => {
    const b = state.flowBlocker
    if (!b || b.at === lastFlowBlock.current) return
    lastFlowBlock.current = b.at
    toast.error(`${b.reason} — ${b.action}`, { duration: 12000, dedupeKey: `flow-block:${b.at}` })
  }, [state.flowBlocker, toast])

  // งานที่ค้าง pending นานเกินหนึ่งนาทีมักหมายถึงส่วนขยายไม่ได้ต่ออยู่ — บอกผู้ใช้ทันที
  const warnedQueue = useRef(new Set())
  useEffect(() => {
    let alive = true
    const check = () => api.queueNext().then(d => {
      if (!alive || !d?.item || d.item.status !== 'pending') return
      const age = Date.now() / 1000 - Number(d.item.created_ts || 0)
      if (age > 60 && !warnedQueue.current.has(d.item.id)) {
        warnedQueue.current.add(d.item.id)
        toast.warning('งานสร้างคลิปค้างเกิน 1 นาที — ส่วนขยายอาจยังไม่ได้เชื่อมต่อ ให้เปิด Chrome แล้วกด reload ที่ chrome://extensions', { duration: 12000, dedupeKey: `queue-pending:${d.item.id}` })
      }
    }).catch(() => {})
    check()
    const id = setInterval(check, 10000)
    return () => { alive = false; clearInterval(id) }
  }, [toast])

  // gate 1: license check (disabled ระหว่าง dev — เปิดก่อน release)
  const [license, setLicense] = useState({ checked: true, ok: true })

  // gate 2: setup (ชื่อร้าน)
  const [setup, setSetup] = useState({ checked: false, configured: false })
  useEffect(() => {
    if (!license.checked || !license.ok) return
    let alive = true, t = null
    const load = () => api.getSetup()
      .then(d => { if (alive) setSetup({ checked: true, configured: !!d.configured }) })
      // ต่อ backend ไม่ได้ = อย่าเดาว่า configured (เดิมเดา true → ข้าม onboarding ไป dashboard ผิด)
      // คงหน้า "กำลังเชื่อมต่อ" แล้ว retry จน backend พร้อม → ค่อยตัดสิน onboarding/หน้าหลักถูกต้อง
      .catch(() => { if (alive) { setSetup({ checked: false, configured: false }); t = setTimeout(load, 1500) } })
    load()
    return () => { alive = false; if (t) clearTimeout(t) }
  }, [license.checked, license.ok])

  // (หยุด animation/polling เมื่อหน้าต่างไม่ได้ focus — จัดการโดย inline script ใน root layout)

  if (!license.checked) {
    return (
      <div className="h-screen flex items-center justify-center bg-base">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin" />
      </div>
    )
  }
  if (!license.ok) {
    return <LicenseActivation onActivated={() => setLicense({ checked: true, ok: true })} />
  }
  if (!setup.checked) {
    return (
      <div className="h-screen flex flex-col gap-3 items-center justify-center bg-base">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin" />
        <p className="text-muted-foreground text-sm">กำลังเชื่อมต่อโปรแกรมหลักในเครื่อง…</p>
      </div>
    )
  }
  if (!setup.configured) {
    return (
      <Onboarding
        status={state}
        onRefresh={refresh}
        onDone={() => setSetup({ checked: true, configured: true })}
      />
    )
  }

  return (
    <AppCtx.Provider value={{ state, patch }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar wsConnected={state.ws_connected}
                 open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar title={title} devices={online} queue={state.queue}
                  onMenu={() => setNavOpen(true)} />
          {/* ไม่ใส่ transition ระดับ layout — แต่ละหน้ามี entrance ของตัวเองอยู่แล้ว
              (กันอนิเมชั่นตอนเข้าเล่นซ้อน 2 ชั้น) */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>

      {/* Floating generation progress — visible on every page */}
      {state.genProgress && (
        <div className="fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)]"
             style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
          <GenProgress />
        </div>
      )}

      {state.flowBlocker && (
        <div className="fixed bottom-5 left-5 z-50 w-[min(430px,calc(100vw-2.5rem))] rounded-2xl border border-amber-400/30 bg-card p-4 shadow-lift">
          <div className="text-sm font-semibold text-foreground">คิว Flow หยุดรอการยืนยัน</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.flowBlocker.reason}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.flowBlocker.action}</p>
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
              onClick={async () => { await api.flowCreditOverride(); await api.flowStatus(); }}>
              ลองต่อไปเลย (เสี่ยงเครดิตไม่พอ)
            </button>
            <button className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
              onClick={() => api.flowStatus().catch(() => {})}>เช็คอีกครั้ง</button>
          </div>
        </div>
      )}

      {/* เตือนเมื่อโพสต์ไม่ได้ (ยังไม่เสียบมือถือ / ยังไม่เลือกแพลตฟอร์ม) — อยู่หลัง onboarding
          จึงไม่ไปเด้งใส่คนที่ยังตั้งค่าไม่เสร็จ */}
      <PostBlockedPrompt />
    </AppCtx.Provider>
  )
}
