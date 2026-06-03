'use client'
import { useState } from 'react'
import { useApp }      from '../layout'
import { DeviceCard }  from '@/components/devices/DeviceCard'
import { api }         from '@/lib/api'
import { RefreshCw, Wifi, AlertCircle } from 'lucide-react'

export default function DevicesPage() {
  const { state, patch } = useApp()
  const [scanning, setScanning] = useState(false)
  const [ip, setIp]             = useState('')
  const [error, setError]       = useState('')

  const scan = async () => {
    setScanning(true)
    setError('')
    try {
      const res = await api.scan()
      patch({ devices: res.devices })
    } catch {
      setError('ไม่สามารถเชื่อมต่อ Backend — รัน python desktop/main.py ก่อนครับ')
    } finally {
      setScanning(false)
    }
  }

  const connect = async () => {
    if (!ip.trim()) return
    try {
      await api.wifiConnect(ip.trim())
      setIp('')
    } catch {
      setError('ไม่สามารถเชื่อมต่อ Backend — รัน python desktop/main.py ก่อนครับ')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">

      {error && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={scan} disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
          <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} strokeWidth={2.5} />
          {scanning ? 'Scanning…' : 'Scan Devices'}
        </button>

        <div className="flex items-center gap-2">
          <input
            value={ip}
            onChange={e => setIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
            placeholder="192.168.x.x"
            className="bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 rounded-xl w-40 outline-none focus:border-violet-500/60 placeholder:text-slate-700 transition-colors"
          />
          <button onClick={connect}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all">
            <Wifi size={13} /> Connect
          </button>
        </div>
      </div>

      {/* Device list */}
      <div className="flex flex-col gap-2">
        {state.devices.length === 0
          ? (
            <div className="rounded-2xl border border-white/[0.06] p-16 text-center"
                 style={{ background: '#111120' }}>
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
                <RefreshCw size={20} className="text-slate-600" />
              </div>
              <p className="text-slate-400 font-medium mb-1">No devices found</p>
              <p className="text-slate-600 text-sm">Connect via USB and enable USB Debugging</p>
            </div>
          )
          : state.devices.map(d => <DeviceCard key={d.serial} device={d} />)
        }
      </div>
    </div>
  )
}
