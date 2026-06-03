'use client'
import { Smartphone, BatteryMedium, Cpu, Hash, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'

const STATUS = {
  device:       { label: 'เชื่อมต่อแล้ว', dot: 'bg-success', text: 'text-success' },
  unauthorized: { label: 'รออนุญาต',     dot: 'bg-accent',  text: 'text-accent'  },
  offline:      { label: 'ออฟไลน์',       dot: 'bg-ink-mute', text: 'text-ink-mute' },
}

export function DeviceCard({ device }) {
  const { serial, model, android, battery, status } = device
  const s = STATUS[status] ?? STATUS.offline
  const ok = status === 'device'

  return (
    <div className="lift rounded-xl bg-surface border border-line shadow-card">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${ok ? 'bg-accent-wash' : 'bg-elevated'}`}>
          <Smartphone size={19} className={ok ? 'text-accent' : 'text-ink-mute'} strokeWidth={1.9} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-ink font-semibold text-sm truncate">{model || serial}</span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${s.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0 ${ok ? 'animate-pulse-dot' : ''}`} />
              {s.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-ink-mute flex-wrap">
            {android && <span className="flex items-center gap-1"><Cpu size={10} /> Android {android}</span>}
            <span className="flex items-center gap-1 font-mono"><Hash size={10} /> {serial}</span>
            {battery > 0 && (
              <span className={`flex items-center gap-1 ${battery < 20 ? 'text-danger' : 'text-ink-mute'}`}>
                <BatteryMedium size={11} /> {battery}%
              </span>
            )}
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
