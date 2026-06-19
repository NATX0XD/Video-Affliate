'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useApp }     from '../layout'
import { SystemLog }  from '@/components/dashboard/SystemLog'
import { BarChart }   from '@/components/charts/BarChart'
import { SkeletonCard, SkeletonChartCard } from '@/components/ui/Skeleton'
import { api }        from '@/lib/api'
import Link from 'next/link'
import {
  Smartphone, ListOrdered, CheckCircle2, XCircle,
  BarChart3, Share2,
  Thermometer, BatteryLow, Snowflake, WifiOff, BatteryCharging, BatteryMedium,
} from 'lucide-react'
import { PLAT_META } from '@/lib/platform-meta'

const tempCls = (t) => (t >= 45 ? 'text-danger' : t >= 41 ? 'text-amber-500' : 'text-muted-foreground')

const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const cardSlide = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,
            transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } },
}

export default function DashboardPage() {
  const { state, patch } = useApp()
  const [rep, setRep]             = useState(null)
  const [platforms, setPlatforms] = useState([])
  const [selPlats, setSelPlats]   = useState([])

  useEffect(() => {
    const load = () => api.reports().then(setRep).catch(() => {})
    load(); const id = setInterval(load, 15000); return () => clearInterval(id)
  }, [])

  useEffect(() => {
    api.platforms().then(d => setPlatforms(d.platforms || [])).catch(() => {})
    api.getSettings().then(s => setSelPlats(s.platforms || [])).catch(() => {})
  }, [])

  const devs    = state.devices.filter(d => d.status === 'device')
  const online  = devs.length
  const daily   = rep?.daily || []

  const hot     = devs.filter(d => d.cooldown_reason === 'hot' || d.temp >= 45)
  const lowBat  = devs.filter(d => d.battery > 0 && d.battery <= 20 && !d.charging)
  const offNet  = devs.filter(d => d.net === 'offline')
  const alerts  = []
  if (hot.length)     alerts.push({ tone: 'danger', icon: Thermometer,  text: `เครื่องร้อน ${hot.length} เครื่อง`,     sub: hot.map(d => d.model).join(', ') })
  if (lowBat.length)  alerts.push({ tone: 'amber',  icon: BatteryLow,   text: `แบตต่ำ ${lowBat.length} เครื่อง`,      sub: lowBat.map(d => `${d.model} ${d.battery}%`).join(', ') })
  if (offNet.length)  alerts.push({ tone: 'amber',  icon: WifiOff,      text: `เน็ตหลุด ${offNet.length} เครื่อง` })
  if (state.errors > 0) alerts.push({ tone: 'danger', icon: XCircle,   text: `โพสต์ล้ม ${state.errors}`,             sub: 'ดูรายละเอียดในหน้ารายงาน' })

  const metrics = [
    { icon: Smartphone,   label: 'อุปกรณ์ออนไลน์', value: online,        accent: true },
    { icon: ListOrdered,  label: 'คลิปรอโพสต์',     value: state.queue },
    { icon: CheckCircle2, label: 'เผยแพร่สำเร็จ',  value: state.done },
    { icon: XCircle,      label: 'ข้อผิดพลาด',      value: state.errors,  danger: true },
  ]

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <motion.div
        className="flex items-start justify-between gap-4 flex-wrap"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ภาพรวมระบบ</h2>
          <p className="text-muted-foreground text-sm mt-2">รีเช็คคลิป โพสต์ขึ้นหลายแพลตฟอร์ม และติดตามผล</p>
        </div>
        <Link href="/jobs"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ListOrdered size={15} className="text-accent" /> ไปหน้างาน
        </Link>
      </motion.div>

      {/* KPI metrics */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5"
        variants={gridStagger}
        initial="hidden"
        animate="show"
      >
        {metrics.map((m) => <Metric key={m.label} {...m} />)}
      </motion.div>

      {/* Alerts */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div
            key="alerts"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-0.5">
              <AnimatePresence>
                {alerts.map((a, i) => <AlertCard key={`${a.text}-${i}`} {...a} />)}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platforms */}
      <PlatformsCard platforms={platforms} selected={selPlats} devices={devs} />

      {/* Trend chart — full width */}
      <AnimatePresence mode="wait">
        {rep === null ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <SkeletonChartCard height={310} />
          </motion.div>
        ) : (
          <motion.div
            key="chart"
            className="rounded-2xl border border-border bg-card text-card-foreground shadow-card p-5 lg:p-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-wash"><BarChart3 size={16} className="text-accent" /></div>
              <span className="text-foreground font-semibold text-sm">การเผยแพร่ย้อนหลัง 14 วัน</span>
              <span className="ml-auto text-[11px] text-muted-foreground nums">รวม {daily.reduce((a, d) => a + d.count, 0)} คลิป</span>
            </div>
            <BarChart data={daily} index="date" categories={['count']} colors={['#a855f7']}
                      labels={{ count: 'โพสต์' }} valueFormatter={(v) => `${v}`} height={210} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Device fleet + System log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <motion.div
          className="h-[340px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
        >
          <DeviceFleet devices={devs} />
        </motion.div>
        <motion.div
          className="lg:col-span-2 h-[340px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24 }}
        >
          <SystemLog logs={state.logs} onClear={() => patch({ logs: [] })} />
        </motion.div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

const TONE = {
  danger: 'border-danger/30 bg-danger/10 text-danger',
  amber:  'border-amber-400/30 bg-amber-400/10 text-amber-500',
}
function AlertCard({ tone, icon: Icon, text, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, x: -6 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95, x: 6 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${TONE[tone] || TONE.amber}`}
    >
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[13px] font-bold leading-tight">{text}</p>
        {sub && <p className="text-[11px] opacity-80 leading-tight mt-0.5 truncate">{sub}</p>}
      </div>
    </motion.div>
  )
}

const ago = (ts) => {
  if (!ts) return null
  const s = Date.now() / 1000 - ts
  if (s < 90) return 'เมื่อกี้'
  if (s < 3600) return `${Math.floor(s / 60)} นาที`
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.`
  return `${Math.floor(s / 86400)} วัน`
}

function PlatformsCard({ platforms, selected, devices = [] }) {
  const list    = platforms.length ? platforms : Object.keys(PLAT_META).map(key => ({ key, label: key, ready: true, tuned: key === 'shopee', stats: {} }))
  const onCount = list.filter(p => selected.includes(p.key)).length

  return (
    <motion.div
      className="rounded-2xl border border-border bg-card text-card-foreground shadow-card p-5 lg:p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-wash"><Share2 size={16} className="text-accent" /></div>
        <span className="text-foreground font-semibold text-sm">แพลตฟอร์มปลายทาง</span>
        <span className="ml-auto text-[11px] text-muted-foreground nums">เปิดใช้ {onCount}/{list.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {list.map(p => {
          const on  = selected.includes(p.key)
          const m   = PLAT_META[p.key] || {}
          const Logo = m.Logo
          const st  = p.stats || {}
          const bound = devices.filter(d => (d.platforms || []).includes(p.key)).length
          const status = !on
            ? { label: 'ปิดอยู่',  cls: 'text-muted-foreground bg-secondary' }
            : p.tuned
            ? { label: 'พร้อม',    cls: 'text-success bg-success/15' }
            : { label: 'ต้องจูน', cls: 'text-amber-500 bg-amber-400/15' }
          return (
            <div key={p.key}
              className={`relative rounded-xl border p-4 flex flex-col items-center gap-2 transition-all
                ${on ? 'border-border bg-secondary/50' : 'border-border/40 opacity-55 hover:opacity-80'}`}>
              <div className="w-11 h-11 rounded-xl bg-card flex items-center justify-center">
                {Logo
                  ? <Logo size={24} color={on ? m.color : undefined} className={on ? '' : 'opacity-40'} />
                  : <Share2 size={22} className="text-muted-foreground" />}
              </div>
              <span className="text-foreground text-[13px] font-semibold text-center leading-tight">{p.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
              {on && (
                <div className="w-full mt-1.5 pt-2.5 border-t border-border/60 flex flex-col gap-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">วันนี้</span>
                    <span className="text-foreground font-semibold nums">
                      {st.today ?? 0}{st.success_rate != null && <span className="text-muted-foreground font-normal"> · {st.success_rate}%</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><Smartphone size={10} /> {bound}</span>
                    <span className="nums">{st.last_ts ? ago(st.last_ts) : '—'}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function Metric({ icon: Icon, label, value, accent, danger }) {
  return (
    <motion.div
      variants={cardSlide}
      className="rounded-2xl border border-border bg-card text-card-foreground shadow-card p-4 lg:p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-accent-wash' : 'bg-secondary'}`}>
          <Icon size={15} className={accent ? 'text-accent' : 'text-muted-foreground'} />
        </div>
      </div>
      <span className={`text-[32px] font-extrabold nums leading-none ${danger && value > 0 ? 'text-danger' : 'text-foreground'}`}>{value}</span>
    </motion.div>
  )
}

const ACTIVITY = {
  idle:     { label: 'ว่าง',       cls: 'bg-secondary text-muted-foreground' },
  posting:  { label: 'กำลังโพสต์', cls: 'bg-accent-wash text-accent' },
  cooldown: { label: 'พักเครื่อง', cls: 'bg-amber-400/15 text-amber-500' },
}
function DeviceFleet({ devices }) {
  return (
    <div className="h-full rounded-2xl border border-border bg-card text-card-foreground shadow-card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border shrink-0">
        <Smartphone size={16} className="text-accent" />
        <span className="text-foreground font-semibold text-sm">เครื่องในฟาร์ม</span>
        <span className="ml-auto text-[11px] text-muted-foreground nums">{devices.length} ออนไลน์</span>
      </div>
      {devices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">ยังไม่มีเครื่องเชื่อมต่อ</div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {devices.map(d => {
            const act    = ACTIVITY[d.activity] || ACTIVITY.idle
            const BatIcon = d.charging ? BatteryCharging : BatteryMedium
            return (
              <div key={d.serial} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-[13px] font-semibold truncate">{d.model || d.serial}</p>
                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
                    <span className={`flex items-center gap-1 ${d.battery > 0 && d.battery <= 20 ? 'text-danger' : ''}`}>
                      <BatIcon size={11} /> {d.battery || 0}%
                    </span>
                    {d.temp > 0 && <span className={`flex items-center gap-1 ${tempCls(d.temp)}`}><Thermometer size={11} /> {d.temp.toFixed(0)}°</span>}
                    {d.net === 'offline' && <WifiOff size={11} className="text-danger" />}
                  </div>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${act.cls}`}>
                  {d.activity === 'cooldown' && <Snowflake size={10} />}
                  {act.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
