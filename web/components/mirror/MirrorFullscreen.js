'use client'
import { useRef, useCallback, useState, useEffect } from 'react'
import {
  ArrowLeft, Volume2, VolumeX, Home, RotateCcw, Grid2x2, Tag, Share2,
  CheckCircle2, Circle, Sparkles,
} from 'lucide-react'
import { api } from '@/lib/api'
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
        <div className="flex-1 flex items-center justify-center p-3 sm:p-5 overflow-hidden bg-background min-h-0 min-w-0">
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
