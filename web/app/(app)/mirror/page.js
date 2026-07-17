'use client'
import { useState, useEffect, useRef } from 'react'
import { useApp }           from '../layout'
import { MirrorFullscreen } from '@/components/mirror/MirrorFullscreen'
import { PageHeader }       from '@/components/layout/PageHeader'
import { Button }           from '@/components/ui/Button'
import { GatedButton }      from '@/components/ui/GatedButton'
import { Input }            from '@/components/ui/input'
import { InfoTooltip }      from '@/components/ui/InfoTooltip'
import { api }              from '@/lib/api'
import { termHint, MSG }    from '@/lib/copy'
import { PLAT_META }        from '@/lib/platform-meta'
import { deviceReadiness }  from '@/lib/device-readiness'
import {
  RefreshCw, Wifi, AlertCircle, Smartphone, Send, Snowflake, Thermometer,
  BatteryMedium, BatteryCharging, Maximize2, User, Sparkles, CheckCircle2,
} from 'lucide-react'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const FARM_SIZE = 20   // จำนวนช่องในฟาร์ม (โชว์ค้างไว้ รอเชื่อมต่อ)

export default function MirrorFarmPage() {
  const { state, patch } = useApp()
  const [scanning, setScanning] = useState(false)
  const [ip, setIp]   = useState('')
  const [error, setError] = useState('')
  const [fs, setFs]   = useState(null)
  const [ts, setTs]   = useState(0)
  const [platforms, setPlatforms] = useState([])
  const started = useRef(new Set())

  const devices = state.devices || []
  const online  = devices.filter(d => d.status === 'device')
  const ready   = state.ws_connected   // ต้องเชื่อมต่อโปรแกรมหลักก่อน จึงสแกน/เชื่อมมือถือได้

  useEffect(() => { api.platforms().then(d => setPlatforms(d.platforms || [])).catch(() => {}) }, [])

  // auto-stream ทุกเครื่องที่ออนไลน์ + tick ภาพทุก ~1.2 วิ
  useEffect(() => {
    online.forEach(d => {
      if (!d.streaming && !started.current.has(d.serial)) {
        started.current.add(d.serial)
        api.mirrorStart(d.serial).catch(() => {})
      }
    })
    const id = setInterval(() => setTs(Date.now()), 1200)
    return () => clearInterval(id)
  }, [online.map(d => d.serial).join(',')])

  useEffect(() => () => { api.mirrorStopAll?.().catch(() => {}) }, [])

  const scan = async () => {
    setScanning(true); setError('')
    try { const r = await api.scan(); patch({ devices: r.devices }) }
    catch { setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — เปิด backend ก่อน') }
    finally { setScanning(false) }
  }
  const connect = async () => {
    if (!ip.trim()) return
    try { await api.wifiConnect(ip.trim()); setIp('') } catch { setError('เชื่อมต่อไม่สำเร็จ') }
  }

  if (fs) return <MirrorFullscreen device={online.find(d => d.serial === fs)} platforms={platforms} onBack={() => setFs(null)} />

  const posting = online.filter(d => d.activity === 'posting').length
  const cooling = online.filter(d => d.activity === 'cooldown').length
  const temps   = online.map(d => d.temp).filter(t => t > 0)
  const avgTemp = temps.length ? (temps.reduce((a, t) => a + t, 0) / temps.length).toFixed(1) : null
  const needSetup = online.filter(d => !deviceReadiness(d).ready).length

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="ฟาร์มมือถือ"
        subtitle={`${online.length} เครื่องออนไลน์ · ดูจอสดทุกเครื่องพร้อมกัน · คลิกเพื่อคุมเครื่อง`}
        action={
          <div className="flex items-center gap-2">
            <Input value={ip} onChange={e => setIp(e.target.value)} onKeyDown={e => e.key === 'Enter' && ready && connect()}
                   placeholder="Wi-Fi: 192.168.x.x" disabled={!ready} className="w-40" />
            <InfoTooltip text={termHint('wifi_adb')} />
            <Button variant="outline" size="icon" onClick={connect} disabled={!ready}
                    title={!ready ? MSG.needDesktop : undefined}><Wifi size={15} /></Button>
            <GatedButton ready={ready} reason={MSG.needDesktop} onClick={scan} disabled={scanning}>
              <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} strokeWidth={2.5} /> สแกน
            </GatedButton>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 animate-fade-up">
        <FleetStat icon={Smartphone}  label="ออนไลน์"       value={`${online.length}/${FARM_SIZE}`} accent />
        <FleetStat icon={Send}        label="กำลังโพสต์"    value={posting} />
        <FleetStat icon={Snowflake}   label="พักเครื่อง"    value={cooling} warn={cooling > 0} />
        <FleetStat icon={Thermometer} label="อุณหภูมิเฉลี่ย" value={avgTemp ? `${avgTemp}°C` : '—'} />
      </div>

      {/* แบนเนอร์เตรียมเครื่อง (setup ง่าย) */}
      {needSetup > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent-wash px-5 py-3.5 animate-fade-up">
          <Sparkles size={18} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-sm font-semibold">มี {needSetup} เครื่องยังตั้งค่าไม่ครบ</p>
            <p className="text-muted-foreground text-[11px]">ติดตั้ง ADBKeyboard · ตั้งจอไม่ดับ/ปลดล็อก · จูนพิกัดรุ่น — คลิกการ์ดเครื่องเพื่อตั้งค่าทีละเครื่อง</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:gap-5 animate-fade-up"
           style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {Array.from({ length: Math.max(FARM_SIZE, online.length) }).map((_, i) => (
          online[i]
            ? <PhoneCard key={online[i].serial} device={online[i]} ts={ts} index={i} onOpen={() => setFs(online[i].serial)} />
            : <EmptySlot key={`slot-${i}`} n={i + 1} />
        ))}
      </div>
    </div>
  )
}

function PhoneCard({ device, ts, index, onOpen }) {
  const { serial, model, label, battery, charging, temp, activity, streaming, platforms = [] } = device
  const thumb = streaming && ts ? `${BASE}/snapshot/${serial}?_=${ts}` : null
  const act = activity === 'posting' ? { label: 'กำลังโพสต์', cls: 'bg-accent text-white' }
    : activity === 'cooldown' ? { label: 'พักเครื่อง', cls: 'bg-amber-500 text-white' }
    : { label: 'ว่าง', cls: 'bg-black/55 text-white' }

  return (
    <div className="group lift rounded-3xl overflow-hidden border border-border bg-card shadow-card animate-fade-up"
         style={{ animationDelay: `${Math.min(index, 16) * 40}ms` }}>
      <button onClick={onOpen} className="relative block w-full aspect-[9/19.5] bg-black overflow-hidden">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-ink-mute">
              <Smartphone size={26} /><span className="text-[10px]">กำลังเชื่อมจอ…</span>
            </div>}

        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
          {streaming
            ? <span className="flex items-center gap-1 bg-black/55 rounded-full px-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" /><span className="text-[8px] text-success font-black tracking-wide">LIVE</span></span>
            : <span />}
          {battery > 0 && (
            <span className={`flex items-center gap-1 bg-black/55 rounded-full px-2 py-0.5 text-[10px] font-bold ${battery <= 20 ? 'text-danger' : 'text-white'}`}>
              {charging ? <BatteryCharging size={11} /> : <BatteryMedium size={11} />}{battery}%
            </span>
          )}
        </div>

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${act.cls}`}>
            {activity === 'cooldown' && <Snowflake size={9} className="inline mr-0.5" />}{act.label}
          </span>
          {temp > 0 && <span className={`flex items-center gap-0.5 bg-black/55 rounded-full px-2 py-0.5 text-[9px] font-bold ${temp >= 45 ? 'text-danger' : 'text-white'}`}><Thermometer size={9} />{temp.toFixed(0)}°</span>}
        </div>

        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 opacity-0 group-hover:opacity-100 transition-all">
          <span className="flex items-center gap-1.5 text-white text-xs font-semibold bg-black/50 px-3 py-1.5 rounded-full"><Maximize2 size={13} /> คุมเครื่อง</span>
        </span>
      </button>

      <div className="p-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-foreground text-[13px] font-semibold truncate flex items-center gap-1.5">
            {label ? <><User size={12} className="text-accent shrink-0" /> {label}</> : (model || serial)}
          </p>
          <ReadinessChip device={device} />
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {platforms.length === 0
            ? <span className="text-[10px] text-muted-foreground">ยังไม่เลือกแพลตฟอร์ม</span>
            : platforms.map(k => {
                const m = PLAT_META[k]; if (!m) return null
                const Logo = m.Logo
                return <span key={k} className="flex items-center justify-center w-5 h-5 rounded-md bg-secondary" title={m.label}><Logo size={11} color={m.color} /></span>
              })}
        </div>
      </div>
    </div>
  )
}

function EmptySlot({ n }) {
  return (
    <div className="rounded-3xl overflow-hidden border-2 border-dashed border-border bg-card/30">
      <div className="aspect-[9/19.5] flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Smartphone size={24} className="opacity-30" />
        <span className="text-[10px] opacity-60">ว่าง</span>
      </div>
      <div className="p-3">
        <p className="text-muted-foreground text-[12px] font-medium">ช่อง {n}</p>
        <p className="text-muted-foreground text-[10px] mt-1 opacity-60">รอเชื่อมต่อ</p>
      </div>
    </div>
  )
}

function ReadinessChip({ device }) {
  const { done, total, ready } = deviceReadiness(device)
  return (
    <span title="ความพร้อมใช้งาน — คลิกการ์ดเพื่อตั้งค่า"
      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
        ${ready ? 'bg-success/15 text-success' : 'bg-amber-400/15 text-amber-500'}`}>
      {ready ? <CheckCircle2 size={10} /> : <Sparkles size={10} />}
      {ready ? 'พร้อม' : `${done}/${total}`}
    </span>
  )
}

function FleetStat({ icon: Icon, label, value, accent, warn }) {
  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent ? 'bg-accent-wash' : warn ? 'bg-amber-400/15' : 'bg-secondary'}`}>
        <Icon size={16} className={accent ? 'text-accent' : warn ? 'text-amber-500' : 'text-muted-foreground'} />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-extrabold nums leading-none ${warn ? 'text-amber-500' : 'text-foreground'}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  )
}
