'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { LazyVideo } from '@/components/ui/LazyVideo'
import { JOB_STATUS } from '@/components/layout/PageHeader'
import { PLAT_META } from '@/lib/platform-meta'
import {
  Package, Film, Send, RefreshCw, Layers, Clock, CheckCircle2,
  Coins, Link2, Check, Loader2, Image as ImageIcon,
} from 'lucide-react'

// ── มุมมองไปป์ไลน์เดียว: สินค้า → คลิป → โพสต์ ────────────────────────────
// รวมข้อมูล 3 แหล่ง (products / jobs / post-results) ให้เห็นว่า "ของแต่ละชิ้นอยู่ขั้นไหน"
// อ่านอย่างเดียว — ไม่มีปุ่มทำลาย/แก้ flow gen/เครดิต

// ปรับข้อความ (normalize) ให้จับคู่ข้ามแหล่งได้แม่นขึ้น
const normLink = (u) => (u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
const normName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const num = (v) => Number(v) || 0

// ขั้นของไปป์ไลน์ (reached = ขั้นสูงสุดที่ทำเสร็จแล้ว)
const STEPS = [
  { label: 'สินค้า', icon: Package },
  { label: 'คลิป',   icon: Film },
  { label: 'โพสต์',  icon: Send },
]

const FILTERS = [
  { key: 'all',    label: 'ทั้งหมด',      icon: Layers,       stage: null },
  { key: 'toclip', label: 'รอสร้างคลิป', icon: Package,      stage: 1 },
  { key: 'topost', label: 'รอโพสต์',      icon: Clock,        stage: 2 },
  { key: 'posted', label: 'โพสต์แล้ว',    icon: CheckCircle2, stage: 3 },
]

const fmtTime = (t) => {
  if (!t) return '—'
  const diff = Math.floor(Date.now() / 1000) - t
  if (diff < 60)    return 'เมื่อครู่'
  if (diff < 3600)  return `${Math.floor(diff / 60)} นาทีก่อน`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ก่อน`
  if (diff < 6048e2) return `${Math.floor(diff / 86400)} วันก่อน`
  return new Date(t * 1000).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
}

// ── สร้าง item รวมจาก 3 แหล่ง ────────────────────────────────────────────
function buildItems(products, jobs, recent) {
  // แพลตฟอร์มที่โพสต์ไปแล้ว จัดกลุ่มตามชื่อคลิป
  const postsByName = {}
  for (const r of recent) {
    if (!r?.ok) continue
    const k = normName(r.job_name)
    if (!k) continue
    ;(postsByName[k] ??= new Set()).add(r.platform)
  }

  // 1) ทุก job = คลิป (มีขั้น "คลิป" แล้วเป็นอย่างน้อย) — job พก product info มาด้วย
  const items = jobs.map((j) => {
    const plats = [...(postsByName[normName(j.name)] || [])]
    const posted = ['posted', 'done'].includes(j.status) || plats.length > 0
    return {
      key: `job-${j.id}`,
      kind: 'clip',
      name: j.name || 'ไม่มีชื่อ',
      price: j.price,
      commission: j.commission,
      link: j.link || '',
      img: '',
      thumb: (j.cover || j.file) ? { folder: j.folder, cover: j.cover, file: j.file } : null,
      status: j.status,
      hasClip: true,
      posted,
      platforms: plats,
      ts: j.updated_at || j.created_at || 0,
      reached: posted ? 3 : 2,
    }
  })

  // 2) สินค้าที่ยังไม่มีคลิป (ดูดมาแต่ยังไม่ได้สร้างวิดีโอ) → ขั้น "สินค้า"
  const jobLinks = new Set(jobs.map((j) => normLink(j.link)).filter(Boolean))
  const jobNames = new Set(jobs.map((j) => normName(j.name)).filter(Boolean))
  for (const p of products) {
    const lk = normLink(p.cart_link)
    const nm = normName(p.name)
    if ((lk && jobLinks.has(lk)) || (nm && jobNames.has(nm))) continue   // มีคลิปแล้ว → นับที่ job แทน
    items.push({
      key: `prod-${p.id}`,
      kind: 'product',
      name: p.name || 'ไม่มีชื่อ',
      price: p.price,
      commission: p.commission,
      link: p.cart_link || '',
      img: p.image_url || '',
      thumb: null,
      status: 'catalog',
      hasClip: false,
      posted: false,
      platforms: [],
      ts: p.created_ts || 0,
      reached: 1,
    })
  }

  items.sort((a, b) => (b.ts || 0) - (a.ts || 0))
  return items
}

export default function PipelinePage() {
  const [products, setProducts] = useState([])
  const [jobs, setJobs]         = useState([])
  const [recent, setRecent]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter]     = useState('all')

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      // ดึงขนานกัน — ถ้าแหล่งไหนพังก็ยังแสดงที่เหลือได้
      const [p, j, pr] = await Promise.allSettled([api.products(), api.jobs(), api.postResults()])
      if (p.status === 'fulfilled')  setProducts(p.value?.products || [])
      if (j.status === 'fulfilled')  setJobs(j.value?.jobs || [])
      if (pr.status === 'fulfilled') setRecent(pr.value?.recent || [])
    } catch {}
    finally { setLoading(false); if (manual) setRefreshing(false) }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id) }, [load])

  const items = useMemo(() => buildItems(products, jobs, recent), [products, jobs, recent])

  const clipCount   = items.filter((i) => i.hasClip).length
  const postedCount = items.filter((i) => i.posted).length

  const stageOf = (i) => (i.posted ? 3 : i.hasClip ? 2 : 1)
  const countStage = (s) => (s == null ? items.length : items.filter((i) => stageOf(i) === s).length)
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)
    if (!f || f.stage == null) return items
    return items.filter((i) => stageOf(i) === f.stage)
  }, [items, filter])

  const TILES = [
    { label: 'สินค้าที่ดูดมา', hint: 'ดึงจากร้านแล้ว', value: products.length, icon: Package, tone: 'accent' },
    { label: 'คลิปที่สร้าง',   hint: 'ทำวิดีโอแล้ว',  value: clipCount,        icon: Film,    tone: 'accent' },
    { label: 'โพสต์แล้ว',      hint: 'เผยแพร่แล้ว',   value: postedCount,      icon: Send,    tone: 'success' },
  ]

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <motion.div className="flex items-start justify-between gap-4 flex-wrap"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}>
        <div>
          <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ไปป์ไลน์</h2>
          <p className="text-muted-foreground text-sm mt-2">ตามรอยของแต่ละชิ้น: สินค้า → คลิป → โพสต์ · <span className="nums">{items.length}</span> ชิ้น</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> รีเฟรช
        </Button>
      </motion.div>

      {/* Funnel tiles */}
      <motion.div className="grid grid-cols-3 gap-3 sm:gap-4"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}>
        {TILES.map((t, i) => (
          <div key={t.label} className="relative rounded-2xl bg-card border border-border shadow-card p-4 sm:p-5 flex flex-col gap-2 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                ${t.tone === 'success' ? 'bg-success/15 text-success' : 'bg-accent-wash text-accent'}`}>
                <t.icon size={15} />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-foreground leading-tight">{t.label}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold nums text-foreground leading-none">{t.value}</p>
            <p className="text-[11px] text-muted-foreground">{t.hint}</p>
            {i < TILES.length - 1 && (
              <span className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 z-10">›</span>
            )}
          </div>
        ))}
      </motion.div>

      {/* Filter chips */}
      <motion.div className="flex items-center gap-2 flex-wrap"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key
          const n = countStage(f.stage)
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${on ? 'bg-accent-wash text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              <f.icon size={13} /> {f.label}
              <span className={`nums ${on ? 'text-accent' : 'text-muted-foreground'}`}>{n}</span>
            </button>
          )
        })}
      </motion.div>

      {/* Timeline list */}
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div key="loading" className="flex items-center justify-center py-24"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 size={22} className="text-muted-foreground animate-spin" />
          </motion.div>
        ) : shown.length === 0 ? (
          <motion.div key="empty"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-card shadow-card p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <Layers size={24} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold mb-1">
              {items.length === 0 ? 'ยังไม่มีของในไปป์ไลน์' : 'ไม่มีของในขั้นนี้'}
            </p>
            <p className="text-muted-foreground text-sm">
              {items.length === 0 ? 'ดูดสินค้าจาก Extension เพื่อเริ่มต้น แล้วของจะไหลมาที่นี่' : 'ลองเลือกแท็บอื่น'}
            </p>
          </motion.div>
        ) : (
          <motion.div key="list" className="flex flex-col gap-2.5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}>
            <AnimatePresence initial={false}>
              {shown.map((it) => <PipelineRow key={it.key} item={it} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── แถวเดียวของไปป์ไลน์ ──────────────────────────────────────────────────
function PipelineRow({ item: it }) {
  const s = JOB_STATUS[it.status]
  return (
    <motion.div layout
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="group rounded-xl bg-card text-card-foreground border border-border shadow-card p-3.5 sm:p-4 lift">
      <div className="flex items-center gap-3.5 sm:gap-4">

        {/* รูปย่อ */}
        <div className="relative w-14 h-20 sm:w-16 sm:h-24 rounded-lg overflow-hidden bg-black shrink-0 border border-border">
          {it.thumb?.cover
            ? <img src={api.videoFileUrl(it.thumb.folder, it.thumb.cover)} alt="" className="w-full h-full object-cover object-top" />
            : it.thumb?.file
              ? <LazyVideo src={api.videoFileUrl(it.thumb.folder, it.thumb.file)} className="w-full h-full" videoClassName="w-full h-full object-cover" />
              : it.img
                ? <img src={it.img} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    {it.kind === 'product' ? <Package size={20} className="text-muted-foreground" /> : <ImageIcon size={20} className="text-muted-foreground" />}
                  </div>}
        </div>

        {/* ข้อมูล */}
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-medium truncate">{it.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {it.price
              ? <span className="text-[15px] font-extrabold nums text-foreground">฿{num(it.price).toLocaleString()}</span>
              : <span className="text-sm text-muted-foreground">—</span>}
            {it.commission ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success/15 text-success border border-success/30 text-[11px] font-bold nums">
                <Coins size={11} /> ค่าคอม {it.commission}%
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground nums">{fmtTime(it.ts)}</span>
            {it.link
              ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Link2 size={11} className="text-accent" /> มีลิงก์ตะกร้า</span>
              : <span className="inline-flex items-center gap-1 text-[11px] text-danger"><Link2 size={11} /> ไม่มีลิงก์ตะกร้า</span>}
            {/* แพลตฟอร์มที่โพสต์แล้ว */}
            {it.platforms.map((pk) => {
              const m = PLAT_META[pk]
              if (!m) return null
              const Logo = m.Logo
              return (
                <span key={pk} title={m.label} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Logo size={12} color={m.color} /> {m.label}
                </span>
              )
            })}
          </div>
        </div>

        {/* Stepper + สถานะ */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <PipelineStepper reached={it.reached} />
          {s && (
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${s.cls}`}>
              {s.spin && <Loader2 size={11} className="animate-spin" />}{s.label}
            </span>
          )}
          {!s && it.kind === 'product' && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold text-accent bg-accent-wash border-accent/20">
              รอสร้างคลิป
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── stepper 3 ขั้น: สินค้า → คลิป → โพสต์ ─────────────────────────────────
function PipelineStepper({ reached }) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {STEPS.map((step, i) => {
        const n = i + 1
        const done = n <= reached
        const current = n === reached + 1
        const cls = done
          ? 'bg-success/15 text-success border-success/30'
          : current
            ? 'bg-accent-wash text-accent border-accent/30'
            : 'bg-secondary text-muted-foreground border-border'
        return (
          <div key={step.label} className="flex items-center gap-1 sm:gap-1.5">
            <span className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg border text-[10px] sm:text-[11px] font-semibold ${cls}`}>
              {done ? <Check size={11} /> : <step.icon size={11} />}
              <span className="hidden md:inline">{step.label}</span>
            </span>
            {i < STEPS.length - 1 && (
              <span className={`w-2.5 sm:w-4 h-px ${n < reached ? 'bg-success/40' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
