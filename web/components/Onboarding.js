'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Stepper } from '@/components/ui/Stepper'
import { FormField } from '@/components/ui/FormField'
import { GatedButton } from '@/components/ui/GatedButton'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Dialog } from '@/components/ui/Dialog'
import { termTh, termHint, MSG } from '@/lib/copy'
import {
  Zap, Store, KeyRound, Smartphone, Share2, ArrowRight, ArrowLeft,
  Loader2, Check, CheckCircle2, XCircle, Wifi, Plug, RefreshCw,
  BookOpen, AlertTriangle, ChevronRight, Puzzle, ExternalLink, Copy,
} from 'lucide-react'

const STEPS = [
  { label: termTh('shop_name') },
  { label: termTh('google_api_key') },
  { label: termTh('extension') },
  { label: termTh('adb') },
  { label: termTh('platform') },
]

const REVIEW_MODES = [
  { key: 'auto', label: 'โพสต์อัตโนมัติทันที', desc: 'สร้างคลิปเสร็จแล้วโพสต์ให้เลย ไม่ต้องกดยืนยัน' },
  { key: 'hold', label: 'ให้ฉันตรวจก่อนโพสต์',  desc: 'สร้างคลิปเสร็จแล้วพักไว้ รอคุณกดอนุมัติก่อนจึงโพสต์' },
]

/**
 * DEV_GUIDES — วิธีเปิด "โหมดนักพัฒนา + การแก้จุดบกพร่อง USB" แยกตามยี่ห้อ
 * (เมนูแต่ละยี่ห้ออยู่คนละที่ — ใช้คำไทยง่าย + วงเล็บคำอังกฤษบนเครื่องจริง)
 * ถ้าไม่เปิดสองอย่างนี้ คอมจะเชื่อม (adb) กับมือถือไม่ติด
 */
const DEV_GUIDES = [
  { key: 'samsung', label: 'Samsung', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'เลื่อนลงล่างสุด แตะ "เกี่ยวกับโทรศัพท์ (About phone)"',
    'แตะ "ข้อมูลซอฟต์แวร์ (Software information)"',
    'แตะที่ "หมายเลขบิลด์ (Build number)" ติดต่อกัน 7 ครั้ง จนขึ้น "คุณเป็นนักพัฒนาแล้ว" (ใส่ PIN ถ้าเครื่องถาม)',
    'กลับไปหน้า "การตั้งค่า" → แตะ "ตัวเลือกสำหรับนักพัฒนา (Developer options)"',
    'เปิดสวิตช์ "การแก้จุดบกพร่อง USB (USB debugging)"',
    'เสียบสาย USB เข้าคอม → บนมือถือจะเด้งหน้าต่างขึ้น กด "อนุญาต (Allow)"',
  ] },
  { key: 'xiaomi', label: 'Xiaomi / Redmi / POCO', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'แตะ "เกี่ยวกับโทรศัพท์ (About phone)"',
    'แตะที่ "เวอร์ชัน MIUI" หรือ "เวอร์ชัน HyperOS" ติดต่อกัน 7 ครั้ง จนขึ้น "คุณเป็นนักพัฒนาแล้ว"',
    'กลับไป "การตั้งค่า" → "การตั้งค่าเพิ่มเติม (Additional settings)" → "ตัวเลือกสำหรับนักพัฒนา (Developer options)"',
    'เปิด "การแก้จุดบกพร่อง USB (USB debugging)"',
    'เปิด "ติดตั้งผ่าน USB (Install via USB)" ด้วย (สำคัญสำหรับ Xiaomi)',
    'เสียบสาย USB → กด "อนุญาต (Allow)" บนมือถือ',
  ] },
  { key: 'oppo', label: 'OPPO', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'แตะ "เกี่ยวกับอุปกรณ์ (About device)" → "เวอร์ชัน (Version)"',
    'แตะที่ "หมายเลขบิลด์ (Build number)" ติดต่อกัน 7 ครั้ง จนขึ้นว่าเป็นนักพัฒนา',
    'กลับไป "การตั้งค่า" → "การตั้งค่าเพิ่มเติม (Additional settings)" → "ตัวเลือกสำหรับนักพัฒนา"',
    'เปิด "การแก้จุดบกพร่อง USB (USB debugging)" และ "ติดตั้งผ่าน USB (USB install)"',
    'เสียบสาย USB → กด "อนุญาต (Allow)" บนมือถือ',
  ] },
  { key: 'vivo', label: 'vivo', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'แตะ "เกี่ยวกับโทรศัพท์ (About phone)" → "ข้อมูลซอฟต์แวร์ (Software version)"',
    'แตะที่ "หมายเลขบิลด์ (Build number)" ติดต่อกัน 7 ครั้ง จนขึ้นว่าเป็นนักพัฒนา',
    'กลับไป "การตั้งค่า" → "การตั้งค่าเพิ่มเติม (More settings)" → "ตัวเลือกสำหรับนักพัฒนา"',
    'เปิด "การแก้จุดบกพร่อง USB (USB debugging)" และ "ติดตั้งผ่าน USB (USB install)"',
    'เสียบสาย USB → กด "อนุญาต (Allow)" บนมือถือ',
  ] },
  { key: 'realme', label: 'realme', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'แตะ "เกี่ยวกับอุปกรณ์ (About device)" → "เวอร์ชัน (Version)"',
    'แตะที่ "หมายเลขบิลด์ (Build number)" ติดต่อกัน 7 ครั้ง จนขึ้นว่าเป็นนักพัฒนา',
    'กลับไป "การตั้งค่า" → "การตั้งค่าเพิ่มเติม (Additional settings)" → "ตัวเลือกสำหรับนักพัฒนา"',
    'เปิด "การแก้จุดบกพร่อง USB (USB debugging)" และ "ติดตั้งผ่าน USB (USB install)"',
    'เสียบสาย USB → กด "อนุญาต (Allow)" บนมือถือ',
  ] },
  { key: 'huawei', label: 'Huawei / HONOR', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'แตะ "เกี่ยวกับโทรศัพท์ (About phone)"',
    'แตะที่ "หมายเลขบิลด์ (Build number)" ติดต่อกัน 7 ครั้ง จนขึ้นว่าเป็นนักพัฒนา',
    'กลับไป "การตั้งค่า" → "ระบบและการอัปเดต (System & updates)" → "ตัวเลือกสำหรับนักพัฒนา"',
    'เปิด "การแก้จุดบกพร่อง USB (USB debugging)"',
    'เสียบสาย USB → กด "อนุญาต (Allow)" บนมือถือ',
  ] },
  { key: 'other', label: 'ยี่ห้ออื่น ๆ', steps: [
    'เปิด "การตั้งค่า (Settings)"',
    'ไปที่ "เกี่ยวกับโทรศัพท์ (About phone)" (บางรุ่นต้องเข้า "ข้อมูลซอฟต์แวร์" หรือ "เวอร์ชัน" ต่ออีกชั้น)',
    'หา "หมายเลขบิลด์ (Build number)" แล้วแตะติดต่อกัน 7 ครั้ง จนขึ้น "คุณเป็นนักพัฒนาแล้ว"',
    'กลับไป "การตั้งค่า" → หา "ตัวเลือกสำหรับนักพัฒนา (Developer options)" (มักอยู่ใน "ระบบ" หรือ "การตั้งค่าเพิ่มเติม")',
    'เปิด "การแก้จุดบกพร่อง USB (USB debugging)"',
    'เสียบสาย USB → กด "อนุญาต (Allow)" บนมือถือ',
  ] },
]

/** เดายี่ห้อจากข้อความ brand ที่อ่านจากมือถือ (getprop) เพื่อเลือก guide ให้อัตโนมัติ */
function guessBrandKey(s = '') {
  const b = String(s).toLowerCase()
  if (b.includes('samsung')) return 'samsung'
  if (b.includes('xiaomi') || b.includes('redmi') || b.includes('poco')) return 'xiaomi'
  if (b.includes('oppo')) return 'oppo'
  if (b.includes('vivo')) return 'vivo'
  if (b.includes('realme')) return 'realme'
  if (b.includes('huawei') || b.includes('honor')) return 'huawei'
  return 'other'
}

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
  const [results, setResults]     = useState({})      // serial -> {ok, name, android, reason}
  const [plats, setPlats]         = useState([])
  const [saving, setSaving]       = useState(false)
  const [extPath, setExtPath]       = useState('')
  const [openingExt, setOpeningExt] = useState(false)

  // ── คู่มือเปิดโหมดนักพัฒนา + USB debugging ──
  const [guideOpen, setGuideOpen]   = useState(false)
  const [guideBrand, setGuideBrand] = useState('samsung')

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

  // โหลด path โฟลเดอร์ extension (โชว์ให้ก๊อป / Load unpacked)
  useEffect(() => { api.extPath().then(d => setExtPath(d.path || '')).catch(() => {}) }, [])

  // เข้าขั้น "ส่วนขยาย" → poll สถานะทุก 3 วิ จนตรวจเจอ ext ต่อแล้ว
  useEffect(() => {
    if (step !== 2) return
    onRefresh?.()
    const t = setInterval(() => onRefresh?.(), 3000)
    return () => clearInterval(t)
  }, [step, onRefresh])

  // เข้าขั้น "เชื่อมมือถือ" → ดึงสถานะเครื่องล่าสุด
  useEffect(() => { if (step === 3) onRefresh?.() }, [step, onRefresh])

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
      const ok = !!(r.ok || r.ready)
      const name = [r.brand, r.model].filter(Boolean).join(' ').trim()
      const reason = ok ? '' : (r.reason || r.error || 'มือถือยังไม่พร้อม — ลองปลุกหน้าจอแล้วลองใหม่')
      setResults(m => ({ ...m, [serial]: { ok, name, android: r.android || '', reason } }))
      if (ok) toast.success(name
        ? `เชื่อมต่อแล้ว: ${name}${r.android ? ` (Android ${r.android})` : ''}`
        : 'มือถือพร้อมใช้งาน')
      else toast.error(reason)
    } catch {}
    setTestingSerial('')
  }

  // เปิดคู่มือ — เลือกยี่ห้อให้อัตโนมัติจากเครื่องที่เจอ (ถ้ารู้ยี่ห้อ)
  const openGuide = () => {
    const dev = online.find(d => d.brand) || online[0]
    if (dev?.brand) setGuideBrand(guessBrandKey(dev.brand))
    setGuideOpen(true)
  }

  const togglePlatform = (key) =>
    setSelected(sel => sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key])

  const openExt = async () => {
    setOpeningExt(true)
    try {
      const r = await api.openExtPage()
      if (r.opened_chrome) toast.success('เปิดหน้า chrome://extensions + โฟลเดอร์ให้แล้ว')
      else toast.error(r.hint || 'เปิด Chrome ไม่ได้ — เปิด chrome://extensions เอง')
    } catch {}
    setOpeningExt(false)
  }
  const copyPath = () => {
    if (!extPath) return
    navigator.clipboard?.writeText(extPath)
      .then(() => toast.success('ก๊อปที่อยู่โฟลเดอร์แล้ว'))
      .catch(() => {})
  }

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
    { ready: true },   // ส่วนขยาย: ไปต่อได้เสมอ (โหลดทีหลังได้ — แต่ต้องมีก่อนสร้างคลิป)
    { ready: true },   // มือถือ: ผ่านได้เสมอ (ตั้งค่าก่อนมีมือถือได้) — เตือนในหน้าถ้ายังไม่ทดสอบผ่าน
    { ready: selected.length > 0, reason: 'เลือกอย่างน้อย 1 แพลตฟอร์มปลายทาง' },
  ]

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-base p-4 overflow-y-auto">
      {/* glow: radial-gradient แทน blur-[120px] (ไม่ใช้ GPU filter = ไม่กระตุก) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, rgba(168,85,247,0.12), transparent 70%)' }} />

      <div className="relative w-full max-w-[520px] my-6 animate-scale-in">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center glow-accent mb-3"
               style={{ background: 'linear-gradient(135deg,#b975f9,#a855f7)' }}>
            <Zap size={26} className="text-white fill-white" />
          </div>
          <h1 className="text-foreground text-xl font-extrabold tracking-tight">ตั้งค่า VDO Gen Auto Pilot ครั้งแรก</h1>
          <p className="text-muted-foreground text-sm mt-1.5">ทำ 5 ขั้นสั้น ๆ แล้วเริ่มโพสต์คลิปอัตโนมัติได้เลย</p>
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
              <StepExt
                extConnected={extConnected} extPath={extPath}
                onOpen={openExt} opening={openingExt} onCopy={copyPath}
                onRefresh={onRefresh}
              />
            )}
            {step === 3 && (
              <StepPhone
                ip={ip} setIp={setIp} connecting={connecting} onConnect={connectWifi}
                online={online} usbCand={usbCand} extConnected={extConnected}
                wsConnected={!!status.ws_connected}
                testingSerial={testingSerial} results={results} onTestDevice={testDevice}
                onOpenGuide={openGuide}
                pairHost={pairHost} setPairHost={setPairHost}
                pairPort={pairPort} setPairPort={setPairPort}
                pairCode={pairCode} setPairCode={setPairCode}
                pairing={pairing} onPair={pairDevice}
                usbSerial={usbSerial} setUsbSerial={setUsbSerial}
                tcpiping={tcpiping} onUsbToWifi={usbToWifi}
                onRefresh={onRefresh}
              />
            )}
            {step === 4 && (
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
                <GatedButton ready={gate[4].ready} reason={gate[4].reason}
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

      <DevModeGuide open={guideOpen} onClose={() => setGuideOpen(false)}
                    brand={guideBrand} setBrand={setGuideBrand} />
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
  testingSerial, results, onTestDevice, onOpenGuide,
  pairHost, setPairHost, pairPort, setPairPort, pairCode, setPairCode, pairing, onPair,
  usbSerial, setUsbSerial, tcpiping, onUsbToWifi, onRefresh,
}) {
  const anyTestedOk = online.some(d => results[d.serial]?.ok)
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

      {/* รายการเครื่องที่ออนไลน์ + ปุ่มทดสอบการเชื่อมต่อ (โชว์ผลจริง) */}
      {online.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {online.map(d => {
            const res  = results[d.serial]
            const busy = testingSerial === d.serial
            return (
              <div key={d.serial}
                   className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-medium truncate">{d.model || d.serial}</p>
                    <p className="text-muted-foreground text-[11px] truncate">{d.serial}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant={res?.ok ? 'ghost' : 'outline'} size="sm"
                            onClick={() => onTestDevice(d.serial)} disabled={busy}>
                      {busy
                        ? <Loader2 size={13} className="animate-spin" />
                        : res ? <RefreshCw size={13} /> : <Check size={13} />}
                      {res ? 'ทดสอบใหม่' : 'ทดสอบการเชื่อมต่อ'}
                    </Button>
                    <InfoTooltip text="กดเพื่อเช็กว่าคอมสั่งงานมือถือเครื่องนี้ได้จริง (ปลุกจอ + ลองถ่ายภาพหน้าจอ ไม่กดโดนอะไร)" />
                  </div>
                </div>

                {/* ผลการทดสอบ — เขียว = สำเร็จ / แดง = เหตุผล + ลิงก์คู่มือ */}
                {res && (res.ok ? (
                  <p className="mt-2 flex items-center gap-1.5 text-success text-xs font-medium">
                    <CheckCircle2 size={14} className="shrink-0" />
                    เชื่อมต่อแล้ว{res.name ? `: ${res.name}` : ''}{res.android ? ` (Android ${res.android})` : ''}
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-1.5 text-danger text-xs leading-relaxed">
                    <XCircle size={14} className="shrink-0 mt-[1px]" />
                    <span>
                      {res.reason}{' '}
                      <button type="button" onClick={onOpenGuide}
                              className="underline underline-offset-2 font-medium hover:text-foreground">
                        ดูวิธีเปิด USB debugging
                      </button>
                    </span>
                  </p>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* เตือนถ้ายังไม่ทดสอบผ่าน (ยังไปต่อได้) */}
      {online.length > 0 && !anyTestedOk && (
        <p className="mt-2 flex items-center gap-1.5 text-amber-500 text-[11px]">
          <AlertTriangle size={13} className="shrink-0" />
          แนะนำให้กด "ทดสอบการเชื่อมต่อ" ให้ผ่านก่อนไปต่อ
        </p>
      )}

      {/* ยังไม่พบมือถือ — ชี้ไปคู่มือ */}
      {online.length === 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
            <AlertTriangle size={14} className="shrink-0" /> ยังไม่พบมือถือ
          </p>
          <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
            เสียบสาย USB หรือเชื่อม Wi-Fi ด้านบน แล้วกด "เช็คอีกครั้ง" — ถ้าเสียบแล้วยังไม่ขึ้น มักเป็นเพราะยังไม่ได้เปิด "โหมดนักพัฒนา + USB debugging" บนมือถือ (ตั้งค่าให้เสร็จก่อนแล้วค่อยเชื่อมทีหลังก็ได้)
          </p>
          <button type="button" onClick={onOpenGuide}
                  className="mt-2 inline-flex items-center gap-1 text-accent text-xs font-medium hover:underline">
            <BookOpen size={13} /> ดูวิธีเปิดโหมดนักพัฒนา + USB debugging
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3">
        <button type="button" onClick={onOpenGuide}
                className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
          <BookOpen size={13} /> วิธีเปิด USB debugging
          <InfoTooltip text="ถ้าเชื่อม adb ไม่ติด มักเพราะยังไม่ได้เปิดโหมดนักพัฒนา + การแก้จุดบกพร่อง USB บนมือถือ — กดดูขั้นตอนตามยี่ห้อ" />
        </button>
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

/* ───────────── ขั้นส่วนขยาย (Extension) — พาทำทีละขั้น ───────────── */

function StepExt({ extConnected, extPath, onOpen, opening, onCopy, onRefresh }) {
  return (
    <StepBody icon={Puzzle} title={termTh('extension')}
              desc="ส่วนเสริมนี้สั่ง Google Flow สร้างคลิป + ดูดสินค้าจาก Shopee — ติดตั้งลง Chrome ครั้งเดียว">
      {extConnected ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4 flex items-center gap-2.5">
          <CheckCircle2 size={20} className="text-success shrink-0" />
          <div>
            <p className="text-foreground text-sm font-semibold">ต่อส่วนเสริมแล้ว</p>
            <p className="text-muted-foreground text-xs">ระบบเห็น extension ทำงานอยู่ — กด "ถัดไป" ได้เลย</p>
          </div>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            <ExtSub n={1} title="เปิดหน้าส่วนขยายของ Chrome">
              <Button size="sm" onClick={onOpen} disabled={opening}>
                {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                เปิด chrome://extensions + โฟลเดอร์
              </Button>
              <p className="text-muted-foreground text-[11px] mt-1">ระบบจะเปิดหน้า Chrome ให้ + เผยโฟลเดอร์ extension ใน Finder ให้ลากวาง</p>
            </ExtSub>
            <ExtSub n={2} title='เปิด "โหมดนักพัฒนา (Developer mode)"'>
              <p className="text-muted-foreground text-xs">สลับสวิตช์มุมขวาบนของหน้า chrome://extensions ให้ติด (สีน้ำเงิน)</p>
            </ExtSub>
            <ExtSub n={3} title='กด "Load unpacked" แล้วเลือกโฟลเดอร์นี้'>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] bg-secondary border border-border rounded-lg px-2.5 py-2 truncate text-foreground">{extPath || '…'}</code>
                <Button variant="outline" size="sm" onClick={onCopy} disabled={!extPath}>
                  <Copy size={13} /> ก๊อป
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px] mt-1">หรือลากโฟลเดอร์ที่เผยใน Finder มาวางบนหน้า chrome://extensions ตรง ๆ</p>
            </ExtSub>
          </ol>

          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-secondary/50 border border-border px-3 py-2">
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Loader2 size={13} className="animate-spin" /> กำลังรอตรวจจับส่วนเสริม…
            </span>
            <Button variant="ghost" size="sm" onClick={() => onRefresh?.()} className="text-muted-foreground">
              <RefreshCw size={13} /> เช็คอีกครั้ง
            </Button>
          </div>
        </>
      )}
    </StepBody>
  )
}

function ExtSub({ n, title, children }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[1px] w-5 h-5 rounded-full bg-accent-wash text-accent text-[11px] font-bold flex items-center justify-center shrink-0">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-[13px] font-medium mb-1.5">{title}</p>
        {children}
      </div>
    </li>
  )
}

/* ───────────── คู่มือ: เปิดโหมดนักพัฒนา + USB debugging ───────────── */

function DevModeGuide({ open, onClose, brand, setBrand }) {
  const guide = DEV_GUIDES.find(g => g.key === brand) || DEV_GUIDES[DEV_GUIDES.length - 1]
  return (
    <Dialog open={open} onClose={onClose} size="lg" icon={BookOpen}
            title="เปิดโหมดนักพัฒนา + การแก้จุดบกพร่อง USB"
            description="ถ้าไม่เปิดสองอย่างนี้บนมือถือ คอมจะเชื่อมต่อ (adb) กับมือถือไม่ติด — เลือกยี่ห้อแล้วทำตามทีละขั้น">
      {/* เลือกยี่ห้อ */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-muted-foreground text-xs">ยี่ห้อมือถือของคุณ</p>
        <InfoTooltip text="เมนูของแต่ละยี่ห้ออยู่คนละที่ — เลือกยี่ห้อให้ตรงเพื่อดูขั้นตอนที่ถูกต้อง (ไม่เจอยี่ห้อ ให้เลือก 'ยี่ห้ออื่น ๆ')" />
      </div>
      <select value={brand} onChange={e => setBrand(e.target.value)}
              className="w-full bg-secondary border border-border text-foreground text-sm px-3 py-2.5 rounded-lg outline-none focus:border-accent mb-4">
        {DEV_GUIDES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
      </select>

      {/* ขั้นตอนเฉพาะยี่ห้อ */}
      <ol className="flex flex-col gap-2.5">
        {guide.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[1px] w-5 h-5 rounded-full bg-accent-wash text-accent text-[11px] font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="text-foreground text-[13px] leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>

      {/* หมายเหตุสำคัญ */}
      <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-3 flex flex-col gap-2">
        <p className="flex items-start gap-1.5 text-muted-foreground text-[11px] leading-relaxed">
          <Plug size={13} className="text-accent shrink-0 mt-[1px]" />
          ใช้สายที่ "ส่งข้อมูลได้" (ไม่ใช่สายชาร์จอย่างเดียว) — คอมพอร์ต USB-C ต่อ USB-C↔USB-C, คอมพอร์ตปกติ/มือถือรุ่นเก่าใช้ USB-A↔USB-C หรือ micro USB
        </p>
        <p className="flex items-start gap-1.5 text-muted-foreground text-[11px] leading-relaxed">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-[1px]" />
          เสียบสายครั้งแรก มือถือจะเด้งหน้าต่าง "อนุญาตการแก้จุดบกพร่อง USB" — ต้องกด "อนุญาต (Allow)" (ติ๊ก "อนุญาตเสมอ" ไว้ด้วยจะดี) ไม่งั้นคอมจะมองไม่เห็นเครื่อง
        </p>
        <p className="flex items-start gap-1.5 text-muted-foreground text-[11px] leading-relaxed">
          <ChevronRight size={13} className="text-accent shrink-0 mt-[1px]" />
          ทำเสร็จแล้ว กลับมากด "เช็คอีกครั้ง" แล้วกด "ทดสอบการเชื่อมต่อ"
        </p>
      </div>
    </Dialog>
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
