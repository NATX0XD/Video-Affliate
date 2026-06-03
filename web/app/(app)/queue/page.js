'use client'
import { useApp } from '../layout'
import { ListOrdered, Loader2, CheckCircle2, XCircle, Clock, Trash2 } from 'lucide-react'

const STATUS = {
  pending:    { label: 'รอ',          icon: Clock,        cls: 'text-slate-500  bg-slate-500/10  border-slate-500/20'  },
  generating: { label: 'สร้างวิดีโอ', icon: Loader2,      cls: 'text-sky-400    bg-sky-500/10    border-sky-500/20', spin: true },
  posting:    { label: 'กำลังโพสต์', icon: Loader2,      cls: 'text-amber-400  bg-amber-500/10  border-amber-500/20', spin: true },
  done:       { label: 'สำเร็จ',      icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  error:      { label: 'ผิดพลาด',     icon: XCircle,      cls: 'text-rose-400   bg-rose-500/10   border-rose-500/20'   },
}

export default function QueuePage() {
  const { state, patch } = useApp()
  const items = state.queueItems ?? []

  const clear = () => patch({ queueItems: [], currentItem: null })

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base">Product Queue</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {items.length} รายการ · รอ {items.filter(i => i.status === 'pending').length} · สำเร็จ {items.filter(i => i.status === 'done').length}
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={clear}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-rose-500/10 border border-white/[0.06] transition-all">
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] p-16 text-center" style={{ background: '#111120' }}>
          <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
            <ListOrdered size={20} className="text-slate-600" />
          </div>
          <p className="text-slate-400 font-medium mb-1">Queue ว่าง</p>
          <p className="text-slate-600 text-sm">ส่งสินค้าจาก Chrome Extension แล้วกด Start Auto Pilot</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => {
            const s = STATUS[item.status] ?? STATUS.pending
            const Icon = s.icon
            return (
              <div key={item.pid ?? i}
                   className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/[0.06] transition-all"
                   style={{ background: '#111120' }}>
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                  <span className="text-slate-600 text-[11px] font-bold tabular-nums">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.name || 'ไม่มีชื่อ'}</p>
                  <p className="text-slate-600 text-xs mt-0.5 tabular-nums">
                    {item.price ? `฿${Number(item.price).toLocaleString()}` : '—'}
                    {item.commission ? ` · ${item.commission}% commission` : ''}
                  </p>
                </div>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold shrink-0 ${s.cls}`}>
                  <Icon size={10} className={s.spin ? 'animate-spin' : ''} />
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
