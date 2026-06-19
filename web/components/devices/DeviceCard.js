'use client'
import { Smartphone, BatteryMedium, BatteryCharging, Hash, Thermometer, Snowflake, Send,
         MemoryStick, HardDrive, Wifi, WifiOff, Signal, Cpu, User } from 'lucide-react'
import { PLAT_META } from '@/lib/platform-meta'

const NET = {
  wifi:    { Icon: Wifi,    label: 'Wi-Fi',     cls: 'text-muted-foreground' },
  mobile:  { Icon: Signal,  label: 'เน็ตมือถือ', cls: 'text-muted-foreground' },
  offline: { Icon: WifiOff, label: 'ไม่มีเน็ต',   cls: 'text-danger' },
}

const STATUS = {
  device:       { label: 'เชื่อมต่อแล้ว', dot: 'bg-success',    text: 'text-success' },
  unauthorized: { label: 'รออนุญาต',     dot: 'bg-accent',     text: 'text-accent'  },
  offline:      { label: 'ออฟไลน์',       dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
}

const tempCls = (t) => (t >= 45 ? 'text-danger' : t >= 41 ? 'text-amber-500' : 'text-muted-foreground')
const fmtMin = (sec) => (sec >= 60 ? `${Math.ceil(sec / 60)} นาที` : `${sec} วิ`)

export function DeviceCard({ device }) {
  const { serial, model, android, battery, status, temp, charging,
          activity, cooldown_reason, cooldown_remaining,
          ram_total, ram_used, storage_total, storage_free, net,
          label, platforms = [] } = device
  const s = STATUS[status] ?? STATUS.offline
  const ok = status === 'device'
  const ramPct  = ram_total ? Math.round((ram_used / ram_total) * 100) : 0
  const batColor = battery <= 20 ? 'bg-danger' : charging ? 'bg-success' : 'bg-accent'

  return (
    <div className="lift rounded-2xl bg-card text-card-foreground border border-border shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${ok ? 'bg-accent-wash' : 'bg-secondary'}`}>
          <Smartphone size={19} className={ok ? 'text-accent' : 'text-muted-foreground'} strokeWidth={1.9} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-foreground font-semibold text-sm truncate">{model || serial}</span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${s.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0 ${ok ? 'animate-pulse-dot' : ''}`} />
              {s.label}
            </span>
            {ok && <ActivityBadge activity={activity} reason={cooldown_reason} remaining={cooldown_remaining} />}
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
            {label && <span className="flex items-center gap-1 text-accent font-medium"><User size={10} /> {label}</span>}
            <span className="flex items-center gap-1 font-mono truncate"><Hash size={10} /> {serial}</span>
            {android && <span className="hidden sm:flex items-center gap-1"><Cpu size={10} /> {android}</span>}
          </div>
        </div>
      </div>

      {ok && (
        <div className="px-5 pb-4 flex flex-col gap-3">
          {/* Battery bar */}
          {battery > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">แบตเตอรี่</span>
                <span className={`flex items-center gap-1 font-semibold nums ${battery <= 20 ? 'text-danger' : charging ? 'text-success' : 'text-foreground'}`}>
                  {charging ? <BatteryCharging size={12} /> : <BatteryMedium size={12} />} {battery}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full transition-all ${batColor}`} style={{ width: `${battery}%` }} />
              </div>
            </div>
          )}

          {/* Metric chips */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
            {temp > 0 && <span className={`flex items-center gap-1 ${tempCls(temp)}`}><Thermometer size={12} /> {temp.toFixed(1)}°C</span>}
            {ram_total > 0 && <span className="flex items-center gap-1" title={`RAM ${ram_used}/${ram_total} MB`}><MemoryStick size={12} /> {ramPct}%</span>}
            {storage_total > 0 && <span className={`flex items-center gap-1 ${storage_free < 2 ? 'text-amber-500' : ''}`} title={`เหลือ ${storage_free}/${storage_total} GB`}><HardDrive size={12} /> {storage_free}GB</span>}
            {net && (() => { const n = NET[net] ?? NET.offline; return <span className={`flex items-center gap-1 ${n.cls}`}><n.Icon size={12} /> {n.label}</span> })()}
          </div>

          {/* Platform chips (โลโก้แพลตฟอร์มที่เครื่องนี้โพสต์) */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/60">
            <span className="text-[10px] text-muted-foreground mr-0.5">โพสต์ไป:</span>
            {platforms.length === 0 ? (
              <span className="text-[10px] text-muted-foreground">ทุกแพลตฟอร์มที่เลือก</span>
            ) : platforms.map(k => {
              const m = PLAT_META[k]
              if (!m) return null
              const Logo = m.Logo
              return (
                <span key={k} className="flex items-center gap-1 text-[10px] font-medium bg-secondary rounded-full pl-1.5 pr-2 py-0.5">
                  <Logo size={11} color={m.color} /> {m.label}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityBadge({ activity, reason, remaining }) {
  if (activity === 'cooldown') {
    const hot = reason === 'hot'
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-500">
        <Snowflake size={10} />
        {hot ? `พักเครื่อง (ร้อน)${remaining > 0 ? ` · ${fmtMin(remaining)}` : ''}` : 'พักเครื่อง (ชาร์จ)'}
      </span>
    )
  }
  if (activity === 'posting') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-wash text-accent">
        <Send size={10} /> กำลังโพสต์
      </span>
    )
  }
  if (activity === 'idle') {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">ว่าง</span>
  }
  return null
}
