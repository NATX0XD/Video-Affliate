'use client'
import { useRef, useCallback, useState, useEffect } from 'react'
import {
  ArrowLeft, Volume2, VolumeX, Home, RotateCcw, Grid2x2, Tag, Share2,
  CheckCircle2, Circle, Sparkles, Crosshair, Save, SkipForward, ChevronLeft,
  X, Check, Tablet, RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { ratioFromRect, normalizeCoords } from '@/lib/calib'
import { PLAT_META } from '@/lib/platform-meta'
import { deviceReadiness } from '@/lib/device-readiness'

export function MirrorFullscreen({ device, platforms = [], onBack }) {
  const imgRef  = useRef(null)
  const dragRef = useRef(null)
  const [label, setLabel] = useState(device?.label || '')
  const [plats, setPlats] = useState(device?.platforms || [])
  // อัตราส่วนจอจริงของเครื่อง (มือถือ/แท็บเล็ตต่างกัน) — เริ่มจาก phoneW/H ถ้ามี แล้วอัปเดตจากภาพจริงตอนโหลด
  const [ar, setAr] = useState(
    device?.phoneW && device?.phoneH ? device.phoneW / device.phoneH : 9 / 19.5)
  useEffect(() => {
    setLabel(device?.label || '')
    setPlats(device?.platforms || [])
    if (device?.phoneW && device?.phoneH) setAr(device.phoneW / device.phoneH)
  }, [device?.serial])

  // ── คาลิเบรตพิกัดโพสต์ ─────────────────────────────────────────────
  const [coordsInfo, setCoordsInfo] = useState(null)  // {coords,defaults,keys,calibrated,is_tablet,resolution}
  const [calibMode, setCalibMode]   = useState(false)
  const [work, setWork]             = useState({})    // {key:{rx,ry}} กำลังจับ
  const [idx, setIdx]               = useState(0)     // ขั้นปัจจุบัน
  const [armed, setArmed]           = useState(false) // จับ tap ถัดไป
  const [savedNote, setSavedNote]   = useState('')
  useEffect(() => {
    setCalibMode(false); setArmed(false); setIdx(0)
    if (!device?.serial) { setCoordsInfo(null); setWork({}); return }
    let alive = true
    api.getDeviceCoords(device.serial)
      .then(d => { if (alive) { setCoordsInfo(d); setWork(normalizeCoords(d?.coords)) } })
      .catch(() => { if (alive) setCoordsInfo(null) })
    return () => { alive = false }
  }, [device?.serial])

  const keys      = coordsInfo?.keys || []
  const total     = keys.length
  const curKey    = keys[idx]?.key
  const enterCalib = () => {
    setWork(normalizeCoords(coordsInfo?.coords)); setIdx(0); setArmed(false)
    setSavedNote(''); setCalibMode(true)
  }
  const exitCalib  = () => { setCalibMode(false); setArmed(false) }
  const stepTo     = (i) => { setIdx(Math.max(0, Math.min(total - 1, i))); setArmed(false) }
  const redoCur    = () => {
    if (!curKey) return
    setWork(w => { const n = { ...w }; delete n[curKey]; return n })
    setArmed(true)
  }
  const saveCoords = async () => {
    if (!device?.serial) return
    try {
      await api.saveDeviceCoords(device.serial, work)
      setCoordsInfo(ci => ci ? { ...ci, coords: work, calibrated: true } : ci)
      setSavedNote('บันทึกแล้ว'); setTimeout(() => setSavedNote(''), 2600)
    } catch { setSavedNote('บันทึกไม่สำเร็จ'); setTimeout(() => setSavedNote(''), 2600) }
  }
  const resetCoords = async () => {
    if (!device?.serial) return
    try {
      await api.resetDeviceCoords(device.serial)
      const d = await api.getDeviceCoords(device.serial)
      setCoordsInfo(d); setWork(normalizeCoords(d?.coords)); setIdx(0); setArmed(false)
      setSavedNote('รีเซ็ตเป็นค่าเริ่มต้นแล้ว'); setTimeout(() => setSavedNote(''), 2600)
    } catch { setSavedNote('รีเซ็ตไม่สำเร็จ'); setTimeout(() => setSavedNote(''), 2600) }
  }

  const saveLabel = () => { if (device) api.setDeviceLabel(device.serial, label).catch(() => {}) }
  const togglePlat = (key) => {
    const next = plats.includes(key) ? plats.filter(k => k !== key) : [...plats, key]
    setPlats(next)
    api.setDevicePlatforms(device.serial, next).catch(() => {})
  }

  const toPhone = useCallback((cx, cy) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: Math.round((cx - rect.left) / rect.width  * (device?.phoneW || 1080)),
      y: Math.round((cy - rect.top)  / rect.height * (device?.phoneH || 2340)),
    }
  }, [device?.phoneW, device?.phoneH])

  const onPointerDown = e => { dragRef.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp   = e => {
    if (!dragRef.current) return
    const dx = Math.abs(e.clientX - dragRef.current.x)
    const dy = Math.abs(e.clientY - dragRef.current.y)
    // คาลิเบรต + armed: บันทึก ratio ให้ key ปัจจุบัน + tap จริง (นำทางต่อ) + ไป key ถัดไป
    if (calibMode && armed && curKey) {
      const rect = imgRef.current?.getBoundingClientRect()
      const r = ratioFromRect(rect, e.clientX, e.clientY)
      if (r) {
        setWork(w => ({ ...w, [curKey]: r }))
        const p = toPhone(e.clientX, e.clientY)
        api.adbTap(device.serial, p.x, p.y)
        setArmed(false)
        setIdx(i => Math.min(i + 1, total - 1))
      }
      dragRef.current = null
      return
    }
    if (dx < 8 && dy < 8) {
      const p = toPhone(e.clientX, e.clientY)
      api.adbTap(device.serial, p.x, p.y)
    } else {
      const s = toPhone(dragRef.current.x, dragRef.current.y)
      const t = toPhone(e.clientX, e.clientY)
      api.adbSwipe(device.serial, s.x, s.y, t.x, t.y, 300)
    }
    dragRef.current = null
  }

  const key = code => api.adbKey(device.serial, code)

  if (!device) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-muted-foreground text-sm">ไม่พบเครื่อง</p>
    </div>
  )

  const NAV_BTNS = [
    { label: 'ย้อนกลับ', icon: RotateCcw, fn: () => key('KEYCODE_BACK')      },
    { label: 'หน้าหลัก', icon: Home,      fn: () => key('KEYCODE_HOME')       },
    { label: 'แอปล่าสุด', icon: Grid2x2,  fn: () => key('KEYCODE_APP_SWITCH') },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 bg-card">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/70 border border-border px-3 py-1.5 rounded-lg transition-all">
          <ArrowLeft size={12} /> กลับฟาร์ม
        </button>
        <span className="text-foreground font-semibold text-sm">{device.label || device.model}</span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" /> Live
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground hidden sm:block">
          คลิก = แตะ · ลาก = ปัด · คลิกขวา = ย้อนกลับ
        </span>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
        {/* Phone/Tablet screen — ปรับตามจอจริงของเครื่อง (contain: เต็มทั้งกว้าง/สูงตามที่พอดี) */}
        <div className="relative flex-1 flex items-center justify-center p-3 sm:p-5 overflow-hidden bg-background min-h-0 min-w-0">
          {calibMode && (
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-lg border pointer-events-none
              ${armed ? 'bg-accent text-white border-accent animate-pulse-dot' : 'bg-card text-muted-foreground border-border'}`}>
              <Crosshair size={13} />
              {armed
                ? <>แตะตำแหน่ง “{keys[idx]?.label}” บนจอ</>
                : <>โหมดคาลิเบรต — กด “จับตำแหน่งปุ่มนี้” ในแผงขวา</>}
            </div>
          )}
          <img
            ref={imgRef}
            src={api.streamUrl(device.serial)}
            alt="screen"
            onLoad={e => { const n = e.currentTarget; if (n.naturalWidth && n.naturalHeight) setAr(n.naturalWidth / n.naturalHeight) }}
            className="max-w-full max-h-full w-auto h-auto object-contain rounded-[1.5rem] border-[3px] border-border bg-black block select-none"
            style={{ aspectRatio: String(ar), cursor: 'crosshair', boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onContextMenu={e => { e.preventDefault(); key('KEYCODE_BACK') }}
          />
        </div>

        {/* Controls panel */}
        <div className="w-full lg:w-56 shrink-0 border-t lg:border-t-0 lg:border-l border-border flex flex-col gap-5 p-4 overflow-y-auto bg-card">
          {/* Readiness checklist */}
          <ReadinessSection device={{ ...device, label, platforms: plats }} />

          {/* คาลิเบรตพิกัดโพสต์ */}
          <CalibSection
            info={coordsInfo} calibMode={calibMode} onEnter={enterCalib} onExit={exitCalib}
            keys={keys} total={total} idx={idx} curKey={curKey} armed={armed} work={work}
            onArm={() => setArmed(true)} onSkip={() => stepTo(idx + 1)} onBack={() => stepTo(idx - 1)}
            onStep={stepTo} onRedo={redoCur} onSave={saveCoords} onReset={resetCoords} savedNote={savedNote}
          />

          {/* Account label */}
          <div>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">ชื่อ / บัญชี</p>
            <div className="relative">
              <Tag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={label} onChange={e => setLabel(e.target.value)} onBlur={saveLabel}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="เช่น บัญชี A"
                className="w-full bg-secondary border border-border text-foreground text-xs pl-7 pr-2 py-2 rounded-lg outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" />
            </div>
          </div>

          {/* Platform assignment */}
          <div>
            <p className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">
              <Share2 size={11} /> โพสต์ไปที่
            </p>
            <div className="flex flex-col gap-1.5">
              {platforms.map(p => {
                const on = plats.includes(p.key)
                const m = PLAT_META[p.key] || {}
                const Logo = m.Logo
                return (
                  <button key={p.key} onClick={() => p.ready && togglePlat(p.key)} disabled={!p.ready}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40
                      ${on ? 'bg-accent-wash text-accent border-accent/30' : 'bg-secondary text-muted-foreground border-border hover:border-accent/30'}`}>
                    {Logo && <Logo size={13} color={on ? m.color : undefined} />}
                    <span className="flex-1 text-left">{p.label}</span>
                    {!p.ready && <span className="text-[9px]">เร็วๆนี้</span>}
                    {on && p.ready && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">นำทาง</p>
            <div className="flex flex-col gap-1.5">
              {NAV_BTNS.map(({ label, icon: Icon, fn }) => (
                <button key={label} onClick={fn}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-muted-foreground text-xs font-medium bg-secondary hover:bg-secondary/70 hover:text-foreground border border-border transition-all">
                  <Icon size={12} strokeWidth={2} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <div>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">เสียง</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { icon: Volume2, label: 'เพิ่ม', code: 'KEYCODE_VOLUME_UP'   },
                { icon: VolumeX, label: 'ลด',   code: 'KEYCODE_VOLUME_DOWN' },
              ].map(({ icon: Icon, label, code }) => (
                <button key={label} onClick={() => key(code)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-muted-foreground text-xs font-medium bg-secondary hover:bg-secondary/70 hover:text-foreground border border-border transition-all">
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CalibSection({
  info, calibMode, onEnter, onExit, keys, total, idx, curKey, armed, work,
  onArm, onSkip, onBack, onStep, onRedo, onSave, onReset, savedNote,
}) {
  const isTablet   = !!info?.is_tablet
  const calibrated = !!info?.calibrated
  const doneCount  = keys.filter(k => work[k.key]).length
  const curLabel   = keys[idx]?.label || ''
  const curVal     = curKey ? work[curKey] : null
  const fmt        = v => v ? `${v.rx.toFixed(3)}, ${v.ry.toFixed(3)}` : '—'

  if (!calibMode) return (
    <div>
      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2.5">พิกัดโพสต์</p>
      <button onClick={onEnter} disabled={!info}
        className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-semibold border transition-all active:scale-[.98] disabled:opacity-40
          ${isTablet
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
            : 'bg-secondary text-foreground border-border hover:bg-secondary/70'}`}>
        {isTablet ? <Tablet size={13} /> : <Crosshair size={13} />} คาลิเบรตพิกัดโพสต์
      </button>
      <p className="mt-2 flex items-center gap-1.5 text-[10px]">
        {calibrated
          ? <><CheckCircle2 size={11} className="text-success shrink-0" /><span className="text-success font-semibold">คาลิเบรตแล้ว</span></>
          : <><Circle size={11} className="text-amber-500 shrink-0" /><span className="text-muted-foreground">ยังใช้ค่าเริ่มต้น(มือถือ)</span></>}
      </p>
      {isTablet && !calibrated && (
        <p className="text-[9px] text-amber-500 mt-1 leading-relaxed">เครื่องนี้เป็นแท็บเล็ต — แนะนำให้คาลิเบรตพิกัดก่อนใช้โพสต์</p>
      )}
      {savedNote && <p className="text-[10px] text-accent mt-1.5">{savedNote}</p>}
    </div>
  )

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-wash/40 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Crosshair size={13} className="text-accent" />
        <p className="text-foreground text-xs font-bold flex-1">คาลิเบรตพิกัด</p>
        <button onClick={onExit} title="ปิดโหมด"
          className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>

      {/* progress */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
        <span>ขั้น {Math.min(idx + 1, total)}/{total}</span>
        <span>{doneCount}/{total} จับแล้ว</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-3">
        <div className="h-full bg-accent transition-all" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
      </div>

      {/* current step */}
      <div className="rounded-lg bg-card border border-border p-2.5 mb-2.5">
        <p className="text-[10px] text-muted-foreground">แตะปุ่มนี้</p>
        <p className="text-sm font-bold text-foreground">{curLabel}</p>
        <p className="text-[10px] mt-0.5 flex items-center gap-1">
          {curVal
            ? <><Check size={10} className="text-success" /><span className="text-success">จับแล้ว ({fmt(curVal)})</span></>
            : <span className="text-muted-foreground">ยังไม่จับ</span>}
        </p>
        <button onClick={onArm}
          className={`flex items-center justify-center gap-1.5 w-full mt-2 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[.98]
            ${armed ? 'bg-accent/20 text-accent border border-accent' : 'bg-accent text-white hover:bg-accent/90'}`}>
          <Crosshair size={12} /> {armed ? 'รอแตะบนจอ…' : 'จับตำแหน่งปุ่มนี้'}
        </button>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <button onClick={onBack} disabled={idx <= 0}
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border disabled:opacity-40">
            <ChevronLeft size={11} /> ย้อน
          </button>
          <button onClick={onRedo}
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border">
            <RefreshCw size={11} /> ทำใหม่
          </button>
          <button onClick={onSkip} disabled={idx >= total - 1}
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border disabled:opacity-40">
            ข้าม <SkipForward size={11} />
          </button>
        </div>
      </div>

      {/* key list */}
      <div className="flex flex-col gap-1 mb-2.5 max-h-40 overflow-y-auto">
        {keys.map((k, i) => {
          const v = work[k.key]
          const on = i === idx
          return (
            <button key={k.key} onClick={() => onStep(i)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-left border transition-all
                ${on ? 'bg-accent-wash text-accent border-accent/40 font-semibold' : 'bg-secondary/50 text-muted-foreground border-transparent hover:border-border'}`}>
              {v ? <Check size={11} className="text-success shrink-0" /> : <Circle size={11} className="shrink-0 opacity-50" />}
              <span className="flex-1 truncate">{k.label}</span>
              {v && <span className="text-[9px] tabular-nums opacity-70">{v.rx.toFixed(2)},{v.ry.toFixed(2)}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <button onClick={onSave}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[.98]">
          <Save size={12} /> บันทึก
        </button>
        <button onClick={onReset}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[11px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border transition-all">
          <RotateCcw size={11} /> รีเซ็ตเป็นค่าเริ่มต้น(มือถือ)
        </button>
      </div>
      {savedNote && <p className="text-[10px] text-accent mt-2 text-center">{savedNote}</p>}
    </div>
  )
}

function ReadinessSection({ device }) {
  const { items, done, total, ready } = deviceReadiness(device)
  const [note, setNote] = useState('')
  const soon = (msg) => { setNote(msg); setTimeout(() => setNote(''), 2600) }
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">พร้อมใช้งาน</p>
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${ready ? 'bg-success/15 text-success' : 'bg-amber-400/15 text-amber-500'}`}>
          {done}/{total}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 mb-3">
        {items.map(it => (
          <div key={it.key} className="flex items-center gap-2 text-[11px]">
            {it.ok === true
              ? <CheckCircle2 size={13} className="text-success shrink-0" />
              : <Circle size={13} className={`shrink-0 ${it.ok === false ? 'text-amber-500' : 'text-muted-foreground'}`} />}
            <span className={it.ok === true ? 'text-foreground' : 'text-muted-foreground'}>{it.label}</span>
            {it.calib && it.ok !== true && (
              <button onClick={() => soon('ตัวช่วยจูนพิกัดกำลังจะมา — ต่อระบบจริงเฟสถัดไป')}
                className="ml-auto text-[10px] font-semibold text-accent hover:underline shrink-0">จูน</button>
            )}
          </div>
        ))}
      </div>
      {!ready && (
        <button onClick={() => soon('เตรียมเครื่องอัตโนมัติกำลังจะมา — ต่อระบบจริงเฟสถัดไป')}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[.98]">
          <Sparkles size={13} /> เตรียมเครื่องอัตโนมัติ
        </button>
      )}
      {note && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-accent bg-accent-wash border border-accent/20 rounded-lg px-2.5 py-1.5 animate-fade-in">
          <Sparkles size={11} className="shrink-0" /> {note}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground mt-2 leading-relaxed">* ADBKeyboard/จอ/จูนพิกัด ยังเป็นตัวอย่าง UI — จะต่อระบบจริงเฟสถัดไป</p>
    </div>
  )
}
