'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Stepper } from '@/components/ui/Stepper'
import { FormField } from '@/components/ui/FormField'
import { GatedButton } from '@/components/ui/GatedButton'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { termTh, termHint, MSG } from '@/lib/copy'
import {
  Zap, Store, KeyRound, Smartphone, Share2, ArrowRight, ArrowLeft,
  Loader2, Check, CheckCircle2, XCircle, Wifi, Plug, RefreshCw,
} from 'lucide-react'

const STEPS = [
  { label: termTh('shop_name') },
  { label: termTh('google_api_key') },
  { label: termTh('adb') },
  { label: termTh('platform') },
]

const REVIEW_MODES = [
  { key: 'auto', label: 'โพสต์อัตโนมัติทันที', desc: 'สร้างคลิปเสร็จแล้วโพสต์ให้เลย ไม่ต้องกดยืนยัน' },
  { key: 'hold', label: 'ให้ฉันตรวจก่อนโพสต์',  desc: 'สร้างคลิปเสร็จแล้วพักไว้ รอคุณกดอนุมัติก่อนจึงโพสต์' },
]

/**
 * Onboarding — ตัวช่วยตั้งค่าครั้งแรกแบบทีละขั้น (wizard, P2.2)
 *
 * props (ส่งมาจาก app/(app)/layout.js):
 *   status     — สถานะระบบสด (devices / extension / ws_connected) ใช้เช็ค "เชื่อมแล้ว"
 *   onRefresh  — สั่งดึงสถานะใหม่ (หลังเชื่อมมือถือ)
 *   onDone     — เรียกเมื่อบันทึกครบทุกขั้นแล้ว
 *   initialShop— ชื่อร้านเดิม (ถ้ามี)
 */
export function Onboarding({ status = {}, onRefresh, onDone, initialShop = '' }) {
  const toast = useToast()
  const [step, setStep] = useState(0)

  // ── ข้อมูลที่กรอก ──
  const [shop, setShop]         = useState(initialShop)
  const [apiKey, setApiKey]     = useState('')
  const [flowEmail, setFlowEmail] = useState('')
  const [selected, setSelected] = useState([])
  const [reviewMode, setReviewMode] = useState('auto')

  // ── สถานะย่อยของแต่ละขั้น ──
  const [keySet, setKeySet]       = useState(false)   // เคยตั้งคีย์ไว้แล้ว (จาก backend)
  const [keyTesting, setKeyTesting] = useState(false)
  const [keyOk, setKeyOk]         = useState(null)    // null|true|false
  const [ip, setIp]               = useState('')
  const [connecting, setConnecting] = useState(false)
  const [testingSerial, setTestingSerial] = useState('')
  const [tested, setTested]       = useState({})      // serial -> true
  const [plats, setPlats]         = useState([])
  const [saving, setSaving]       = useState(false)

  // ── ตัวเลือกเพิ่มเติม (มือถือรุ่นใหม่ / เคยต่อสาย USB) ──
  const [pairHost, setPairHost]   = useState('')
  const [pairPort, setPairPort]   = useState('')
  const [pairCode, setPairCode]   = useState('')
  const [pairing, setPairing]     = useState(false)
  const [usbSerial, setUsbSerial] = useState('')
  const [tcpiping, setTcpiping]   = useState(false)

  // โหลดค่าตั้งต้นเดิม (ถ้ามี) เพื่อเติมล่วงหน้า
  useEffect(() => {
    api.getSetup().then(d => {
      if (d.shop_name && !initialShop) setShop(d.shop_name)
      if (d.flow_email) setFlowEmail(d.flow_email)
      if (Array.isArray(d.platforms) && d.platforms.length) setSelected(d.platforms)
      if (d.review_mode === 'auto' || d.review_mode === 'hold') setReviewMode(d.review_mode)
      setKeySet(!!d.google_api_key_set)
    }).catch(() => {})
    api.platforms().then(d => setPlats(d.platforms || [])).catch(() => {})
  }, [initialShop])

  // เข้าขั้น "เชื่อมมือถือ" → ดึงสถานะเครื่องล่าสุด
  useEffect(() => { if (step === 2) onRefresh?.() }, [step, onRefresh])

  const devices = status.devices || []
  const online  = devices.filter(d => d.status === 'device')
  const usbCand = devices.filter(d => d.serial && !d.serial.includes(':'))  // เครื่องที่ต่อสาย (ยังไม่ใช่ Wi-Fi)
  const extConnected = !!status.extension?.connected

  // ── การกระทำ ──
  const testKey = async () => {
    setKeyTesting(true)
    try {
      const r = await api.testKey(apiKey.trim())
      if (r.ok) { setKeyOk(true); toast.success('คีย์ AI ใช้งานได้') }
      else { setKeyOk(false); toast.error(r.error || 'ทดสอบคีย์ไม่สำเร็จ') }
    } catch { setKeyOk(false) }   // api.js เด้ง toast ออฟไลน์ให้แล้ว
    setKeyTesting(false)
  }

  const connectWifi = async () => {
    const host = ip.trim()
    if (!host) { toast.error('ใส่เลข IP ของมือถือก่อน'); return }
    setConnecting(true)
    try {
      const r = await api.adbConnect({ ip: host, port: 5555 })
      if (r.ok) { toast.success('เชื่อมมือถือสำเร็จ'); onRefresh?.() }
      else toast.error(r.error || MSG.apiError)
    } catch {}
    setConnecting(false)
  }

  const pairDevice = async () => {
    setPairing(true)
    try {
      const r = await api.adbPair({ host: pairHost.trim(), port: pairPort.trim(), code: pairCode.trim() })
      if (r.ok) { toast.success('จับคู่มือถือสำเร็จ — ต่อไปใส่ IP แล้วกด "เชื่อมต่อ"'); onRefresh?.() }
      else toast.error(r.error || MSG.apiError)
    } catch {}
    setPairing(false)
  }

  const usbToWifi = async () => {
    if (!usbSerial) { toast.error('เลือกเครื่องที่ต่อสายอยู่ก่อน'); return }
    setTcpiping(true)
    try {
      const r = await api.adbTcpip({ serial: usbSerial })
      if (r.ok) { toast.success('เปิด Wi-Fi บนมือถือแล้ว — ใส่ IP ด้านบนแล้วกด "เชื่อมต่อ"'); onRefresh?.() }
      else toast.error(r.error || MSG.apiError)
    } catch {}
    setTcpiping(false)
  }

  const testDevice = async (serial) => {
    setTestingSerial(serial)
    try {
      const r = await api.adbTest(serial)
      if (r.ok || r.ready) { setTested(t => ({ ...t, [serial]: true })); toast.success('มือถือพร้อมใช้งาน') }
      else toast.error(r.error || 'มือถือยังไม่พร้อม — ลองปลุกหน้าจอแล้วลองใหม่')
    } catch {}
    setTestingSerial('')
  }

  const togglePlatform = (key) =>
    setSelected(sel => sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key])

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        shop_name:   shop.trim(),
        flow_email:  flowEmail.trim(),
        platforms:   selected,
        review_mode: reviewMode,
      }
      if (apiKey.trim()) payload.google_api_key = apiKey.trim()
      const r = await api.saveSetup(payload)
      if (r.ok) { toast.success(MSG.saveOk); onDone?.(r.shop_name) }
      else toast.error(r.error || MSG.saveFail)
    } catch { toast.error(MSG.saveFail) }
    setSaving(false)
  }

  // ── เงื่อนไขเปิดปุ่ม "ถัดไป" ของแต่ละขั้น ──
  const gate = [
    { ready: shop.trim().length > 0, reason: 'ใส่ชื่อร้านก่อนจึงจะไปต่อได้' },
    { ready: keyOk === true || (keySet && !apiKey.trim()),
      reason: 'กดปุ่ม "ทดสอบคีย์" ให้ผ่านก่อน หรือกด "ข้ามไปก่อน"' },
    { ready: online.length > 0, reason: MSG.needDevice },
    { ready: selected.length > 0, reason: 'เลือกอย่างน้อย 1 แพลตฟอร์มปลายทาง' },
  ]

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-base p-4 overflow-y-auto">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[520px] my-6 animate-scale-in">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center glow-accent mb-3"
               style={{ background: 'linear-gradient(135deg,#b975f9,#a855f7)' }}>
            <Zap size={26} className="text-white fill-white" />
          </div>
          <h1 className="text-foreground text-xl font-extrabold tracking-tight">ตั้งค่า VDO Gen Auto Pilot ครั้งแรก</h1>
          <p className="text-muted-foreground text-sm mt-1.5">ทำ 4 ขั้นสั้น ๆ แล้วเริ่มโพสต์คลิปอัตโนมัติได้เลย</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card border border-border shadow-lift p-5 sm:p-6">
          <Stepper steps={STEPS} current={step} className="mb-6" />

          <div className="min-h-[240px]">
            {step === 0 && (
              <StepShop shop={shop} setShop={setShop} onEnter={() => gate[0].ready && next()} />
            )}
            {step === 1 && (
              <StepKey
                apiKey={apiKey} setApiKey={(v) => { setApiKey(v); setKeyOk(null) }}
                keySet={keySet} keyOk={keyOk} keyTesting={keyTesting} onTest={testKey}
                flowEmail={flowEmail} setFlowEmail={setFlowEmail}
              />
            )}
            {step === 2 && (
              <StepPhone
                ip={ip} setIp={setIp} connecting={connecting} onConnect={connectWifi}
                online={online} usbCand={usbCand} extConnected={extConnected}
                wsConnected={!!status.ws_connected}
                testingSerial={testingSerial} tested={tested} onTestDevice={testDevice}
                pairHost={pairHost} setPairHost={setPairHost}
                pairPort={pairPort} setPairPort={setPairPort}
                pairCode={pairCode} setPairCode={setPairCode}
                pairing={pairing} onPair={pairDevice}
                usbSerial={usbSerial} setUsbSerial={setUsbSerial}
                tcpiping={tcpiping} onUsbToWifi={usbToWifi}
                onRefresh={onRefresh}
              />
            )}
            {step === 3 && (
              <StepPlatforms
                plats={plats} selected={selected} onToggle={togglePlatform}
                reviewMode={reviewMode} setReviewMode={setReviewMode}
              />
            )}
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-border">
            <div>
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={back}>
                  <ArrowLeft size={15} /> ย้อนกลับ
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {(step === 1 || step === 2) && (
                <Button variant="link" size="sm" onClick={next}
                        className="text-muted-foreground">
                  ข้ามไปก่อน
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <GatedButton ready={gate[step].ready} reason={gate[step].reason}
                             onClick={next} className="glow-accent">
                  ถัดไป <ArrowRight size={15} />
                </GatedButton>
              ) : (
                <GatedButton ready={gate[3].ready} reason={gate[3].reason}
                             onClick={save} disabled={saving} className="glow-accent min-w-[170px]">
                  {saving
                    ? <Loader2 size={15} className="animate-spin" />
                    : <>เริ่มใช้งาน <ArrowRight size={15} /></>}
                </GatedButton>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-muted-foreground text-[11px] mt-4">
          ข้อมูลถูกบันทึกในเครื่องของคุณเท่านั้น — แก้ไขได้ภายหลังที่หน้าตั้งค่า
        </p>
      </div>
    </div>
  )
}

/* ────────────────────────── ขั้นตอนย่อย ────────────────────────── */

function StepShop({ shop, setShop, onEnter }) {
  return (
    <StepBody icon={Store} title={termTh('shop_name')}
              desc="ชื่อนี้จะไปอยู่ในแคปชันและรายงาน — แก้ทีหลังได้">
      <FormField label={termTh('shop_name')} required info={termHint('shop_name')} htmlFor="ob-shop">
        <Input id="ob-shop" value={shop} autoFocus placeholder="เช่น ร้านของฉัน"
               onChange={e => setShop(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && onEnter?.()} />
      </FormField>
    </StepBody>
  )
}

function StepKey({ apiKey, setApiKey, keySet, keyOk, keyTesting, onTest, flowEmail, setFlowEmail }) {
  return (
    <StepBody icon={KeyRound} title={termTh('google_api_key')}
              desc="รหัสลับให้ AI ช่วยคิดข้อความ/สคริปต์คลิป — ขอฟรีที่ aistudio.google.com/apikey">
      <FormField label={termTh('google_api_key')} info={termHint('google_api_key')} htmlFor="ob-key"
                 hint={keySet ? 'ตั้งไว้แล้ว — เว้นว่างเพื่อใช้คีย์เดิม หรือกรอกใหม่เพื่อเปลี่ยน' : 'คีย์ขึ้นต้นด้วย AIza…'}>
        <Input id="ob-key" type="password" value={apiKey}
               placeholder={keySet ? 'ตั้งไว้แล้ว ✓' : 'วางคีย์ที่นี่'}
               onChange={e => setApiKey(e.target.value)} />
      </FormField>

      <div className="flex items-center gap-2.5 mt-1">
        <Button variant="outline" size="sm" onClick={onTest}
                disabled={keyTesting || (!apiKey.trim() && !keySet)}>
          {keyTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          ทดสอบคีย์
        </Button>
        {keyOk === true && (
          <span className="flex items-center gap-1 text-success text-xs font-medium">
            <CheckCircle2 size={14} /> ใช้งานได้
          </span>
        )}
        {keyOk === false && (
          <span className="flex items-center gap-1 text-danger text-xs font-medium">
            <XCircle size={14} /> ใช้ไม่ได้
          </span>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border/60">
        <FormField label="อีเมล Google (สำหรับสร้างคลิป) — ไม่บังคับ" htmlFor="ob-email"
                   info="อีเมลบัญชี Google ที่ใช้เข้า Flow เพื่อให้ AI สร้างคลิป (ใส่ทีหลังได้)">
          <Input id="ob-email" type="email" value={flowEmail}
                 placeholder="you@gmail.com"
                 onChange={e => setFlowEmail(e.target.value)} />
        </FormField>
      </div>
    </StepBody>
  )
}

function StepPhone({
  ip, setIp, connecting, onConnect, online, usbCand, extConnected, wsConnected,
  testingSerial, tested, onTestDevice,
  pairHost, setPairHost, pairPort, setPairPort, pairCode, setPairCode, pairing, onPair,
  usbSerial, setUsbSerial, tcpiping, onUsbToWifi, onRefresh,
}) {
  return (
    <StepBody icon={Smartphone} title={termTh('adb')}
              desc="เชื่อมมือถือกับคอมผ่าน Wi-Fi เพื่อให้ระบบโพสต์ให้อัตโนมัติ">

      {/* checklist ความพร้อม */}
      <div className="rounded-xl bg-secondary/60 border border-border p-3 flex flex-col gap-2 mb-4">
        <ReadyRow ok={wsConnected} label={termTh('desktop')} info={termHint('desktop')} />
        <ReadyRow ok={extConnected} label={termTh('extension')} info={termHint('extension')} />
        <ReadyRow ok={online.length > 0}
                  label={online.length > 0 ? `มือถือออนไลน์ ${online.length} เครื่อง` : 'ยังไม่มีมือถือออนไลน์'}
                  info={termHint('serial')} />
      </div>

      {/* เชื่อมผ่าน Wi-Fi (หลัก) */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FormField label={termTh('wifi_adb')} info={termHint('wifi_adb')} htmlFor="ob-ip">
            <Input id="ob-ip" value={ip} placeholder="เช่น 192.168.1.20"
                   onChange={e => setIp(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && onConnect()} />
          </FormField>
        </div>
        <Button onClick={onConnect} disabled={connecting} className="mb-[2px]">
          {connecting ? <Loader2 size={15} className="animate-spin" /> : <Wifi size={15} />}
          เชื่อมต่อ
        </Button>
      </div>

      {/* รายการเครื่องที่ออนไลน์ + ปุ่มทดสอบมือถือ */}
      {online.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {online.map(d => (
            <div key={d.serial}
                 className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium truncate">{d.model || d.serial}</p>
                <p className="text-muted-foreground text-[11px] truncate">{d.serial}</p>
              </div>
              {tested[d.serial] ? (
                <span className="flex items-center gap-1 text-success text-xs font-medium shrink-0">
                  <CheckCircle2 size={14} /> พร้อม
                </span>
              ) : (
                <Button variant="outline" size="sm" className="shrink-0"
                        onClick={() => onTestDevice(d.serial)}
                        disabled={testingSerial === d.serial}>
                  {testingSerial === d.serial
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Check size={13} />}
                  ทดสอบมือถือ
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-3">
        <Button variant="ghost" size="sm" onClick={() => onRefresh?.()} className="text-muted-foreground">
          <RefreshCw size={13} /> เช็คอีกครั้ง
        </Button>
      </div>

      {/* ตัวเลือกเพิ่มเติม */}
      <details className="mt-2 group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
          ตัวเลือกเพิ่มเติม (มือถือรุ่นใหม่ Android 11+ / เคยต่อสาย USB)
        </summary>

        <div className="mt-3 flex flex-col gap-4 rounded-xl border border-border/70 p-3">
          {/* จับคู่ก่อน (Android 11+) */}
          <div>
            <p className="text-foreground text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Plug size={13} /> จับคู่ก่อน (Android 11 ขึ้นไป)
              <InfoTooltip text="ในมือถือ: ตั้งค่า → ตัวเลือกนักพัฒนา → การดีบัก Wi-Fi → จับคู่อุปกรณ์ด้วยรหัส แล้วนำเลขที่แสดงมากรอก" />
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input value={pairHost} placeholder="ที่อยู่ (host)" onChange={e => setPairHost(e.target.value)} />
              <Input value={pairPort} placeholder="พอร์ตจับคู่" onChange={e => setPairPort(e.target.value)} />
              <Input value={pairCode} placeholder="รหัส 6 หลัก" onChange={e => setPairCode(e.target.value)} />
              <Button variant="secondary" size="sm" onClick={onPair}
                      disabled={pairing || !pairHost.trim() || !pairPort.trim() || !pairCode.trim()}>
                {pairing ? <Loader2 size={14} className="animate-spin" /> : null}
                จับคู่
              </Button>
            </div>
          </div>

          {/* เปลี่ยนเครื่องที่ต่อสายอยู่ให้เป็น Wi-Fi */}
          <div>
            <p className="text-foreground text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Wifi size={13} /> เปลี่ยนเครื่องที่ต่อสายอยู่ให้เป็น Wi-Fi
              <InfoTooltip text={termHint('wifi_adb')} />
            </p>
            {usbCand.length > 0 ? (
              <div className="flex gap-2">
                <select value={usbSerial} onChange={e => setUsbSerial(e.target.value)}
                        className="flex-1 bg-secondary border border-border text-foreground text-sm px-3 py-2 rounded-lg outline-none focus:border-accent">
                  <option value="">เลือกเครื่องที่ต่อสาย…</option>
                  {usbCand.map(d => (
                    <option key={d.serial} value={d.serial}>{d.model || d.serial}</option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" onClick={onUsbToWifi} disabled={tcpiping || !usbSerial}>
                  {tcpiping ? <Loader2 size={14} className="animate-spin" /> : null}
                  เปิด Wi-Fi
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-[11px]">ยังไม่พบเครื่องที่ต่อสาย USB — เสียบสายก่อนแล้วกด "เช็คอีกครั้ง"</p>
            )}
          </div>
        </div>
      </details>
    </StepBody>
  )
}

function StepPlatforms({ plats, selected, onToggle, reviewMode, setReviewMode }) {
  return (
    <StepBody icon={Share2} title={termTh('platform')}
              desc="เลือกช่องทางที่จะนำคลิปไปโพสต์ (เลือกได้หลายที่)">
      <div className="flex items-center gap-1.5 mb-2">
        <p className="text-muted-foreground text-xs">{termTh('platform')}</p>
        <InfoTooltip text={termHint('platform')} />
      </div>
      <div className="flex flex-col gap-1.5">
        {plats.length === 0 && (
          <p className="text-muted-foreground text-xs">กำลังโหลดรายการแพลตฟอร์ม…</p>
        )}
        {plats.map(p => {
          const on = selected.includes(p.key) && p.ready
          return (
            <button key={p.key} type="button" disabled={!p.ready}
                    onClick={() => p.ready && onToggle(p.key)}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors
                      ${on ? 'border-accent bg-accent-wash' : 'border-border bg-secondary/40'}
                      ${p.ready ? 'hover:border-accent/60 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
              <span className="flex items-center gap-2">
                <span className={`text-sm font-medium ${p.ready ? 'text-foreground' : 'text-muted-foreground'}`}>{p.label}</span>
                {!p.ready
                  ? <Badge tone="mute">เร็ว ๆ นี้</Badge>
                  : p.tuned ? <Badge tone="ok">พร้อม</Badge> : <Badge tone="warn">ต้องจูน</Badge>}
              </span>
              <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors
                ${on ? 'bg-accent border-accent' : 'border-border'}`}>
                {on && <Check size={13} strokeWidth={3} className="text-white" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-muted-foreground text-xs">โหมดการโพสต์</p>
          <InfoTooltip text={termHint('dry_run')} />
        </div>
        <div className="flex flex-col gap-2">
          {REVIEW_MODES.map(m => {
            const on = reviewMode === m.key
            return (
              <button key={m.key} type="button" onClick={() => setReviewMode(m.key)}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors
                        ${on ? 'border-accent bg-accent-wash' : 'border-border bg-secondary/40 hover:border-accent/60'}`}>
                <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                  ${on ? 'border-accent' : 'border-border'}`}>
                  {on && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{m.label}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{m.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </StepBody>
  )
}

/* ────────────────────────── ชิ้นส่วนย่อย ────────────────────────── */

function StepBody({ icon: Icon, title, desc, children }) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-xl bg-accent-wash flex items-center justify-center shrink-0">
          <Icon size={16} className="text-accent" />
        </div>
        <h2 className="text-foreground text-base font-bold">{title}</h2>
      </div>
      {desc && <p className="text-muted-foreground text-xs mb-4 leading-relaxed">{desc}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full bg-secondary border border-border text-foreground text-sm px-3.5 py-2.5 rounded-lg outline-none
        focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-muted-foreground transition-all ${className}`}
    />
  )
}

function ReadyRow({ ok, label, info }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok
        ? <CheckCircle2 size={15} className="text-success shrink-0" />
        : <XCircle size={15} className="text-muted-foreground shrink-0" />}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      {info && <InfoTooltip text={info} />}
    </div>
  )
}

function Badge({ tone, children }) {
  const cls = tone === 'ok'   ? 'text-success bg-success/10'
            : tone === 'warn' ? 'text-amber-500 bg-amber-400/10'
            : 'text-muted-foreground bg-secondary'
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}
