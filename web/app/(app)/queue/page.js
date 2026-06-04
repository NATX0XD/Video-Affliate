'use client'
import { useApp } from '../layout'
import { PageHeader, JOB_STATUS } from '@/components/layout/PageHeader'
import { ListOrdered, Loader2, CheckCircle2, XCircle, Clock, Trash2 } from 'lucide-react'

const ICON = {
  pending: Clock, queued: Clock, generating: Loader2, generated: ListOrdered,
  posting: Loader2, retry: Loader2, done: CheckCircle2, posted: CheckCircle2, error: XCircle,
}

export default function QueuePage() {
  const { state, patch } = useApp()
  const items = state.queueItems ?? []
  const clear = () => patch({ queueItems: [], currentItem: null })

  const waiting = items.filter(i => ['pending', 'queued'].includes(i.status)).length
  const done    = items.filter(i => ['done', 'posted'].includes(i.status)).length

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="คิวงาน"
        subtitle={`${items.length} รายการ · รอ ${waiting} · สำเร็จ ${done}`}
        action={items.length > 0 && (
          <button onClick={clear}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-dim hover:text-danger px-3 py-2 rounded-lg bg-surface border border-line hover:border-danger/30 transition-all">
            <Trash2 size={13} /> ล้างคิว
          </button>
        )}
      />

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: '60ms' }}>
          {items.map((item, i) => {
            const s = JOB_STATUS[item.status] ?? JOB_STATUS.pending
            const Icon = ICON[item.status] ?? Clock
            return (
              <div key={item.pid ?? i}
                   className="flex items-center gap-4 px-5 py-4 rounded-xl bg-surface border border-line shadow-card">
                <div className="w-7 h-7 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                  <span className="text-ink-mute text-[11px] font-bold nums">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm font-medium truncate">{item.name || 'ไม่มีชื่อ'}</p>
                  <p className="text-ink-mute text-xs mt-0.5 nums">
                    {item.price ? `฿${Number(item.price).toLocaleString()}` : '—'}
                    {item.commission ? ` · ค่าคอม ${item.commission}%` : ''}
                  </p>
                </div>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold shrink-0 ${s.cls}`}>
                  <Icon size={11} className={s.spin ? 'animate-spin' : ''} />
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card p-16 text-center animate-fade-up">
      <div className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center mx-auto mb-4">
        <ListOrdered size={24} className="text-ink-mute" />
      </div>
      <p className="text-ink font-semibold mb-1">ยังไม่มีงานในคิว</p>
      <p className="text-ink-dim text-sm">ส่งสินค้าจาก Chrome Extension แล้วเริ่มออโต้ไพลอต</p>
    </div>
  )
}
