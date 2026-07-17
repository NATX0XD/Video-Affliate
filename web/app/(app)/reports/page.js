'use client'
import { useState, useEffect, useCallback } from 'react'
import { api }        from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard }   from '@/components/dashboard/StatCard'
import { BarChart }   from '@/components/charts/BarChart'
import {
  CheckCircle2, Percent, Wallet, Coins, RefreshCw, AlertCircle, BarChart3
} from 'lucide-react'

const fmtTime = t => t ? new Date(t * 1000).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const baht = n => `฿${Number(n || 0).toLocaleString('th-TH')}`

export default function ReportsPage() {
  const [r, setR] = useState(null)
  const [loading, setLoading] = useState(false)

  // manual=true เฉพาะตอนกดปุ่มรีเฟรช → spinner หมุน; auto-poll เงียบ ไม่หมุนทุก 10 วิ
  const load = useCallback(async (manual = false) => {
    if (manual) setLoading(true)
    try { setR(await api.reports()) } catch {}
    if (manual) setLoading(false)
  }, [])
  useEffect(() => { load(); const id = setInterval(() => load(), 10000); return () => clearInterval(id) }, [load])

  const t = r?.totals || {}
  const cost = r?.cost || {}
  const daily = r?.daily || []
  const usage = r?.usage_daily || []
  const bud   = r?.budget || {}
  const mFlow  = bud.month?.flow   || {}
  const mGem   = bud.month?.gemini || {}

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="รายงาน"
        subtitle="สรุปผลการเผยแพร่ ต้นทุน และอัตราสำเร็จ"
        action={
          <button onClick={() => load(true)} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-ink-dim bg-surface border border-line hover:border-accent hover:text-accent transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <StatCard index={0} icon={CheckCircle2} label="เผยแพร่สำเร็จ" value={t.posted ?? 0} />
        <StatCard index={1} icon={Percent}      label="อัตราสำเร็จ"  value={`${r?.success_rate ?? 0}%`} />
        <StatCard index={2} icon={Wallet}       label="ต้นทุนเดือนนี้" value={baht(cost.this_month)} />
        <StatCard index={3} icon={Coins}        label="ต้นทุนรวม"     value={baht(cost.total)} />
      </div>

      {/* Chart — การเผยแพร่ (Tremor-style) */}
      <div className="rounded-xl bg-card text-card-foreground border border-border shadow-card p-5 lg:p-6 animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-wash"><BarChart3 size={16} className="text-accent" /></div>
          <span className="text-foreground font-semibold text-sm">การเผยแพร่ย้อนหลัง 14 วัน</span>
          <span className="ml-auto text-[11px] text-muted-foreground nums">รวม {daily.reduce((a, d) => a + d.count, 0)} คลิป</span>
        </div>
        <BarChart data={daily} index="date" categories={['count']} colors={['#a855f7']}
                  labels={{ count: 'โพสต์' }} valueFormatter={(v) => `${v}`} height={200} />
      </div>

      {/* AI usage chart (J) — stacked Tremor-style */}
      <div className="rounded-xl bg-card text-card-foreground border border-border shadow-card p-5 lg:p-6 animate-fade-up" style={{ animationDelay: '150ms' }}>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-wash"><Wallet size={16} className="text-accent" /></div>
          <span className="text-foreground font-semibold text-sm">ค่าใช้จ่าย AI ย้อนหลัง 14 วัน</span>
        </div>
        <p className="text-muted-foreground text-[11px] mb-4 nums">
          เดือนนี้ — Flow {mFlow.qty || 0} คลิป {baht(mFlow.cost)} · Gemini {mGem.qty || 0} ครั้ง {baht(mGem.cost)}
        </p>
        <BarChart data={usage} index="date" categories={['flow', 'gemini']} colors={['#a855f7', '#38bdf8']}
                  labels={{ flow: 'Flow', gemini: 'Gemini' }} valueFormatter={baht} stack height={200} />
      </div>

      {/* Errors */}
      <div className="rounded-xl bg-surface border border-line shadow-card overflow-hidden animate-fade-up" style={{ animationDelay: '180ms' }}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-danger/10"><AlertCircle size={16} className="text-danger" /></div>
          <span className="text-ink font-semibold text-sm">ข้อผิดพลาดล่าสุด</span>
          {r?.errors?.length > 0 && <span className="text-[11px] text-ink-mute bg-elevated px-2 py-0.5 rounded-full nums">{r.errors.length}</span>}
        </div>
        {(!r?.errors || r.errors.length === 0) ? (
          <div className="p-10 text-center text-ink-mute text-sm">ยังไม่มีข้อผิดพลาด</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {r.errors.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <AlertCircle size={14} className="text-danger shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm font-medium truncate">{e.name || 'ไม่มีชื่อ'}</p>
                  <p className="text-ink-mute text-xs truncate">{e.error || '—'} · ลองแล้ว {e.attempts} ครั้ง</p>
                </div>
                <span className="text-[11px] text-ink-mute shrink-0 nums">{fmtTime(e.updated_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
