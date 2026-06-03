'use client'
import { Smartphone, BatteryMedium, Cpu, Hash, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'

const STATUS = {
  device:       { label: 'Connected',  dot: 'bg-emerald-400', dotGlow: '0 0 8px rgba(52,211,153,0.8)', bar: 'bg-emerald-500', text: 'text-emerald-400' },
  unauthorized: { label: 'Auth Needed',dot: 'bg-amber-400',   dotGlow: '0 0 8px rgba(251,191,36,0.8)', bar: 'bg-amber-500',   text: 'text-amber-400'  },
  offline:      { label: 'Offline',    dot: 'bg-slate-600',   dotGlow: 'none',                         bar: 'bg-slate-700',   text: 'text-slate-500'  },
}

export function DeviceCard({ device }) {
  const { serial, model, android, battery, status } = device
  const s = STATUS[status] ?? STATUS.offline
  const ok = status === 'device'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] transition-all duration-200 hover:border-white/[0.1]"
         style={{ background: '#111120' }}>

      {/* Left bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${s.bar}`} />

      <div className="flex items-center gap-4 pl-5 pr-5 py-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${ok ? 'bg-violet-500/15' : 'bg-white/[0.03]'}`}
             style={ok ? { boxShadow: '0 0 20px rgba(124,58,237,0.15)' } : {}}>
          <Smartphone size={18} className={ok ? 'text-violet-400' : 'text-slate-600'} strokeWidth={1.8} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-white font-semibold text-sm truncate">{model || serial}</span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${s.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0`}
                    style={{ boxShadow: s.dotGlow }} />
              {s.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            {android && (
              <span className="flex items-center gap-1">
                <Cpu size={10} /> Android {android}
              </span>
            )}
            <span className="flex items-center gap-1 font-mono">
              <Hash size={10} /> {serial}
            </span>
            {battery > 0 && (
              <span className={`flex items-center gap-1 ${battery < 20 ? 'text-rose-500' : 'text-slate-600'}`}>
                <BatteryMedium size={11} /> {battery}%
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {ok && (
          <button onClick={() => api.openShopee(serial)}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 px-3 py-1.5 rounded-lg transition-all shrink-0">
            <ExternalLink size={11} /> Shopee
          </button>
        )}
      </div>
    </div>
  )
}
