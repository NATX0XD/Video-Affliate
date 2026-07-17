'use client'
import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { Sidebar  } from '@/components/layout/Sidebar'
import { Topbar   } from '@/components/layout/Topbar'
import { GenProgress } from '@/components/GenProgress'
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
  '/reports':   'รายงาน',
  '/jobs':      'งาน',
  '/posts':     'ผลการโพสต์',
  '/library':   'คลังคลิป',
  '/devices':   'ดูแลเครื่อง',
  '/mirror':    'จอสด',
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

  // gate 1: license check (disabled ระหว่าง dev — เปิดก่อน release)
  const [license, setLicense] = useState({ checked: true, ok: true })

  // gate 2: setup (ชื่อร้าน)
  const [setup, setSetup] = useState({ checked: false, configured: false })
  useEffect(() => {
    if (!license.checked || !license.ok) return
    api.getSetup()
      .then(d => setSetup({ checked: true, configured: !!d.configured }))
      .catch(() => setSetup({ checked: true, configured: true }))
  }, [license.checked, license.ok])

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
      <div className="h-screen flex items-center justify-center bg-base">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin" />
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
    </AppCtx.Provider>
  )
}
