'use client'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useApp }   from '../layout'
import { api }      from '@/lib/api'
import { PLAT_META } from '@/lib/platform-meta'
import { deviceReadiness } from '@/lib/device-readiness'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { termHint, MSG } from '@/lib/copy'
import {
  Smartphone, BatteryMedium, BatteryCharging, Thermometer, MemoryStick,
  HardDrive, Wifi, WifiOff, Signal, RefreshCw, CheckCircle2, XCircle,
  AlertCircle, Snowflake, Send, Clock, User, Edit2, Check, X,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────

const tempCls  = t => t >= 45 ? 'text-danger' : t >= 41 ? 'text-amber-400' : 'text-success'
const tempBg   = t => t >= 45 ? 'bg-danger'   : t >= 41 ? 'bg-amber-400'   : 'bg-success'
const batColor = (b, ch) => b <= 20 ? 'bg-danger' : ch ? 'bg-success' : 'bg-accent'
const ramColor = r => r >= 90 ? 'bg-danger' : r >= 75 ? 'bg-amber-400' : 'bg-accent'
const fmtMin   = s => s >= 60 ? `${Math.ceil(s / 60)} นาที` : `${s} วิ`

const NET = {
  wifi:    { Icon: Wifi,    label: 'Wi-Fi',    cls: 'text-success' },
  mobile:  { Icon: Signal,  label: 'มือถือ',   cls: 'text-blue-400' },
  offline: { Icon: WifiOff, label: 'ไม่มีเน็ต', cls: 'text-danger'  },
}

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}
const cardAnim = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

// ── Bar ───────────────────────────────────────────────────────────

function Bar({ pct, colorCls, h = 'h-1.5' }) {
  return (
    <div className={`w-full ${h} rounded-full bg-secondary overflow-hidden`}>
      <div className={`h-full rounded-full transition-all ${colorCls}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ── Readiness row ─────────────────────────────────────────────────

// คำอธิบายศัพท์ยากในเช็กลิสต์ความพร้อม (ดึงจาก glossary กลาง)
const READY_HINTS = {
  adb:   termHint('adb'),
  kbd:   termHint('adb_keyboard'),
  calib: termHint('calibrate'),
  plat:  termHint('platform'),
  awake: 'ตั้งให้จอมือถือไม่ดับและไม่ล็อก ระหว่างระบบทำงานแทนคุณ',
  label: 'ตั้งชื่อบัญชี/ร้านของเครื่องนี้ ให้ดูออกว่าเป็นเครื่องไหน',
}

function ReadinessRow({ item }) {
  const icon = item.ok === true
    ? <CheckCircle2 size={12} className="text-success shrink-0" />
    : item.ok === false
      ? <XCircle     size={12} className="text-danger shrink-0" />
      : <AlertCircle size={12} className="text-muted-foreground shrink-0" />
  const hint = READY_HINTS[item.key]
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {icon}
      <span className={item.ok === false ? 'text-danger' : item.ok === true ? 'text-foreground/70' : 'text-muted-foreground'}>
        {item.label}
      </span>
      {hint && <InfoTooltip text={hint} size={11} />}
    </div>
  )
}

// ── Label editor ──────────────────────────────────────────────────

function LabelEditor({ serial, current }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(current || '')
  const [saving, setSaving]   = useState(false)

  const save = async () => {
    setSaving(true)
    try { await api.setDeviceLabel(serial, val.trim()) } catch {}
    setSaving(false); setEditing(false)
  }

  if (editing) return (
    <div className="flex items-center gap-1">
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="flex-1 min-w-0 text-xs bg-card border border-border rounded px-2 py-0.5 text-foreground outline-none focus:border-accent" />
      <button onClick={save} disabled={saving} className="p-0.5 text-success hover:opacity-80"><Check size={12} /></button>
      <button onClick={() => setEditing(false)} className="p-0.5 text-muted-foreground hover:text-danger"><X size={12} /></button>
    </div>
  )
  return (
    <button onClick={() => { setVal(current || ''); setEditing(true) }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group transition-colors">
      <User size={11} className="text-accent shrink-0" />
      <span className="truncate">{current || 'ตั้งชื่อบัญชี'}</span>
      <Edit2 size={10} className="opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
    </button>
  )
}

// ── Platform picker ───────────────────────────────────────────────

function PlatformPicker({ serial, selected = [], allPlatforms = [] }) {
  const [saving, setSaving] = useState(false)
  const toggle = async (key) => {
    const next = selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]
    setSaving(true)
    try { await api.setDevicePlatforms(serial, next) } catch {}
    setSaving(false)
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-muted-foreground mr-0.5">แพลตฟอร์ม:</span>
      {allPlatforms.filter(p => p.ready).map(p => {
        const m = PLAT_META[p.key]
        if (!m) return null
        const on   = selected.includes(p.key)
        const Logo = m.Logo
        return (
          <button key={p.key} onClick={() => toggle(p.key)} disabled={saving}
            className={`flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border transition-all
              ${on ? 'bg-secondary border-border text-foreground' : 'border-transparent text-muted-foreground opacity-40 hover:opacity-70'}`}>
            <Logo size={10} color={on ? m.color : 'currentColor'} /> {m.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Device health card ────────────────────────────────────────────

function DeviceHealthCard({ device, platforms }) {
  const {
    serial, model, battery, status, temp, charging,
    activity, cooldown_reason, cooldown_remaining,
    ram_total, ram_used, storage_total, storage_free, net,
    label, platforms: devPlats = [],
  } = device

  const ok      = status === 'device'
  const ramPct  = ram_total    ? Math.round((ram_used  / ram_total)  * 100) : 0
  const stoPct  = storage_total ? Math.round(((storage_total - storage_free) / storage_total) * 100) : 0
  const { items: readyItems, done: readyDone, total: readyTotal } = deviceReadiness(device)
  const netInfo = NET[net] ?? NET.offline

  const statusBadge = ok
    ? activity === 'cooldown'
      ? { label: cooldown_reason === 'hot' ? `พักร้อน${cooldown_remaining > 0 ? ` (${fmtMin(cooldown_remaining)})` : ''}` : 'พักชาร์จ',
          cls: 'bg-amber-400/15 text-amber-400', Icon: Snowflake }
      : activity === 'posting'
        ? { label: 'กำลังโพสต์', cls: 'bg-accent/15 text-accent',   Icon: Send }
        : { label: 'ว่าง',        cls: 'bg-success/15 text-success', Icon: CheckCircle2 }
    : status === 'unauthorized'
      ? { label: 'รออนุญาต', cls: 'bg-accent/15 text-accent',              Icon: AlertCircle }
      : { label: 'ออฟไลน์',  cls: 'bg-secondary text-muted-foreground',    Icon: XCircle }

  return (
    <div className={`rounded-2xl border shadow-card flex flex-col overflow-hidden transition-all
      ${ok ? 'bg-card border-border' : 'bg-card border-border opacity-60'}`}>

      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3 border-b border-border/50">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${ok ? 'bg-accent-wash' : 'bg-secondary'}`}>
          <Smartphone size={18} className={ok ? 'text-accent' : 'text-muted-foreground'} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-foreground font-semibold text-sm truncate">{model || serial}</p>
          <p className="text-muted-foreground text-[10px] font-mono mt-0.5 truncate">{serial}</p>
        </div>
        <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${statusBadge.cls}`}>
          <statusBadge.Icon size={10} /> {statusBadge.label}
        </span>
      </div>

      {ok ? (
        <div className="p-4 flex flex-col gap-4">
          {/* Account label */}
          <LabelEditor serial={serial} current={label} />

          {/* Metrics */}
          <div className="flex flex-col gap-2.5">
            {battery > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {charging ? <BatteryCharging size={12} className="text-success" /> : <BatteryMedium size={12} />} แบตเตอรี่
                  </span>
                  <span className={`font-bold nums ${battery <= 20 ? 'text-danger' : charging ? 'text-success' : 'text-foreground'}`}>{battery}%</span>
                </div>
                <Bar pct={battery} colorCls={batColor(battery, charging)} />
              </div>
            )}

            {temp > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground"><Thermometer size={12} /> อุณหภูมิ</span>
                  <span className={`font-bold nums ${tempCls(temp)}`}>{temp.toFixed(1)}°C</span>
                </div>
                <Bar pct={Math.min(100, (temp / 60) * 100)} colorCls={tempBg(temp)} />
              </div>
            )}

            {ram_total > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground"><MemoryStick size={12} /> RAM</span>
                  <span className={`font-bold nums ${ramPct >= 90 ? 'text-danger' : ramPct >= 75 ? 'text-amber-400' : 'text-foreground'}`}>{ram_used}/{ram_total} MB</span>
                </div>
                <Bar pct={ramPct} colorCls={ramColor(ramPct)} />
              </div>
            )}

            {storage_total > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground"><HardDrive size={12} /> พื้นที่</span>
                  <span className={`font-bold nums ${storage_free < 2 ? 'text-danger' : storage_free < 5 ? 'text-amber-400' : 'text-foreground'}`}>เหลือ {storage_free} GB</span>
                </div>
                <Bar pct={stoPct} colorCls={stoPct >= 90 ? 'bg-danger' : stoPct >= 75 ? 'bg-amber-400' : 'bg-accent'} />
              </div>
            )}

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">เน็ตเวิร์ก</span>
              <span className={`flex items-center gap-1 font-medium ${netInfo.cls}`}>
                <netInfo.Icon size={12} /> {netInfo.label}
              </span>
            </div>
          </div>

          {/* Platforms */}
          <div className="border-t border-border/50 pt-3">
            <PlatformPicker serial={serial} selected={devPlats} allPlatforms={platforms} />
          </div>

          {/* Readiness */}
          <div className="border-t border-border/50 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">ความพร้อม</span>
              <span className={`text-[10px] font-bold ${readyDone === readyTotal ? 'text-success' : 'text-amber-400'}`}>
                {readyDone}/{readyTotal}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {readyItems.map(item => <ReadinessRow key={item.key} item={item} />)}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-3">
          <p className="text-muted-foreground text-xs">เครื่องไม่ได้เชื่อมต่อ — ตรวจสอบสาย USB หรือ Wi-Fi ADB</p>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function DevicesPage() {
  const { state, patch } = useApp()
  const [scanning, setScanning]   = useState(false)
  const [ip, setIp]               = useState('')
  const [platforms, setPlatforms] = useState([])

  const ready   = state.ws_connected   // ต้องเชื่อมต่อโปรแกรมหลักก่อน จึงสแกน/เชื่อมมือถือได้
  const devices = state.devices || []
  const online  = devices.filter(d => d.status === 'device')
  const offline = devices.filter(d => d.status !== 'device')
  const posting = online.filter(d => d.activity === 'posting').length
  const cooling = online.filter(d => d.activity === 'cooldown').length
  const temps   = online.map(d => d.temp).filter(t => t > 0)
  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null
  const alerts  = online.filter(d => d.temp >= 45 || (d.battery <= 20 && !d.charging) || (d.storage_free > 0 && d.storage_free < 2))

  useEffect(() => {
    api.platforms().then(d => setPlatforms(d.platforms || [])).catch(() => {})
  }, [])

  const scan = async () => {
    setScanning(true)
    try { const r = await api.scan(); patch({ devices: r.devices }) } catch {}
    setScanning(false)
  }

  const connect = async () => {
    if (!ip.trim()) return
    try { await api.wifiConnect(ip.trim()); setIp('') } catch {}
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex-1">
          <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ดูแลเครื่อง</h2>
          <p className="text-muted-foreground text-sm mt-2">
            <span className="nums">{online.length}</span> ออนไลน์ ·
            <span className="nums"> {offline.length}</span> ออฟไลน์ ·
            <span className="nums"> {devices.length}</span> เครื่องทั้งหมด
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <input value={ip} onChange={e => setIp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ready && connect()}
              placeholder="Wi-Fi: 192.168.x.x" disabled={!ready}
              className="w-36 text-xs bg-secondary border border-border text-foreground px-3 py-2 rounded-lg outline-none focus:border-accent placeholder:text-muted-foreground disabled:opacity-50" />
            <InfoTooltip text={termHint('wifi_adb')} />
          </div>
          <button onClick={connect} disabled={!ready} title={!ready ? MSG.needDesktop : undefined}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary text-xs font-medium transition-all disabled:opacity-50 disabled:pointer-events-none">
            <Wifi size={13} /> เชื่อม
          </button>
          <button onClick={scan} disabled={scanning || !ready} title={!ready ? MSG.needDesktop : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent-soft text-white text-xs font-bold transition-all disabled:opacity-60 disabled:pointer-events-none">
            <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} /> สแกน
          </button>
        </div>
      </motion.div>

      {/* ยังเชื่อมต่อโปรแกรมหลักไม่ได้ — บอกเหตุผลปุ่มที่กดไม่ได้ */}
      {!ready && (
        <div className="flex items-center gap-2.5 rounded-xl bg-amber-400/10 border border-amber-400/25 px-4 py-3 text-amber-500 text-xs">
          <WifiOff size={15} className="shrink-0" />
          <span>{MSG.needDesktop}</span>
        </div>
      )}

      {/* Summary chips */}
      <motion.div
        className="flex items-center gap-2 flex-wrap"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.06 }}
      >
        <Chip icon={CheckCircle2} cls="text-success bg-success/10 border-success/20"            label={`ออนไลน์ ${online.length}`} />
        <Chip icon={XCircle}      cls="text-muted-foreground bg-secondary border-border"         label={`ออฟไลน์ ${offline.length}`} />
        {posting > 0 && <Chip icon={Send}        cls="text-accent bg-accent/10 border-accent/20"            label={`โพสต์ ${posting}`} />}
        {cooling > 0 && <Chip icon={Snowflake}   cls="text-amber-400 bg-amber-400/10 border-amber-400/20"   label={`พัก ${cooling}`} />}
        {avgTemp   && <Chip icon={Thermometer}   cls="text-muted-foreground bg-secondary border-border"     label={`เฉลี่ย ${avgTemp}°C`} />}
        {alerts.length > 0 && <Chip icon={AlertCircle} cls="text-danger bg-danger/10 border-danger/20" label={`แจ้งเตือน ${alerts.length} เครื่อง`} />}
      </motion.div>

      {/* Alert banner */}
      {alerts.length > 0 && (
        <motion.div
          className="rounded-xl bg-danger/5 border border-danger/20 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1 }}
        >
          <p className="text-danger text-xs font-bold mb-2 flex items-center gap-1.5"><AlertCircle size={13} /> ต้องดูแล</p>
          <div className="flex flex-col gap-1">
            {alerts.map(d => {
              const reasons = []
              if (d.temp >= 45) reasons.push(`ร้อน ${d.temp.toFixed(1)}°C`)
              if (d.battery <= 20 && !d.charging) reasons.push(`แบต ${d.battery}%`)
              if (d.storage_free > 0 && d.storage_free < 2) reasons.push(`พื้นที่เหลือ ${d.storage_free}GB`)
              return (
                <p key={d.serial} className="text-xs text-danger/80">
                  <span className="font-semibold">{d.label || d.model || d.serial}</span> — {reasons.join(' · ')}
                </p>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Device grid */}
      {devices.length === 0 ? (
        <motion.div
          className="rounded-2xl border border-border bg-card p-16 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Smartphone size={28} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-semibold">ยังไม่พบเครื่อง</p>
          <p className="text-muted-foreground text-sm mt-1">กด "สแกน" หรือเชื่อม Wi-Fi ADB เพื่อเพิ่มเครื่อง</p>
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {[...online, ...offline].map(d => (
            <motion.div key={d.serial} variants={cardAnim}>
              <DeviceHealthCard device={d} platforms={platforms} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

function Chip({ icon: Icon, label, cls }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${cls}`}>
      <Icon size={12} /> {label}
    </div>
  )
}
