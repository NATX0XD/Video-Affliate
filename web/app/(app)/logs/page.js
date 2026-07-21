'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'motion/react'
import { ScrollText, Trash2, Pause, Play, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const LEVELS = [
  { id: 'all',     label: 'ทั้งหมด' },
  { id: 'error',   label: 'พลาด' },
  { id: 'warn',    label: 'เตือน' },
  { id: 'success', label: 'สำเร็จ' },
  { id: 'info',    label: 'ข้อมูล' },
]

const LV = {
  error:   { Icon: AlertCircle,   cls: 'text-danger',  dot: 'bg-danger' },
  warn:    { Icon: AlertTriangle, cls: 'text-amber-400', dot: 'bg-amber-400' },
  success: { Icon: CheckCircle2,  cls: 'text-success', dot: 'bg-success' },
  info:    { Icon: Info,          cls: 'text-muted-foreground', dot: 'bg-muted-foreground' },
}

function fmtTime(ts) {
  const n = Number(ts)
  if (!n) return ''
  const d = new Date(n > 1e12 ? n : n * 1000)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function LogsPage() {
  const [logs, setLogs] = useState([])
  const [level, setLevel] = useState('all')
  const [live, setLive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const bottomRef = useRef(null)
  const liveRef = useRef(live); liveRef.current = live

  const load = useCallback(async () => {
    try {
      const d = await api.logs('?limit=400')
      setLogs(d.logs || [])
    } catch { /* toast auto */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => { if (liveRef.current) load() }, 2500)
    return () => clearInterval(id)
  }, [load])

  const shown = useMemo(
    () => (level === 'all' ? logs : logs.filter(l => (l.level || 'info') === level)),
    [logs, level])

  // auto-scroll ลงล่างสุดเมื่อ live + มี log ใหม่
  useEffect(() => { if (live) bottomRef.current?.scrollIntoView({ block: 'end' }) }, [shown.length, live])

  const clear = async () => {
    setClearing(true)
    try { await api.clearLogs(); await load() } catch {}
    finally { setClearing(false) }
  }

  const counts = useMemo(() => {
    const c = { all: logs.length }
    logs.forEach(l => { const k = l.level || 'info'; c[k] = (c[k] || 0) + 1 })
    return c
  }, [logs])

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8 h-full">
      {/* header */}
      <motion.div className="flex items-start justify-between gap-4 flex-wrap shrink-0"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}>
        <div>
          <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">บันทึกการทำงาน</h2>
          <p className="text-muted-foreground text-sm mt-2">
            ทุกขั้นตอน — ดูดสินค้า · สร้างคลิป · โพสต์ · ข้อผิดพลาด (เรียลไทม์)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLive(v => !v)}>
            {live ? <><Pause size={13} /> หยุดไหล</> : <><Play size={13} /> ไหลสด</>}
          </Button>
          <Button variant="outline" size="sm" onClick={clear} disabled={clearing}>
            {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ล้าง
          </Button>
        </div>
      </motion.div>

      {/* level filter */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {LEVELS.map(f => (
          <button key={f.id} onClick={() => setLevel(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
              ${level === f.id ? 'bg-accent-wash text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            {f.label} <span className="nums opacity-70">{counts[f.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* log stream */}
      <div className="flex-1 min-h-0 rounded-2xl border border-border bg-card shadow-card overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-accent" /></div>
        ) : shown.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
              <ScrollText size={24} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">ยังไม่มีบันทึก — เริ่มดูดสินค้า/สร้างคลิปแล้วจะขึ้นที่นี่</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto font-mono text-[12px] leading-relaxed p-3">
            {shown.map((l, i) => {
              const lv = LV[l.level] || LV.info
              return (
                <div key={l.id ?? i} className="flex items-start gap-2.5 px-2 py-1 rounded hover:bg-secondary/40">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${lv.dot}`} />
                  <span className="text-muted-foreground/60 shrink-0 tabular-nums">{fmtTime(l.ts)}</span>
                  {l.source && <span className="text-accent/70 shrink-0">[{l.source}]</span>}
                  <span className={`break-words ${lv.cls}`}>{l.message}</span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}
