'use client'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { api }    from '@/lib/api'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { CaptionBuilder } from '@/components/ui/CaptionBuilder'
import { useToast } from '@/components/ui/Toast'
import { termTh, termHint, MSG } from '@/lib/copy'
import { Eye, EyeOff, Save, Check, MessageSquare, Share2, Store, KeyRound, Wrench, RefreshCw } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────

function Section({ title, subtitle }) {
  return (
    <div className="pt-10 pb-1 first:pt-0">
      <h2 className="text-foreground text-xl font-extrabold tracking-tight">{title}</h2>
      {subtitle && <p className="text-muted-foreground text-xs mt-1">{subtitle}</p>}
      <div className="mt-4 border-t border-border" />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', suffix, info }) {
  const [show, setShow] = useState(false)
  const secret = type === 'password'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-muted-foreground text-xs">{label}</Label>
        {info && <InfoTooltip text={info} />}
      </div>
      <div className="relative">
        <Input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={suffix ? 'pr-12' : secret ? 'pr-10' : ''}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">{suffix}</span>}
        {secret && (
          <button type="button" onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ icon: Icon, title, desc, children, delay = 0, info }) {
  return (
    <motion.div
      className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 lg:gap-10 py-7 border-b border-border last:border-0"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
    >
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent-wash flex items-center justify-center shrink-0">
          <Icon size={17} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h3 className="text-foreground font-semibold text-[15px] leading-tight flex items-center gap-1.5">
            {title}{info && <InfoTooltip text={info} />}
          </h3>
          <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-card p-5 flex flex-col gap-4">{children}</div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const toast = useToast()
  const [cfg, setCfg]     = useState({})
  const [saved, setSaved] = useState(false)
  const [platforms, setPlatforms] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [adapterVer, setAdapterVer]   = useState('')
  const [adapterBusy, setAdapterBusy] = useState(false)
  const keySet = cfg.google_api_key === '********'   // public_load ส่ง mask มาถ้าตั้ง key แล้ว

  useEffect(() => { api.getSettings().then(setCfg).catch(() => {}) }, [])
  useEffect(() => { api.platforms().then(d => setPlatforms(d.platforms || [])).catch(() => {}) }, [])
  useEffect(() => { api.flowAdapter().then(d => setAdapterVer(d.version || '')).catch(() => {}) }, [])

  // อัปเดตตัวเชื่อม Google Flow (ดึงรุ่นใหม่จาก desktop → toast ผล: ใหม่/ล่าสุด/ล้มเหลว)
  const updateAdapter = async () => {
    if (adapterBusy) return
    setAdapterBusy(true)
    try {
      const res = await api.updateFlowAdapter()
      if (res.ok) {
        if (res.version && res.version !== adapterVer) {
          setAdapterVer(res.version)
          toast.success(`อัปเดตตัวเชื่อมแล้ว — เวอร์ชัน ${res.version}`)
        } else {
          toast.info('ตัวเชื่อมเป็นรุ่นล่าสุดอยู่แล้ว')
        }
      } else {
        toast.error(res.error || 'อัปเดตตัวเชื่อมไม่สำเร็จ — ลองใหม่อีกครั้ง')
      }
    } catch {
      toast.error('อัปเดตตัวเชื่อมไม่สำเร็จ — ลองใหม่อีกครั้ง')
    } finally {
      setAdapterBusy(false)
    }
  }

  const set = key => val => setCfg(prev => ({ ...prev, [key]: val }))

  const captionTemplates = cfg.caption_templates?.length
    ? cfg.caption_templates
    : cfg.caption_template ? [cfg.caption_template] : ['']

  const setCaptionTemplates = (list) => setCfg(prev => ({
    ...prev,
    caption_templates: list,
    caption_template: list[0] || '',
  }))

  const selPlatforms = cfg.platforms || []
  const togglePlatform = (key) => {
    const has = selPlatforms.includes(key)
    set('platforms')(has ? selPlatforms.filter(k => k !== key) : [...selPlatforms, key])
  }

  const save = async () => {
    const payload = { ...cfg }
    if (apiKey.trim()) payload.google_api_key = apiKey.trim()   // ส่งเฉพาะตอนกรอกใหม่ (ไม่ทับด้วย mask)
    try {
      await api.saveSettings(payload)
      setApiKey('')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      toast.success(MSG.saveOk)
    } catch {
      toast.error(MSG.saveFail)   // (api.js เด้ง toast ออฟไลน์ให้แล้ว — อันนี้เสริมบริบท "บันทึก")
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-10 pt-6 lg:pt-8 pb-4">

          <motion.div
            className="mb-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ตั้งค่าระบบ</h2>
            <p className="text-muted-foreground text-sm mt-2">ข้อมูลร้าน แพลตฟอร์มปลายทาง และแคปชัน</p>
          </motion.div>

          {/* ══ ข้อมูลร้าน ════════════════════════════════ */}
          <Section title="ข้อมูลส่วนตัวของร้าน" subtitle="ชื่อร้านใช้เป็นบล็อกข้อมูลในแคปชัน และแสดงในรายงาน" />
          <Row icon={Store} delay={20}
               title="ชื่อร้าน / แบรนด์"
               desc="ชื่อที่ตั้งตอนลงทะเบียน — แก้ไขได้ที่นี่ ใช้เป็นบล็อก 'ชื่อร้าน' ในแคปชัน">
            <Field label="ชื่อร้าน / แบรนด์" value={cfg.shop_name || ''} onChange={set('shop_name')} placeholder="ชื่อร้านของคุณ" />
          </Row>

          {/* ══ AI (Gemini) ═══════════════════════════════ */}
          <Section title="คีย์ AI (Gemini)" subtitle="คีย์สำหรับให้ AI ช่วยเขียนคำสั่ง/แคปชัน — ขอฟรีที่ aistudio.google.com/apikey" />
          <Row icon={KeyRound} delay={30}
               title={termTh('google_api_key')}
               info={termHint('google_api_key')}
               desc="ส่วนเสริมเบราว์เซอร์ใช้คีย์นี้ให้ AI ช่วยคิดคำสั่งสร้างคลิป — เก็บในเครื่องเท่านั้น ไม่ส่งออกนอกเครื่อง">
            <Field label={termTh('google_api_key')} type="password"
                   info={termHint('google_api_key')}
                   value={apiKey} onChange={setApiKey}
                   placeholder={keySet ? 'ตั้งไว้แล้ว ✓ — กรอกใหม่เพื่อเปลี่ยน' : 'วางคีย์ที่นี่ (ขึ้นต้น AIza…)'} />
          </Row>

          {/* ══ ตัวเชื่อม Google Flow ═════════════════════ */}
          <Section title="ตัวเชื่อม Google Flow" subtitle="ตัวช่วยให้ระบบทำงานกับหน้า Google Flow ได้ — อัปเดตเมื่อ Flow เปลี่ยนหน้าตา" />
          <Row icon={Wrench} delay={35}
               title="อัปเดตตัวเชื่อม"
               info="ตัวเชื่อมช่วยให้ระบบกดปุ่มบนหน้า Google Flow ได้ถูกที่ — ถ้าวันไหน Google Flow เปลี่ยนหน้าตาจนสร้างวิดีโอไม่ได้ ให้กดปุ่มนี้เพื่อดึงตัวเชื่อมรุ่นใหม่มาแก้ให้"
               desc="ปกติไม่ต้องแตะ — ใช้เฉพาะตอน Google Flow เปลี่ยนหน้าตาแล้วสร้างวิดีโอไม่ได้ ให้กดปุ่มนี้เพื่ออัปเดตตัวเชื่อมรุ่นใหม่">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">เวอร์ชันปัจจุบัน</span>
                <span className="text-foreground text-sm font-semibold">{adapterVer || '—'}</span>
              </div>
              <button onClick={updateAdapter} disabled={adapterBusy}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-border bg-secondary text-foreground transition-all hover:bg-secondary/70 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none">
                <RefreshCw size={14} className={adapterBusy ? 'animate-spin' : ''} />
                {adapterBusy ? 'กำลังอัปเดต…' : 'อัปเดตตัวเชื่อม'}
              </button>
            </div>
          </Row>

          {/* ══ การโพสต์ ══════════════════════════════════ */}
          <Section title="การโพสต์" subtitle="เลือกแพลตฟอร์มปลายทางสำหรับโพสต์แต่ละคลิป" />
          <Row icon={Share2} delay={40}
               title={termTh('platform')}
               info={termHint('dry_run')}
               desc="คลิป 1 อันโพสต์ได้หลายที่พร้อมกัน — แพลตฟอร์มที่ยัง 'ต้องจูน' ควรลองแบบทดสอบ (ไม่โพสต์จริง) ก่อน">
            <div className="flex flex-col gap-1">
              {platforms.map(p => {
                const on = selPlatforms.includes(p.key) && p.ready
                return (
                  <div key={p.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-sm font-medium ${p.ready ? 'text-foreground' : 'text-muted-foreground'}`}>{p.label}</span>
                      {!p.ready
                        ? <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">เร็ว ๆ นี้</span>
                        : p.tuned
                          ? <span className="text-[10px] text-success bg-success/10 px-2 py-0.5 rounded-full">พร้อม</span>
                          : <span className="text-[10px] text-amber-500 bg-amber-400/10 px-2 py-0.5 rounded-full">ต้องจูน</span>}
                    </div>
                    <Switch checked={on} disabled={!p.ready} onCheckedChange={() => togglePlatform(p.key)} />
                  </div>
                )
              })}
            </div>
          </Row>

          {/* ══ แคปชัน ════════════════════════════════════ */}
          <Section title="แคปชัน" subtitle="ออกแบบข้อความที่ระบบพิมพ์ให้อัตโนมัติ — ลากบล็อกข้อมูลสินค้าแทรกได้เลย" />
          <Row icon={MessageSquare} delay={200}
               title="ออกแบบแคปชัน"
               desc="คลิกบล็อกข้อมูลด้านบนเพื่อแทรก — พิมพ์ข้อความได้อิสระระหว่างบล็อก ใส่ emoji ได้ด้วย">
            <CaptionBuilder templates={captionTemplates} onChange={setCaptionTemplates} />
          </Row>

        </div>
      </div>

      {/* Save bar */}
      <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-xl">
        <div className="px-4 sm:px-6 lg:px-10 py-3.5 flex items-center gap-3">
          <button onClick={save}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-[.98]
              ${saved ? 'bg-success' : 'bg-accent hover:bg-accent-soft'}`}>
            {saved ? <Check size={15} strokeWidth={3} /> : <Save size={15} />}
            {saved ? 'บันทึกแล้ว' : 'บันทึกการตั้งค่า'}
          </button>
          <p className="hidden md:block text-[11px] text-muted-foreground ml-1">
            การตั้งค่าสร้างคลิป (สไตล์/พรอมต์) อยู่ที่ส่วนขยาย (Extension)
          </p>
        </div>
      </div>
    </div>
  )
}
