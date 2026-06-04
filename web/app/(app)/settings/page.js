'use client'
import { useState, useEffect } from 'react'
import { api }    from '@/lib/api'
import { Eye, EyeOff, Save, Key, SlidersHorizontal, ShieldCheck, Wallet, Check } from 'lucide-react'

function Field({ label, value, onChange, type = 'text', placeholder = '', suffix }) {
  const [show, setShow] = useState(false)
  const secret = type === 'password'
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-ink-dim text-xs font-medium">{label}</label>
      <div className="relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-elevated border border-line text-ink text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute transition-all"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute text-xs">{suffix}</span>}
        {secret && (
          <button onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink-dim transition-colors">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-ink-dim text-sm">
        {label}
        {hint && <span className="block text-[11px] text-ink-mute mt-0.5">{hint}</span>}
      </label>
      <button onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${value ? 'bg-accent' : 'bg-elevated border border-line'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Row({ icon: Icon, title, desc, children, delay = 0 }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 lg:gap-10 py-7 border-b border-line last:border-0 animate-fade-up"
         style={{ animationDelay: `${delay}ms` }}>
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent-wash flex items-center justify-center shrink-0">
          <Icon size={17} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h3 className="text-ink font-semibold text-[15px] leading-tight">{title}</h3>
          <p className="text-ink-dim text-xs mt-1.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface shadow-card p-5 flex flex-col gap-4">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const [cfg, setCfg]     = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { api.getSettings().then(setCfg).catch(() => {}) }, [])
  const set = key => val => setCfg(prev => ({ ...prev, [key]: val }))
  const save = async () => {
    await api.saveSettings(cfg)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 lg:pt-8 pb-4">

          <div className="mb-2 animate-fade-up">
            <h2 className="text-ink text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ตั้งค่าระบบ</h2>
            <p className="text-ink-dim text-sm mt-2">ตั้งค่าการโพสต์อัตโนมัติและการตรวจสอบผล</p>
          </div>

          <Row icon={Key} delay={40}
               title="คีย์เชื่อมต่อ AI"
               desc="ใช้ Google AI key สำหรับตรวจสอบว่าโพสต์สำเร็จจริง (Gemini Vision)">
            <Field label="Google AI Key" value={cfg.google_api_key || ''} onChange={set('google_api_key')} type="password" placeholder="AI…" />
          </Row>

          <Row icon={SlidersHorizontal} delay={80}
               title="ร้านค้าและการโพสต์"
               desc="ชื่อร้านสำหรับใส่ในแคปชัน และระยะห่างการโพสต์ให้ดูเป็นธรรมชาติ (กันสแปม)">
            <Field label="ชื่อร้าน" value={cfg.shop_name || ''} onChange={set('shop_name')} placeholder="ชื่อร้านของคุณ" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="เว้นระยะต่ำสุด" value={cfg.post_delay_min || ''} onChange={set('post_delay_min')} placeholder="30" suffix="วินาที" />
              <Field label="เว้นระยะสูงสุด" value={cfg.post_delay_max || ''} onChange={set('post_delay_max')} placeholder="120" suffix="วินาที" />
            </div>
          </Row>

          <Row icon={ShieldCheck} delay={120}
               title="ตรวจสอบการโพสต์"
               desc="ถ่ายจอหลังโพสต์แล้วให้ AI ยืนยันว่าสำเร็จจริง — ถ้าพลาดจะลองใหม่อัตโนมัติ">
            <Toggle label="ยืนยันผลด้วย AI (แนะนำ)" hint="ปิดได้ถ้าต้องการประหยัด quota" value={!!cfg.verify_post} onChange={set('verify_post')} />
          </Row>

          <Row icon={Wallet} delay={160}
               title="งบประมาณ"
               desc="คุมค่าใช้จ่าย — ถึงเพดานแล้วระบบจะหยุดเองและแจ้งเตือน">
            <div className="grid grid-cols-2 gap-4">
              <Field label="งบรายเดือน (0 = ไม่จำกัด)" value={cfg.monthly_budget ?? ''} onChange={set('monthly_budget')} placeholder="0" suffix="บาท" />
              <Field label="ต้นทุนต่อคลิป (ประเมิน)" value={cfg.cost_per_clip ?? ''} onChange={set('cost_per_clip')} placeholder="0" suffix="บาท" />
            </div>
          </Row>
        </div>
      </div>

      {/* Save bar */}
      <div className="shrink-0 border-t border-line bg-surface/80 backdrop-blur-xl">
        <div className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-10 py-3.5 flex items-center gap-3">
          <button onClick={save}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-[.98]
              ${saved ? 'bg-success' : 'bg-accent hover:bg-accent-soft'}`}>
            {saved ? <Check size={15} strokeWidth={3} /> : <Save size={15} />}
            {saved ? 'บันทึกแล้ว' : 'บันทึกการตั้งค่า'}
          </button>
          <p className="hidden md:block text-[11px] text-ink-mute ml-1">
            การตั้งค่าสร้างคลิป (สไตล์/พรอมต์) อยู่ที่ส่วนขยาย (Extension)
          </p>
        </div>
      </div>
    </div>
  )
}
