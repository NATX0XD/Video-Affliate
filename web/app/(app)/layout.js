'use client'
import { createContext, useContext } from 'react'
import { Sidebar  } from '@/components/layout/Sidebar'
import { Topbar   } from '@/components/layout/Topbar'
import { GenProgress } from '@/components/GenProgress'
import { useStatus } from '@/hooks/useStatus'
import { usePathname } from 'next/navigation'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

const TITLES = {
  '/dashboard': 'Dashboard',
  '/products':  'Products',
  '/library':   'Clips Library',
  '/devices':   'Devices / ADB',
  '/mirror':    'Screen Mirror',
  '/queue':     'Queue',
  '/autopilot': 'Auto Pilot',
  '/settings':  'Settings',
}

export default function AppLayout({ children }) {
  const { state, patch } = useStatus()
  const path   = usePathname()
  const title  = TITLES[path] ?? 'Shopee VDO Gen'
  const online = state.devices.filter(d => d.status === 'device').length

  return (
    <AppCtx.Provider value={{ state, patch }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar wsConnected={state.ws_connected} />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar title={title} devices={online} queue={state.queue} />
          <div className="flex-1 overflow-auto">
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
