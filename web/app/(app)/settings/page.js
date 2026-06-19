'use client'
import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { api }    from '@/lib/api'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CaptionBuilder } from '@/components/ui/CaptionBuilder'
import { Eye, EyeOff, Save, Check, MessageSquare, Share2, Store } from 'lucide-react'

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

function Field({ label, value, onChange, type = 'text', placeholder = '', suffix }) {
  const [show, setShow] = useState(false)
  const secret = type === 'password'
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
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

function Row({ icon: Icon, title, desc, children, delay = 0 }) {
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
          <h3 className="text-foreground font-semibold text-[15px] leading-tight">{title}</h3>
          <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-card p-5 flex flex-col gap-4">{children}</div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [cfg, setCfg]     = useState({})
  const [saved, setSaved] = useState(false)
  const [platforms, setPlatforms] = useState([])

  useEffect(() => { api.getSettings().then(setCfg).catch(() => {}) }, [])
  useEffect(() => { api.platforms().then(d => setPlatforms(d.platforms || [])).catch(() => {}) }, [])

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
    await api.saveSettings(cfg)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
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

          {/* ══ การโพสต์ ══════════════════════════════════ */}
          <Section title="การโพสต์" subtitle="เลือกแพลตฟอร์มปลายทางสำหรับโพสต์แต่ละคลิป" />
          <Row icon={Share2} delay={40}
               title="แพลตฟอร์มที่โพสต์"
               desc="คลิป 1 อันโพสต์ได้หลายที่พร้อมกัน — แพลตฟอร์มที่ยัง 'ต้องจูน' ควรทดสอบ Dry Run ก่อน">
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
