'use client'
import { useState, useEffect } from 'react'
import { useApp }          from '../layout'
import { MirrorFullscreen } from '@/components/mirror/MirrorFullscreen'
import { api }             from '@/lib/api'
import { PageHeader }      from '@/components/layout/PageHeader'
import {
  Play, Square, RefreshCw, Wifi, Maximize2, ExternalLink,
  BatteryMedium, Tag, Smartphone
} from 'lucide-react'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function DevicesManagePage() {
  const { state, patch } = useApp()
  const [scanning, setScanning] = useState(false)
  const [ip, setIp]   = useState('')
  const [fs, setFs]   = useState(null)        // serial → fullscreen
  const [platforms, setPlatforms] = useState([])

  const connected = state.devices.filter(d => d.status === 'device')

  useEffect(() => { api.platforms().then(d => setPlatforms(d.platforms || [])).catch(() => {}) }, [])

  const scan = async () => {
    setScanning(true)
    try { const r = await api.scan(); patch({ devices: r.devices }) } catch {}
    setScanning(false)
  }
  const connect = async () => { if (ip.trim()) { try { await api.wifiConnect(ip.trim()); setIp('') } catch {} } }

  if (fs) {
    const dev = connected.find(d => d.serial === fs)
    return <MirrorFullscreen device={dev} onBack={() => setFs(null)} />
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="จัดการมือถือ"
        subtitle={`${connected.length} เครื่องเชื่อมต่อ · ตั้งบัญชีและแพลตฟอร์มต่อเครื่องได้`}
        action={
          <div className="flex items-center gap-2">
            <input value={ip} onChange={e => setIp(e.target.value)} onKeyDown={e => e.key === 'Enter' && connect()}
              placeholder="Wi-Fi: 192.168.x.x"
              className="bg-surface border border-line text-ink text-sm px-3 py-2.5 rounded-lg w-40 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute" />
            <button onClick={connect} className="p-2.5 rounded-lg text-ink-dim bg-surface border border-line hover:border-accent hover:text-accent transition-all"><Wifi size={16} /></button>
            <button onClick={scan} disabled={scanning}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-soft transition-all active:scale-[.98] disabled:opacity-50">
              <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} /> สแกน
            </button>
          </div>
        }
      />

      {connected.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card p-16 text-center animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center mx-auto mb-4">
            <Smartphone size={24} className="text-ink-mute" />
          </div>
          <p className="text-ink font-semibold mb-1">ยังไม่พบมือถือ</p>
          <p className="text-ink-dim text-sm">ต่อสาย USB + เปิด USB Debugging แล้วกด "สแกน"</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {connected.map((d, i) => (
            <DeviceCard key={d.serial} device={d} platforms={platforms}
              onFullscreen={() => setFs(d.serial)} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function DeviceCard({ device, platforms, onFullscreen, index }) {
  const [label, setLabel] = useState(device.label || '')
  const [plats, setPlats] = useState(device.platforms || [])
  const [ts, setTs] = useState(0)
  const streaming = device.streaming

  useEffect(() => { setLabel(device.label || ''); setPlats(device.platforms || []) }, [device.serial])
  useEffect(() => {
    if (!streaming) { setTs(0); return }
    const id = setInterval(() => setTs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [device.serial, streaming])

  const saveLabel = () => api.setDeviceLabel(device.serial, label).catch(() => {})
  const togglePlat = (key) => {
    const next = plats.includes(key) ? plats.filter(k => k !== key) : [...plats, key]
    setPlats(next); api.setDevicePlatforms(device.serial, next).catch(() => {})
  }
  const toggleStream = () => streaming ? api.mirrorStop(device.serial) : api.mirrorStart(device.serial)
  const thumb = streaming && ts ? `${BASE}/snapshot/${device.serial}?_=${ts}` : null

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-4 flex gap-4 animate-fade-up"
         style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}>
      {/* Thumbnail */}
      <button onClick={onFullscreen}
        className="relative w-[88px] aspect-[9/16] rounded-xl overflow-hidden bg-black shrink-0 border border-line group">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full" style={{ objectFit: 'fill' }} />
          : <div className="w-full h-full flex items-center justify-center"><Smartphone size={22} className="text-ink-mute" /></div>}
        {streaming && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 rounded-full px-1.5 py-0.5">
            <span className="w-1 h-1 rounded-full bg-success animate-pulse-dot" /><span className="text-[8px] text-success font-black">LIVE</span>
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100">
          <Maximize2 size={18} className="text-white" />
        </span>
      </button>

      {/* Info + controls */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        {/* Label */}
        <div className="relative">
          <Tag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input value={label} onChange={e => setLabel(e.target.value)} onBlur={saveLabel}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder="ชื่อบัญชี / ป้ายเครื่อง"
            className="w-full bg-elevated border border-line text-ink text-sm font-medium pl-7 pr-2 py-1.5 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-[11px] text-ink-mute">
          <span className="font-mono truncate">{device.model || device.serial}</span>
          {device.battery > 0 && <span className={`flex items-center gap-1 ${device.battery < 20 ? 'text-danger' : ''}`}><BatteryMedium size={11} />{device.battery}%</span>}
        </div>

        {/* Platforms */}
        <div>
          <p className="text-ink-mute text-[10px] font-bold uppercase tracking-wider mb-1.5">โพสต์ไปที่</p>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map(p => {
              const on = plats.includes(p.key)
              return (
                <button key={p.key} onClick={() => p.ready && togglePlat(p.key)} disabled={!p.ready}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40
                    ${on ? 'bg-accent text-white border-accent' : 'bg-elevated text-ink-dim border-line hover:border-accent/40'}`}>
                  {p.label}{!p.ready && ' •'}
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-1">
          <button onClick={toggleStream}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${streaming ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-success/10 text-success border border-success/20'}`}>
            {streaming ? <Square size={11} className="fill-current" /> : <Play size={11} className="fill-current" />}
            {streaming ? 'หยุด' : 'ดูสด'}
          </button>
          <button onClick={() => api.openShopee(device.serial)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-ink-dim bg-elevated border border-line hover:border-accent hover:text-accent transition-all">
            <ExternalLink size={11} /> Shopee
          </button>
        </div>
      </div>
    </div>
  )
}
