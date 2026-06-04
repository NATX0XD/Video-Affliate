'use client'
import { useState, useEffect, useCallback } from 'react'
import { api }        from '@/lib/api'
import { PageHeader, JOB_STATUS } from '@/components/layout/PageHeader'
import { Send, Trash2, ListChecks, Loader2 } from 'lucide-react'

// ลำดับขั้นใน pipeline สำหรับแถบความคืบหน้า
const STAGES = ['queued', 'generating', 'generated', 'posting', 'posted']
const STAGE_IDX = { queued: 0, pending: 0, generating: 1, generated: 2, posting: 3, retry: 3, posted: 4, done: 4 }

const FILTERS = [
  { key: 'all',        label: 'ทั้งหมด' },
  { key: 'generated',  label: 'รอเผยแพร่' },
  { key: 'active',     label: 'กำลังทำ' },
  { key: 'posted',     label: 'สำเร็จ' },
  { key: 'error',      label: 'พลาด' },
]

export default function JobsPage() {
  const [jobs, setJobs]   = useState([])
  const [mode, setMode]   = useState('auto')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy]   = useState(null)

  const load = useCallback(async () => {
    try { const d = await api.jobs(); setJobs(d.jobs || []); setMode(d.review_mode || 'auto') } catch {}
  }, [])
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id) }, [load])

  const postNow = async (id) => { setBusy(id); try { await api.postJob(id) } catch {}; setTimeout(() => { setBusy(null); load() }, 1500) }
  const remove  = async (id) => { setBusy(id); try { await api.deleteJob(id) } catch {}; setBusy(null); load() }

  const shown = jobs.filter(j => {
    if (filter === 'all') return true
    if (filter === 'active') return ['generating', 'posting', 'retry'].includes(j.status)
    if (filter === 'posted') return ['posted', 'done'].includes(j.status)
    return j.status === filter
  })

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="งาน" subtitle={`ติดตามคลิปทุกตัวในไปป์ไลน์ · ${jobs.length} งาน`} />

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap animate-fade-up">
        {FILTERS.map(f => {
          const n = f.key === 'all' ? jobs.length
            : f.key === 'active' ? jobs.filter(j => ['generating', 'posting', 'retry'].includes(j.status)).length
            : f.key === 'posted' ? jobs.filter(j => ['posted', 'done'].includes(j.status)).length
            : jobs.filter(j => j.status === f.key).length
          const on = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all border
                ${on ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-dim border-line hover:border-accent/40'}`}>
              {f.label} <span className="nums opacity-70">{n}</span>
            </button>
          )
        })}
        {mode === 'hold' && (
          <span className="ml-auto text-[11px] text-accent bg-accent-wash border border-accent/20 px-3 py-1.5 rounded-lg">
            โหมดอนุมัติเอง — กด "โพสต์เลย" เพื่อเผยแพร่
          </span>
        )}
      </div>

      {/* Job list */}
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card p-16 text-center animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center mx-auto mb-4">
            <ListChecks size={24} className="text-ink-mute" />
          </div>
          <p className="text-ink font-semibold mb-1">ยังไม่มีงาน</p>
          <p className="text-ink-dim text-sm">คลิปที่ extension สร้างเสร็จจะมาแสดงที่นี่</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: '60ms' }}>
          {shown.map((j) => {
            const s = JOB_STATUS[j.status] ?? JOB_STATUS.pending
            const step = STAGE_IDX[j.status] ?? 0
            const isErr = j.status === 'error'
            return (
              <div key={j.id} className="rounded-xl bg-surface border border-line shadow-card p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm font-medium truncate">{j.name || 'ไม่มีชื่อ'}</p>
                    <p className="text-ink-mute text-xs nums">
                      {j.price ? `฿${Number(j.price).toLocaleString()}` : '—'}
                      {j.attempts > 0 ? ` · ลองแล้ว ${j.attempts} ครั้ง` : ''}
                      {isErr && j.error ? ` · ${j.error}` : ''}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold shrink-0 ${s.cls}`}>
                    {s.spin && <Loader2 size={11} className="animate-spin" />}{s.label}
                  </span>
                  {j.status === 'generated' && (
                    <button onClick={() => postNow(j.id)} disabled={busy === j.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-accent hover:bg-accent-soft transition-all active:scale-[.97] disabled:opacity-50 shrink-0">
                      {busy === j.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} โพสต์เลย
                    </button>
                  )}
                  <button onClick={() => remove(j.id)} disabled={busy === j.id}
                    className="p-2 rounded-lg text-ink-mute hover:text-danger hover:bg-danger/10 transition-all shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Progress stepper */}
                <div className="flex items-center gap-1 mt-3">
                  {STAGES.map((st, i) => (
                    <div key={st} className={`h-1 flex-1 rounded-full transition-colors
                      ${isErr ? (i <= step ? 'bg-danger/50' : 'bg-line')
                              : (i <= step ? 'bg-accent' : 'bg-line')}`} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
