'use client'
import { useState } from 'react'
import { useApp }      from '../layout'
import { MirrorGrid }  from '@/components/mirror/MirrorGrid'
import { api }         from '@/lib/api'
import { Play, Square, RefreshCw, Wifi } from 'lucide-react'

export default function MirrorPage() {
  const { state, patch } = useApp()
  const [scanning, setScanning] = useState(false)
  const [ip, setIp] = useState('')
  const connected = state.devices.filter(d => d.status === 'device')
  const streaming = connected.filter(d => d.streaming).length

  const scan = async () => {
    setScanning(true)
    try { const r = await api.scan(); patch({ devices: r.devices }) } catch {}
    setScanning(false)
  }
  const connect = async () => {
    if (!ip.trim()) return
    try { await api.wifiConnect(ip.trim()); setIp('') } catch {}
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 lg:px-6 py-3 border-b border-line shrink-0 bg-surface flex-wrap">

        <button onClick={scan} disabled={scanning}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-soft transition-all active:scale-[.98] disabled:opacity-50">
          <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} strokeWidth={2.5} />
          {scanning ? 'กำลังสแกน…' : 'สแกนเครื่อง'}
        </button>

        <div className="flex items-center gap-1.5">
          <input value={ip} onChange={e => setIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
            placeholder="Wi-Fi: 192.168.x.x"
            className="bg-elevated border border-line text-ink text-xs px-3 py-2 rounded-lg w-40 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute" />
          <button onClick={connect}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-dim bg-elevated border border-line hover:border-accent hover:text-accent px-3 py-2 rounded-lg transition-all">
            <Wifi size={12} /> ต่อ
          </button>
        </div>

        <div className="w-px h-4 bg-line mx-1" />

        <button onClick={() => api.mirrorStartAll()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-2 rounded-lg bg-success hover:opacity-90 transition-all active:scale-[.98]">
          <Play size={11} className="fill-current" /> สตรีมทั้งหมด
        </button>
        <button onClick={() => api.mirrorStopAll()}
          className="flex items-center gap-1.5 text-xs font-semibold text-danger px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/15 border border-danger/20 transition-all active:scale-[.98]">
          <Square size={11} className="fill-current" /> หยุด
        </button>

        <span className={`flex items-center gap-2 text-sm font-medium ${streaming > 0 ? 'text-success' : 'text-ink-mute'}`}>
          {streaming > 0 && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />}
          <span className="nums">{streaming}/{connected.length}</span> สตรีม
        </span>

        <span className="ml-auto text-[11px] text-ink-mute hidden md:block">
          คลิกเครื่อง → จอเต็ม + ควบคุม
        </span>
      </div>

      <div className="flex-1 overflow-hidden">
        {connected.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-ink font-semibold">ยังไม่พบมือถือ</p>
            <p className="text-ink-dim text-sm">ต่อสาย USB + เปิด USB Debugging แล้วกด "สแกนเครื่อง"</p>
          </div>
        ) : (
          <MirrorGrid devices={connected} />
        )}
      </div>
    </div>
  )
}
