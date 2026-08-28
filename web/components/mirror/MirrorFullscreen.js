'use client'
import { useRef, useCallback, useState, useEffect } from 'react'
import {
  ArrowLeft, Volume2, VolumeX, Home, RotateCcw, Grid2x2, Tag, Share2,
  CheckCircle2, Circle, Sparkles, Crosshair, Save, SkipForward, ChevronLeft,
  X, Check, Tablet, RefreshCw, Loader2, PanelRightClose, PanelRightOpen,
} from 'lucide-react'
import { api } from '@/lib/api'
import { ScrcpyScreen, hasWebCodecs } from '@/components/mirror/ScrcpyScreen'
import { ratioFromRect, normalizeCoords } from '@/lib/calib'
import { PLAT_META } from '@/lib/platform-meta'
import { deviceReadiness } from '@/lib/device-readiness'

// พิกัดสำรองของเครื่องนี้มาจากไหน (ตรงกับ /api/devices/{serial}/coords)
const SOURCE_LABEL = {
  db:     'คาลิเบรตเองแล้ว',
  auto:   'ระบบจำพิกัดให้เองแล้ว',
  preset: 'ใช้ค่าที่มากับโปรแกรม',
}

export function MirrorFullscreen({ device, platforms = [], live: liveProp, onBack }) {
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
  const [panelOpen, setPanelOpen] = useState(true)   // แผงตั้งค่าด้านขวา (drawer) — ปิดได้เพื่อให้จอใหญ่เต็มที่
  const [liveStatus, setLiveStatus] = useState('connecting')   // connecting | live | closed | error
  const [coordsInfo, setCoordsInfo] = useState(null)  // {coords,defaults,keys,calibrated,is_tablet,resolution}
  const [calibMode, setCalibMode]   = useState(false)
  const [work, setWork]             = useState({})    // {key:{rx,ry}} กำลังจับ
  const [idx, setIdx]               = useState(0)     // ขั้นปัจจุบัน
  const [armed, setArmed]           = useState(false) // จับ tap ถัดไป
  const [savedNote, setSavedNote]   = useState('')
  // จอสด scrcpy พังต้องบอกผู้ใช้ + มีทางสั่งต่อใหม่ (ตัวคอมโพเนนต์หยุดต่อเองหลังถอยหลังครบรอบ)
  const [liveErr, setLiveErr]   = useState('')
  const [liveTry, setLiveTry]   = useState(0)
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
    setSavedNote(''); setCalibMode(true); setPanelOpen(true)
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

  // โหลดชุดพิกัดสำเร็จรูปมาเป็นค่าตั้งต้น แล้วผู้ใช้แก้เฉพาะจุดที่เพี้ยนได้
  const loadCoordSet = (coords) => {
    setWork(normalizeCoords(coords))
    setIdx(0); setArmed(false)
    setSavedNote('โหลดชุดพิกัดแล้ว — กด "บันทึกให้เครื่องนี้" เพื่อใช้จริง')
    setTimeout(() => setSavedNote(''), 3200)
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

  // จอสด scrcpy (ดีเลย์ต่ำ + คุมผ่าน control socket) — ถ้าเบราว์เซอร์ไม่มี WebCodecs ค่อยตกไปใช้ MJPEG เดิม
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (liveProp !== undefined) { setLive(!!liveProp && hasWebCodecs()); return }
    if (!hasWebCodecs()) return
    api.scrcpyAvailable().then(r => setLive(!!r.available)).catch(() => setLive(false))
  }, [liveProp])

  // ตอนคาลิเบรต: scrcpy แตะให้จริงอยู่แล้ว เราแค่จดสัดส่วนพิกัดที่แตะ
  const onTapRatio = r => {
    if (!(calibMode && armed && curKey)) return
    setWork(w => ({ ...w, [curKey]: r }))
    setArmed(false)
    setIdx(i => Math.min(i + 1, total - 1))
  }

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
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
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
        <span className="ml-auto text-[13px] text-muted-foreground hidden xl:block">
          คลิก = แตะ · ลาก = ปัด · คลิกขวา = ย้อนกลับ
        </span>
        <button onClick={() => setPanelOpen(v => !v)}
          title={panelOpen ? 'ซ่อนแผงตั้งค่า (จอใหญ่ขึ้น)' : 'แสดงแผงตั้งค่า'}
          className="ml-2 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/70 border border-border px-3 py-1.5 rounded-lg transition-all">
          {panelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          <span className="hidden sm:inline">{panelOpen ? 'ซ่อนแผง' : 'แผงตั้งค่า'}</span>
        </button>
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
          {live ? (
            <div className="relative flex items-center justify-center w-full h-full min-h-0 min-w-0">
              <ScrcpyScreen
                serial={device.serial}
                maxSize={1080}
                maxFps={30}
                retryKey={liveTry}
                onSize={(w, h) => setAr(w / h)}
                onStatus={(s, msg) => {
                  setLiveStatus(s)
                  setLiveErr(s === 'error' ? (msg || 'เชื่อมจอไม่ได้') : '')
                }}
                onTapRatio={onTapRatio}
                className="max-w-full max-h-full w-auto h-auto rounded-[1.5rem] border-[3px] border-border select-none"
                style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}
              />

              {/* จอยังดำอยู่ = ยังต่อไม่ติด — บอกให้ชัดว่ากำลังทำอะไร ไม่ใช่ปล่อยดำเฉย ๆ */}
              {liveStatus !== 'live' && !liveErr && (
                <div className="absolute inset-0 grid place-items-center rounded-[1.5rem] pointer-events-none">
                  <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-black/70 text-white">
                    <Loader2 size={26} className="animate-spin" />
                    <p className="text-sm font-semibold">
                      {liveStatus === 'closed' ? 'จอหลุด — กำลังต่อใหม่…' : 'กำลังเชื่อมจอมือถือ…'}
                    </p>
                    <p className="text-[13px] text-white/70 text-center leading-relaxed max-w-[16rem]">
                      ครั้งแรกใช้เวลา 5-15 วิ (ส่ง scrcpy-server เข้าเครื่อง แล้วรอเฟรมแรก)
                      <br />ถ้าจอมือถือดับอยู่ ให้ปลดล็อกเครื่องก่อน
                    </p>
                  </div>
                </div>
              )}
              {liveErr && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-danger/15 border border-danger/30 text-danger text-xs max-w-[90%]">
                  <span className="truncate">{liveErr}</span>
                  <button onClick={() => { setLiveErr(''); setLiveTry(n => n + 1) }}
                          className="shrink-0 flex items-center gap-1 font-bold bg-danger text-white px-2.5 py-1 rounded-full">
                    <RefreshCw size={11} /> ลองใหม่
                  </button>
                </div>
              )}
            </div>
          ) : (
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
          )}
        </div>

        {/* Controls panel */}
        <div className={`shrink-0 border-t lg:border-t-0 lg:border-l border-border flex-col gap-5 overflow-y-auto bg-card transition-all duration-200
             ${panelOpen ? 'flex w-full p-4' : 'hidden'}
             ${calibMode ? 'lg:w-[30rem] xl:w-[34rem]' : 'lg:w-[19rem] xl:w-[22rem]'}`}>
          {/* Readiness checklist */}
          <ReadinessSection device={{ ...device, label, platforms: plats }} />

          {/* คาลิเบรตพิกัดโพสต์ */}
          <CalibSection
            info={coordsInfo} calibMode={calibMode} onEnter={enterCalib} onExit={exitCalib}
            keys={keys} total={total} idx={idx} curKey={curKey} armed={armed} work={work}
            onArm={() => setArmed(true)} onSkip={() => stepTo(idx + 1)} onBack={() => stepTo(idx - 1)}
            onStep={stepTo} onRedo={redoCur} onSave={saveCoords} onReset={resetCoords} savedNote={savedNote}
            onLoadSet={loadCoordSet}
          />

          {/* Account label */}
          <div>
            <p className="t-cap font-semibold mb-2.5">ชื่อ / บัญชี</p>
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
            <p className="flex items-center gap-1.5 t-cap font-semibold mb-2.5">
              <Share2 size={11} /> โพสต์ไปที่
            </p>
            <div className="flex flex-col gap-1.5">
              {/* โชว์เฉพาะแพลตฟอร์มที่จูนกับแอปจริงแล้ว — ที่เหลือมีโค้ดแต่ยังไม่เคยทดสอบ
                  โชว์ไว้ก็หลอกให้กดแล้วโพสต์ไม่ขึ้น */}
              {platforms.filter(p => p.tuned).map(p => {
                const on = plats.includes(p.key)
                const m = PLAT_META[p.key] || {}
                const Logo = m.Logo
                return (
                  <button key={p.key} onClick={() => p.ready && togglePlat(p.key)} disabled={!p.ready}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40
                      ${on ? 'bg-accent-wash text-accent border-accent/30' : 'bg-secondary text-muted-foreground border-border hover:border-accent/30'}`}>
                    {Logo && <Logo size={13} color={on ? m.color : undefined} />}
                    <span className="flex-1 text-left">{p.label}</span>
                    {!p.ready && <span className="text-[11px]">เร็วๆนี้</span>}
                    {on && p.ready && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </button>
                )
              })}
              {platforms.some(p => !p.tuned) && (
                <p className="t-cap leading-relaxed mt-0.5">
                  แพลตฟอร์มอื่น (TikTok / Reels / IG / YouTube) ยังไม่เปิด — flow โพสต์ยังไม่ได้จูนกับแอปจริง
                </p>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div>
            <p className="t-cap font-semibold mb-2.5">นำทาง</p>
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
            <p className="t-cap font-semibold mb-2.5">เสียง</p>
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
  onArm, onSkip, onBack, onStep, onRedo, onSave, onReset, savedNote, onLoadSet,
}) {
  const isTablet   = !!info?.is_tablet
  const calibrated = !!info?.calibrated
  const doneCount  = keys.filter(k => work[k.key]).length
  const curLabel   = keys[idx]?.label || ''
  const curVal     = curKey ? work[curKey] : null
  const fmt        = v => v ? `${v.rx.toFixed(3)}, ${v.ry.toFixed(3)}` : '—'

  if (!calibMode) return (
    <div>
      <p className="t-cap font-semibold mb-2.5">พิกัดโพสต์</p>
      <button onClick={onEnter} disabled={!info}
        className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-semibold border transition-all active:scale-[.98] disabled:opacity-40
          ${isTablet
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
            : 'bg-secondary text-foreground border-border hover:bg-secondary/70'}`}>
        {isTablet ? <Tablet size={13} /> : <Crosshair size={13} />} คาลิเบรตพิกัดโพสต์
      </button>
      <p className="mt-2 flex items-center gap-1.5 text-[12px]">
        {calibrated
          ? <><CheckCircle2 size={11} className="text-success shrink-0" />
              <span className="text-success font-semibold">{SOURCE_LABEL[info?.source] || 'คาลิเบรตแล้ว'}</span></>
          : <><Circle size={11} className="text-amber-500 shrink-0" /><span className="text-muted-foreground">ยังใช้ค่าเริ่มต้น(มือถือ)</span></>}
      </p>
      {info?.source === 'auto' && (
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
          ระบบจำพิกัดจากหน้าจอจริงได้ {info.auto_learned}/18 จุด — ยิ่งโพสต์บ่อยยิ่งครบเอง
        </p>
      )}
      {isTablet && !calibrated && (
        <p className="text-[12px] text-amber-500 mt-1 leading-relaxed">
          เครื่องนี้เป็นแท็บเล็ต — โพสต์ได้เลย ระบบหาปุ่มจากหน้าจอจริง แล้วจะจำพิกัดสำรองให้เองหลังโพสต์รอบแรก
        </p>
      )}
      {savedNote && <p className="text-[10px] text-accent mt-1.5">{savedNote}</p>}
    </div>
  )

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-wash/40 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Crosshair size={13} className="text-accent" />
        <p className="text-foreground t-section flex-1">คาลิเบรตพิกัด</p>
        <button onClick={onExit} title="ปิดโหมด"
          className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>

      {/* progress */}
      <div className="flex items-center justify-between t-cap mb-1.5">
        <span>ขั้น {Math.min(idx + 1, total)}/{total}</span>
        <span>{doneCount}/{total} จับแล้ว</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-3">
        <div className="h-full bg-accent transition-all" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
      </div>

      {/* current step */}
      <div className="rounded-lg bg-card border border-border p-2.5 mb-2.5">
        <p className="t-cap">แตะปุ่มนี้</p>
        <p className="text-[17px] font-bold text-foreground">{curLabel}</p>
        <p className="text-[13px] mt-0.5 flex items-center gap-1">
          {curVal
            ? <><Check size={10} className="text-success" /><span className="text-success">จับแล้ว ({fmt(curVal)})</span></>
            : <span className="text-muted-foreground">ยังไม่จับ</span>}
        </p>
        <button onClick={onArm}
          className={`flex items-center justify-center gap-1.5 w-full mt-2 py-2 rounded-lg text-[15px] font-semibold transition-all active:scale-[.98]
            ${armed ? 'bg-accent/20 text-accent border border-accent' : 'bg-accent text-white hover:bg-accent/90'}`}>
          <Crosshair size={12} /> {armed ? 'รอแตะบนจอ…' : 'จับตำแหน่งปุ่มนี้'}
        </button>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <button onClick={onBack} disabled={idx <= 0}
            className="flex items-center justify-center gap-1 py-2 rounded-lg text-[13px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border disabled:opacity-40">
            <ChevronLeft size={11} /> ย้อน
          </button>
          <button onClick={onRedo}
            className="flex items-center justify-center gap-1 py-2 rounded-lg text-[13px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border">
            <RefreshCw size={11} /> ทำใหม่
          </button>
          <button onClick={onSkip} disabled={idx >= total - 1}
            className="flex items-center justify-center gap-1 py-2 rounded-lg text-[13px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border disabled:opacity-40">
            ข้าม <SkipForward size={11} />
          </button>
        </div>
      </div>

      {/* key list */}
      <div className="flex flex-col gap-1 mb-2.5 max-h-72 overflow-y-auto">
        {keys.map((k, i) => {
          const v = work[k.key]
          const on = i === idx
          return (
            <button key={k.key} onClick={() => onStep(i)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] text-left border transition-all
                ${on ? 'bg-accent-wash text-accent border-accent/40 font-semibold' : 'bg-secondary/50 text-muted-foreground border-transparent hover:border-border'}`}>
              {v ? <Check size={11} className="text-success shrink-0" /> : <Circle size={11} className="shrink-0 opacity-50" />}
              <span className="flex-1 truncate">{k.label}</span>
              {v && <span className="text-[11px] tabular-nums opacity-70">{v.rx.toFixed(2)},{v.ry.toFixed(2)}</span>}
            </button>
          )
        })}
      </div>

      {/* ชุดพิกัดที่บันทึกไว้ — ก๊อปจากเครื่องรุ่นเดียวกันมาใช้ได้เลย ไม่ต้องจับใหม่ทีละจุด */}
      <PresetPicker work={work} onLoad={onLoadSet} />

      <div className="flex flex-col gap-1.5">
        <button onClick={onSave}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg text-[15px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[.98]">
          <Save size={13} /> บันทึกให้เครื่องนี้
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

// เลือกชุดพิกัดที่มีอยู่ (มากับโปรแกรม/ที่เคยบันทึก) หรือบันทึกชุดปัจจุบันเก็บไว้
function PresetPicker({ work, onLoad }) {
  const [list, setList] = useState([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const refresh = () => api.coordPresets().then(d => setList(d.presets || [])).catch(() => setList([]))
  useEffect(() => { refresh() }, [])

  const pick = id => {
    const p = list.find(x => x.id === id)
    if (p) onLoad(p.coords)
  }
  const save = async () => {
    const coords = Object.fromEntries(Object.entries(work).map(([k, v]) => [k, [v.rx, v.ry]]))
    try {
      const r = await api.saveCoordPreset(name, coords)
      if (!r.ok) { setNote(r.error || 'บันทึกไม่สำเร็จ'); return }
      setNaming(false); setName(''); refresh()
      setNote(r.replaced ? 'ทับชุดเดิมแล้ว' : 'บันทึกชุดพิกัดแล้ว')
    } catch { setNote('บันทึกไม่สำเร็จ') }
    setTimeout(() => setNote(''), 2600)
  }

  const has = Object.keys(work || {}).length > 0
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 mb-2.5 flex flex-col gap-2">
      <p className="t-cap font-semibold">ชุดพิกัดสำเร็จรูป</p>
      <select defaultValue="" onChange={e => { pick(e.target.value); e.target.value = '' }}
        className="w-full rounded-lg border border-border bg-secondary px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-accent">
        <option value="">{list.length ? 'โหลดชุดพิกัด…' : 'ยังไม่มีชุดพิกัด'}</option>
        {list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {naming ? (
        <div className="flex items-center gap-1.5">
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="ชื่อชุด เช่น แท็บเล็ต SM-P585Y"
            className="flex-1 min-w-0 rounded-lg border border-border bg-secondary px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-accent" />
          <button onClick={save} disabled={!name.trim()}
            className="shrink-0 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold bg-accent text-white disabled:opacity-40">เก็บ</button>
          <button onClick={() => setNaming(false)} className="shrink-0 text-[13px] text-muted-foreground hover:text-foreground">ยกเลิก</button>
        </div>
      ) : (
        <button onClick={() => setNaming(true)} disabled={!has}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[13px] font-medium bg-secondary text-muted-foreground hover:text-foreground border border-border disabled:opacity-40">
          <Save size={12} /> เก็บชุดนี้ไว้ใช้กับเครื่องอื่น
        </button>
      )}
      {note && <p className="text-[12px] text-accent">{note}</p>}
    </div>
  )
}

function ReadinessSection({ device }) {
  const { items, done, total, ready } = deviceReadiness(device)
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <p className="t-cap font-semibold">พร้อมใช้งาน</p>
        <span className={`ml-auto t-badge px-2 py-0.5 rounded-full ${ready ? 'bg-success/15 text-success' : 'bg-amber-400/15 text-amber-500'}`}>
          {done}/{total}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map(it => (
          <div key={it.key} className="flex items-center gap-2 text-[13px]">
            {it.ok
              ? <CheckCircle2 size={13} className="text-success shrink-0" />
              : <Circle size={13} className="shrink-0 text-amber-500" />}
            <span className={it.ok ? 'text-foreground' : 'text-muted-foreground'}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
