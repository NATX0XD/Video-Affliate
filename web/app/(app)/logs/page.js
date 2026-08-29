'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'motion/react'
import { ScrollText, Trash2, Pause, Play, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle, ArrowUp } from 'lucide-react'
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
  const boxRef = useRef(null)
  const liveRef = useRef(live); liveRef.current = live
  // ตัวใหม่สุดอยู่ "บนสุด" (API เรียง id DESC) — จอดอยู่ที่บนสุด = ตามของใหม่อยู่
  const [pinned, setPinned] = useState(true)
  const [unread, setUnread] = useState(0)
  const prevTopId = useRef(null)
  const prevHeight = useRef(0)

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

  // ★ ของใหม่มาแล้วห้ามลากจอผู้ใช้ไปเอง
  // เดิมเลื่อนไป "ล่างสุด" ทุกครั้งที่มี log ใหม่ ซึ่งล่างสุด = อันเก่าสุด (เรียงใหม่→เก่า)
  // ทุก 2.5 วิจอเลยกระเด้งไปกองเก่า ต้องเลื่อนกลับขึ้นมาเองตลอด
  // ตอนนี้: จอดบนสุดอยู่ = เลื่อนตามให้ · เลื่อนไปอ่านที่อื่น = อยู่นิ่ง แล้วขึ้นป้ายบอกว่ามีใหม่กี่อัน
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || !shown.length) return
    const topId = shown[0]?.id ?? null
    const fresh = prevTopId.current !== null && topId !== prevTopId.current
    if (pinned) {
      box.scrollTop = 0
      setUnread(0)
    } else if (fresh) {
      // แทรกของใหม่ไว้ข้างบน = เนื้อหาที่กำลังอ่านถูกดันลง — ชดเชยด้วยส่วนสูงที่เพิ่มมา
      const grew = box.scrollHeight - prevHeight.current
      if (grew > 0) box.scrollTop += grew
      // นับจำนวนที่ใหม่กว่าตัวบนสุดเดิมจริง ๆ — poll รอบเดียวมีได้หลายบรรทัด
      const arrived = shown.findIndex((l) => l.id === prevTopId.current)
      setUnread((n) => n + (arrived > 0 ? arrived : 1))
    }
    prevTopId.current = topId
    prevHeight.current = box.scrollHeight
  }, [shown, pinned])

  const onScroll = useCallback((e) => {
    const atTop = e.currentTarget.scrollTop <= 40
    setPinned(atTop)
    if (atTop) setUnread(0)
  }, [])

  const jumpToNewest = () => {
    const box = boxRef.current
    if (box) box.scrollTo({ top: 0, behavior: 'smooth' })
    setPinned(true); setUnread(0)
  }

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
      <div className="relative flex-1 min-h-0 rounded-2xl border border-border bg-card shadow-card overflow-hidden flex flex-col">
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
          <div ref={boxRef} onScroll={onScroll}
            // ปิด scroll anchoring ของเบราว์เซอร์ — มันชดเชยการแทรกของใหม่ข้างบนให้เองอยู่แล้ว
            // ถ้าไม่ปิด จะชดเชยซ้ำกับที่เราคำนวณเอง แล้วจอไหลลงเท่ากับจำนวนบรรทัดที่เพิ่งเข้ามา
            style={{ overflowAnchor: 'none' }}
            className="relative flex-1 overflow-y-auto font-mono text-[12px] leading-relaxed p-3">
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
          </div>
        )}

        {/* จอดอ่านอยู่ที่อื่นแล้วมีของใหม่เข้ามา — บอกให้รู้ แต่ไม่ลากจอไปเอง */}
        {!pinned && unread > 0 && (
          <button onClick={jumpToNewest}
            className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 inline-flex items-center gap-1.5
                       px-3 py-1.5 rounded-full bg-accent text-white text-xs font-semibold shadow-lift hover:opacity-90">
            <ArrowUp size={13} /> มีใหม่ <span className="nums">{unread}</span> รายการ
          </button>
        )}
      </div>
    </div>
  )
}
