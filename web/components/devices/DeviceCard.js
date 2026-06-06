'use client'
import { Smartphone, BatteryMedium, BatteryCharging, Cpu, Hash, ExternalLink, Thermometer, Snowflake, Send,
         MemoryStick, HardDrive, Wifi, WifiOff, Signal } from 'lucide-react'
import { api } from '@/lib/api'

const NET = {
  wifi:    { Icon: Wifi,    label: 'Wi-Fi',   cls: 'text-ink-mute' },
  mobile:  { Icon: Signal,  label: 'เน็ตมือถือ', cls: 'text-ink-mute' },
  offline: { Icon: WifiOff, label: 'ไม่มีเน็ต',  cls: 'text-danger'   },
}

const STATUS = {
  device:       { label: 'เชื่อมต่อแล้ว', dot: 'bg-success', text: 'text-success' },
  unauthorized: { label: 'รออนุญาต',     dot: 'bg-accent',  text: 'text-accent'  },
  offline:      { label: 'ออฟไลน์',       dot: 'bg-ink-mute', text: 'text-ink-mute' },
}

// อุณหภูมิแบต → สี (ร้อนขึ้น = แดงขึ้น)
const tempCls = (t) => (t >= 45 ? 'text-danger' : t >= 41 ? 'text-amber-500' : 'text-ink-mute')

const fmtMin = (sec) => (sec >= 60 ? `${Math.ceil(sec / 60)} นาที` : `${sec} วิ`)

export function DeviceCard({ device }) {
  const { serial, model, android, battery, status, temp, charging,
          activity, cooldown_reason, cooldown_remaining,
          ram_total, ram_used, storage_total, storage_free, net } = device
  const s = STATUS[status] ?? STATUS.offline
  const ok = status === 'device'

  return (
    <div className="lift rounded-xl bg-surface border border-line shadow-card">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${ok ? 'bg-accent-wash' : 'bg-elevated'}`}>
          <Smartphone size={19} className={ok ? 'text-accent' : 'text-ink-mute'} strokeWidth={1.9} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-ink font-semibold text-sm truncate">{model || serial}</span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${s.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0 ${ok ? 'animate-pulse-dot' : ''}`} />
              {s.label}
            </span>
            {ok && <ActivityBadge activity={activity} reason={cooldown_reason} remaining={cooldown_remaining} />}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-ink-mute flex-wrap">
            {android && <span className="flex items-center gap-1"><Cpu size={10} /> Android {android}</span>}
            <span className="flex items-center gap-1 font-mono"><Hash size={10} /> {serial}</span>
            {battery > 0 && (
              <span className={`flex items-center gap-1 ${battery < 20 ? 'text-danger' : charging ? 'text-success' : 'text-ink-mute'}`}>
                {charging ? <BatteryCharging size={11} /> : <BatteryMedium size={11} />} {battery}%
              </span>
            )}
            {temp > 0 && (
              <span className={`flex items-center gap-1 ${tempCls(temp)}`}>
                <Thermometer size={11} /> {temp.toFixed(1)}°C
              </span>
            )}
            {ram_total > 0 && (
              <span className="flex items-center gap-1" title={`RAM ${ram_used}/${ram_total} MB`}>
                <MemoryStick size={11} /> {Math.round((ram_used / ram_total) * 100)}%
              </span>
            )}
            {storage_total > 0 && (
              <span className={`flex items-center gap-1 ${storage_free < 2 ? 'text-amber-500' : ''}`}
                    title={`พื้นที่เหลือ ${storage_free} / ${storage_total} GB`}>
                <HardDrive size={11} /> {storage_free}GB
              </span>
            )}
            {ok && net && (() => {
              const n = NET[net] ?? NET.offline
              return <span className={`flex items-center gap-1 ${n.cls}`}><n.Icon size={11} /> {n.label}</span>
            })()}
          </div>
        </div>

        {ok && (
          <button onClick={() => api.openShopee(serial)}
            className="flex items-center gap-1.5 text-xs font-medium text-accent bg-accent-wash hover:bg-accent/15 px-3 py-2 rounded-lg transition-all shrink-0">
            <ExternalLink size={12} /> Shopee
          </button>
        )}
      </div>
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
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-elevated text-ink-mute">ว่าง</span>
  }
  return null
}
