'use client'
import { useState } from 'react'
import { useApp }      from '../layout'
import { DeviceCard }  from '@/components/devices/DeviceCard'
import { PageHeader }  from '@/components/layout/PageHeader'
import { api }         from '@/lib/api'
import { RefreshCw, Wifi, AlertCircle, Smartphone } from 'lucide-react'

export default function DevicesPage() {
  const { state, patch } = useApp()
  const [scanning, setScanning] = useState(false)
  const [ip, setIp]             = useState('')
  const [error, setError]       = useState('')

  const scan = async () => {
    setScanning(true); setError('')
    try {
      const res = await api.scan()
      patch({ devices: res.devices })
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — เปิด backend (python desktop/main.py) ก่อน')
    } finally { setScanning(false) }
  }

  const connect = async () => {
    if (!ip.trim()) return
    try { await api.wifiConnect(ip.trim()); setIp('') }
    catch { setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ') }
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8 max-w-[1000px]">
      <PageHeader
        title="จัดการเครื่อง"
        subtitle="เชื่อมต่อและตรวจสอบมือถือที่ใช้โพสต์"
        action={
          <button onClick={scan} disabled={scanning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-soft transition-all active:scale-[.98] disabled:opacity-50">
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} strokeWidth={2.5} />
            {scanning ? 'กำลังสแกน…' : 'สแกนเครื่อง'}
          </button>
        }
      />

      {error && (
        <div className="flex items-center gap-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-4 py-3 animate-fade-up">
          <AlertCircle size={15} className="shrink-0" /> {error}
        </div>
      )}

      {/* Wi-Fi connect */}
      <div className="flex items-center gap-2 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <input
          value={ip}
          onChange={e => setIp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && connect()}
          placeholder="เชื่อมต่อผ่าน Wi-Fi: 192.168.x.x"
          className="bg-surface border border-line text-ink text-sm px-3.5 py-2.5 rounded-lg w-64 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute transition-all"
        />
        <button onClick={connect}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-ink-dim bg-surface border border-line hover:border-accent hover:text-accent transition-all">
          <Wifi size={14} /> เชื่อมต่อ
        </button>
      </div>

      {/* Device list */}
      <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: '80ms' }}>
        {state.devices.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface shadow-card p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center mx-auto mb-4">
              <Smartphone size={24} className="text-ink-mute" />
            </div>
            <p className="text-ink font-semibold mb-1">ยังไม่พบเครื่อง</p>
            <p className="text-ink-dim text-sm">ต่อสาย USB และเปิด USB Debugging แล้วกดสแกน</p>
          </div>
        ) : state.devices.map(d => <DeviceCard key={d.serial} device={d} />)}
      </div>
    </div>
  )
}
