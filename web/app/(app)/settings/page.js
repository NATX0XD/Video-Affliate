'use client'
import { useState, useEffect } from 'react'
import { api }    from '@/lib/api'
import { Eye, EyeOff, Save, Key, SlidersHorizontal, Video, Check, Sparkles, RefreshCw, Play, Loader2, Mic } from 'lucide-react'

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  const [show, setShow] = useState(false)
  const secret = type === 'password'
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-line-soft last:border-0">
      <label className="text-ink-dim text-xs font-medium">{label}</label>
      <div className="relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-elevated border border-line text-ink text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute transition-all"
        />
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

function Select({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-line-soft last:border-0">
      <label className="text-ink-dim text-xs font-medium">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-elevated border border-line text-ink text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer transition-all">
        {options.map(o => <option key={o} value={o} className="bg-surface text-ink">{o}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, value, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-line-soft last:border-0">
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

function Section({ icon: Icon, title, desc, children, action, className = '' }) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-card overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-line">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent-wash shrink-0">
          <Icon size={16} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h3 className="text-ink font-semibold text-sm leading-tight">{title}</h3>
          {desc && <p className="text-ink-mute text-[11px] leading-tight mt-0.5">{desc}</p>}
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const [cfg, setCfg]     = useState({})
  const [saved, setSaved] = useState(false)
  const [veoModels, setVeoModels]       = useState([])
  const [gemModels, setGemModels]       = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelErr, setModelErr]         = useState('')
  const [testing, setTesting]           = useState(false)

  useEffect(() => { api.getSettings().then(setCfg).catch(() => {}) }, [])

  const set = key => val => setCfg(prev => ({ ...prev, [key]: val }))

  const save = async () => {
    await api.saveSettings(cfg)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const loadModels = async () => {
    setLoadingModels(true); setModelErr('')
    try {
      const r = await api.videoModels()
      if (r.ok) { setVeoModels(r.veo || []); setGemModels(r.gemini || []) }
      else setModelErr(r.error || 'โหลดรายการโมเดลไม่สำเร็จ')
    } catch { setModelErr('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ') }
    setLoadingModels(false)
  }

  const testVideo = async () => {
    setTesting(true)
    try { await api.videoTest() } catch {}
    setTimeout(() => setTesting(false), 4000)
  }

  const veoOptions = veoModels.length ? veoModels : [cfg.vdo_model || 'veo-2.0-generate-001']
  const gemOptions = gemModels.length ? gemModels : [cfg.prompt_model || 'gemini-2.0-flash']

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px]">
      <div className="mb-6 animate-fade-up">
        <h2 className="text-ink text-[26px] font-extrabold tracking-tight">ตั้งค่าระบบ</h2>
        <p className="text-ink-dim text-sm mt-1.5">จัดการ API key โมเดล และพฤติกรรมการทำงาน</p>
      </div>

      {/* 2 คอลัมน์ — ใช้พื้นที่เต็ม */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start animate-fade-up" style={{ animationDelay: '80ms' }}>

        <Section icon={Key} title="คีย์เชื่อมต่อ AI" desc="ใส่ Google AI key เพื่อให้ระบบเขียนสคริปต์และสร้างวิดีโอได้">
          <Field label="Google AI Key" value={cfg.google_api_key || ''} onChange={set('google_api_key')} type="password" placeholder="AI… (จาก aistudio.google.com + เปิด billing)" />
        </Section>

        <Section icon={SlidersHorizontal} title="ร้านค้าและการโพสต์" desc="ชื่อร้านสำหรับใส่ในคลิป และจังหวะการโพสต์ให้ดูเป็นธรรมชาติ">
          <Field label="ชื่อร้าน" value={cfg.shop_name || ''} onChange={set('shop_name')} placeholder="ชื่อร้านของคุณ" />
          <Field label="เว้นระยะโพสต์ต่ำสุด (วินาที)" value={cfg.post_delay_min || ''} onChange={set('post_delay_min')} placeholder="30" />
          <Field label="เว้นระยะโพสต์สูงสุด (วินาที)" value={cfg.post_delay_max || ''} onChange={set('post_delay_max')} placeholder="120" />
        </Section>

        <Section icon={Sparkles} title="โมเดล AI" desc="เลือกโมเดลสร้างวิดีโอและเขียนพรอมต์"
          action={
            <button onClick={loadModels} disabled={loadingModels}
              className="flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-soft bg-accent-wash px-2.5 py-1.5 rounded-lg transition-all">
              {loadingModels ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              โหลดโมเดลที่ใช้ได้
            </button>
          }>
          {modelErr && <p className="text-danger text-xs pt-3">{modelErr}</p>}
          <Select label="โมเดลวิดีโอ (Veo)" value={cfg.vdo_model || 'veo-2.0-generate-001'} onChange={set('vdo_model')} options={veoOptions} />
          <Select label="โมเดลเขียนพรอมต์ (Gemini)" value={cfg.prompt_model || 'gemini-2.0-flash'} onChange={set('prompt_model')} options={gemOptions} />
          <Toggle label="สร้างเสียงในวิดีโอ" hint="เฉพาะ Veo 3 (Veo 2 ไม่รองรับ)" value={!!cfg.generate_audio} onChange={set('generate_audio')} />
        </Section>

        <Section icon={Mic} title="อวตารรีวิว (D-ID)" desc="คนเสมือนพูดรีวิวสินค้า (ออปชัน ต้องมี D-ID key)">
          <Field label="D-ID API Key" value={cfg.did_api_key || ''} onChange={set('did_api_key')} type="password" placeholder="จาก studio.d-id.com (ทดลองฟรี 14 วัน)" />
          <Select label="เสียงพากย์" value={cfg.avatar_voice || 'th-TH-PremwadeeNeural'} onChange={set('avatar_voice')}
            options={['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural']} />
          <Field label="รูปอวตาร (URL)" value={cfg.avatar_url || ''} onChange={set('avatar_url')} placeholder="ลิงก์รูปหน้าคน (ค่าเริ่มต้น = presenter ของ D-ID)" />
          <Select label="ความยาวสคริปต์ (วินาที)" value={String(cfg.review_seconds || '18')} onChange={set('review_seconds')} options={['12','18','25','30']} />
        </Section>

        <Section icon={Video} title="สไตล์วิดีโอ" desc="กำหนดโทน กลุ่มเป้าหมาย และความยาวของคลิปที่สร้าง" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            <Select label="กลุ่มเป้าหมาย" value={cfg.age_group || 'All Ages'} onChange={set('age_group')} options={['All Ages','Gen Z','Millennial','Adult']} />
            <Select label="บุคลิก" value={cfg.personality || 'Fun'} onChange={set('personality')} options={['Fun','Serious','Friendly','Luxury']} />
            <Select label="สไตล์" value={cfg.style || 'Lifestyle'} onChange={set('style')} options={['Lifestyle','Review','Compare','Comedy']} />
            <Select label="ฉากหลัง" value={cfg.background || 'Studio'} onChange={set('background')} options={['Studio','Outdoor','Home','Office']} />
            <Select label="ความยาว (วินาที)" value={String(cfg.duration || '8')} onChange={set('duration')} options={['6','8','12','15']} />
          </div>
        </Section>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 mt-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-base/80 backdrop-blur-xl border-t border-line flex items-center gap-3">
        <button onClick={save}
          className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-[.98]
            ${saved ? 'bg-success' : 'bg-accent hover:bg-accent-soft'}`}>
          {saved ? <Check size={15} strokeWidth={3} /> : <Save size={15} />}
          {saved ? 'บันทึกแล้ว' : 'บันทึกการตั้งค่า'}
        </button>
        <button onClick={testVideo} disabled={testing}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-ink-dim bg-surface border border-line hover:border-accent hover:text-accent transition-all disabled:opacity-50">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {testing ? 'กำลังสร้าง…' : 'ทดสอบสร้างวิดีโอ'}
        </button>
        <p className="hidden md:block text-[11px] text-ink-mute ml-2">
          ทดสอบจะใช้สินค้าแรกในคิวสร้าง 1 คลิป — ดูผลที่บันทึกการทำงาน
        </p>
      </div>
    </div>
  )
}
