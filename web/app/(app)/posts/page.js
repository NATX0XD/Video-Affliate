'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { CheckCircle2, XCircle, Clock, TrendingUp, Filter } from 'lucide-react'

const PLATFORM_META = {
  shopee:    { label: 'Shopee Video',    color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  tiktok:    { label: 'TikTok',          color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20' },
  reels:     { label: 'Facebook Reels',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  instagram: { label: 'Instagram Reels', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  youtube:   { label: 'YouTube Shorts',  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60)  return `${diff} วิ`
  if (diff < 3600) return `${Math.floor(diff / 60)} นาที`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.`
  return `${Math.floor(diff / 86400)} วัน`
}

function timeStr(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function SummaryCard({ platKey, data }) {
  const meta = PLATFORM_META[platKey] || { label: platKey, color: 'text-ink', bg: 'bg-elevated border-line' }
  const rate = data?.success_rate
  const rateColor = rate == null ? 'text-ink-mute' : rate >= 80 ? 'text-success' : rate >= 50 ? 'text-amber-400' : 'text-danger'

  return (
    <div className="rounded-2xl bg-card border border-border shadow-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${meta.bg} ${meta.color}`}>
          {meta.label}
        </span>
        {data?.last_ts && (
          <span className="text-[10px] text-ink-mute flex items-center gap-1">
            <Clock size={10} /> {timeAgo(data.last_ts)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-ink-mute">วันนี้</p>
          <p className="text-xl font-extrabold text-ink nums">{data?.today ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-mute">เดือนนี้</p>
          <p className="text-xl font-extrabold text-ink nums">{data?.month ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-mute">สำเร็จ</p>
          <p className={`text-xl font-extrabold nums ${rateColor}`}>
            {rate != null ? `${rate}%` : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PostsPage() {
  const [summary, setSummary] = useState({})
  const [recent, setRecent]   = useState([])
  const [filter, setFilter]   = useState('all')

  const load = useCallback(async () => {
    try {
      const d = await api.postResults()
      setSummary(d.summary || {})
      setRecent(d.recent || [])
    } catch {}
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [load])

  const platforms = Object.keys(PLATFORM_META)
  const shown = filter === 'all' ? recent : recent.filter(r => r.platform === filter)

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="animate-fade-up">
        <h2 className="text-ink text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ผลการโพสต์</h2>
        <p className="text-ink-dim text-sm mt-2">ติดตามผลแบบ real-time แยกตามแพลตฟอร์ม</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 animate-fade-up">
        {platforms.map(k => (
          <SummaryCard key={k} platKey={k} data={summary[k]} />
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap animate-fade-up">
        <Filter size={13} className="text-ink-mute" />
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            ${filter === 'all' ? 'bg-accent-wash text-accent' : 'text-ink-dim hover:text-ink hover:bg-elevated'}`}>
          ทั้งหมด <span className="ml-1 nums">{recent.length}</span>
        </button>
        {platforms.map(k => {
          const meta = PLATFORM_META[k]
          const cnt  = recent.filter(r => r.platform === k).length
          return (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${filter === k ? 'bg-accent-wash text-accent' : 'text-ink-dim hover:text-ink hover:bg-elevated'}`}>
              {meta.label} <span className="ml-1 nums">{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Recent feed */}
      <div className="flex flex-col gap-2 animate-fade-up">
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-16 text-center">
            <TrendingUp size={28} className="text-ink-mute mx-auto mb-3" />
            <p className="text-ink font-semibold">ยังไม่มีผลการโพสต์</p>
            <p className="text-ink-mute text-sm mt-1">ผลจะปรากฏที่นี่ทันทีหลังระบบโพสต์</p>
          </div>
        ) : shown.map((r, i) => {
          const meta = PLATFORM_META[r.platform] || { label: r.platform, color: 'text-ink', bg: 'bg-elevated border-line' }
          return (
            <div key={i}
              className="flex items-center gap-4 rounded-xl bg-card border border-border shadow-card px-4 py-3">
              {r.ok
                ? <CheckCircle2 size={18} className="text-success shrink-0" />
                : <XCircle     size={18} className="text-danger shrink-0" />}

              <div className="flex-1 min-w-0">
                <p className="text-ink text-sm font-medium truncate">{r.job_name || 'ไม่มีชื่อ'}</p>
              </div>

              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border shrink-0 ${meta.bg} ${meta.color}`}>
                {meta.label}
              </span>

              <span className="text-[11px] text-ink-mute nums shrink-0 w-10 text-right">
                {timeStr(r.ts)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
