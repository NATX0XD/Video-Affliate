'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import { Sidebar  } from '@/components/layout/Sidebar'
import { Topbar   } from '@/components/layout/Topbar'
import { GenProgress } from '@/components/GenProgress'
import { Onboarding } from '@/components/Onboarding'
import { useStatus } from '@/hooks/useStatus'
import { api } from '@/lib/api'
import { usePathname } from 'next/navigation'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const TITLES = {
  '/dashboard': 'ค็อกพิต',
  '/reports':   'รายงาน',
  '/jobs':      'งาน',
  '/products':  'สินค้า',
  '/library':   'คลังคลิป',
  '/devices':   'จัดการเครื่อง',
  '/mirror':    'มือถือ',
  '/queue':     'คิวงาน',
  '/autopilot': 'ออโต้ไพลอต',
  '/settings':  'ตั้งค่า',
}

export default function AppLayout({ children }) {
  const { state, patch } = useStatus()
  const path   = usePathname()
  const title  = TITLES[path] ?? 'Shopee VDO Gen'
  const online = state.devices.filter(d => d.status === 'device').length

  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => { setNavOpen(false) }, [path])   // ปิด drawer เมื่อเปลี่ยนหน้า

  // first-run: เช็กว่าตั้งชื่อร้านแล้วหรือยัง
  const [setup, setSetup] = useState({ checked: false, configured: false })
  useEffect(() => {
    api.getSetup()
      .then(d => setSetup({ checked: true, configured: !!d.configured }))
      .catch(() => setSetup({ checked: true, configured: true }))  // เชื่อมไม่ได้ → ไม่บล็อก
  }, [])

  if (!setup.checked) {
    return (
      <div className="h-screen flex items-center justify-center bg-base">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin" />
      </div>
    )
  }
  if (!setup.configured) {
    return <Onboarding onDone={() => setSetup({ checked: true, configured: true })} />
  }

  return (
    <AppCtx.Provider value={{ state, patch }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar wsConnected={state.ws_connected}
                 open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar title={title} devices={online} queue={state.queue}
                  onMenu={() => setNavOpen(true)} />
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
