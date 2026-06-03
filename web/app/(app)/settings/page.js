'use client'
import { useState, useEffect } from 'react'
import { api }    from '@/lib/api'
import { Eye, EyeOff, Save, Key, SlidersHorizontal, Video, Check, Sparkles, RefreshCw, Play, Loader2, Mic } from 'lucide-react'

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
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
    <div className="flex flex-col gap-1.5">
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

// แถวตั้งค่า: ซ้าย = ไอคอน+ชื่อ+คำอธิบาย, ขวา = การ์ดฟอร์ม
function Row({ icon: Icon, title, desc, action, children, delay = 0 }) {
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
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface shadow-card p-5 flex flex-col gap-4">
        {children}
      </div>
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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 lg:pt-8 pb-4">

          {/* Header */}
          <div className="mb-2 animate-fade-up">
            <h2 className="text-ink text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">ตั้งค่าระบบ</h2>
            <p className="text-ink-dim text-sm mt-2">จัดการการเชื่อมต่อ AI โมเดล และพฤติกรรมการทำงานของระบบ</p>
          </div>

          <Row icon={Key} delay={40}
               title="คีย์เชื่อมต่อ AI"
               desc="ใส่ Google AI key เพื่อให้ระบบเขียนสคริปต์และสร้างวิดีโอได้ (จาก aistudio.google.com)">
            <Field label="Google AI Key" value={cfg.google_api_key || ''} onChange={set('google_api_key')} type="password" placeholder="AI…" />
          </Row>

          <Row icon={SlidersHorizontal} delay={80}
               title="ร้านค้าและการโพสต์"
               desc="ชื่อร้านสำหรับใส่ในแคปชัน และระยะห่างการโพสต์ให้ดูเป็นธรรมชาติ (กันสแปม)">
            <Field label="ชื่อร้าน" value={cfg.shop_name || ''} onChange={set('shop_name')} placeholder="ชื่อร้านของคุณ" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="เว้นระยะต่ำสุด (วินาที)" value={cfg.post_delay_min || ''} onChange={set('post_delay_min')} placeholder="30" />
              <Field label="เว้นระยะสูงสุด (วินาที)" value={cfg.post_delay_max || ''} onChange={set('post_delay_max')} placeholder="120" />
            </div>
          </Row>

          <Row icon={Sparkles} delay={120}
               title="โมเดล AI"
               desc="เลือกโมเดลสร้างวิดีโอและเขียนพรอมต์ที่ key ของคุณเข้าถึงได้"
               action={
                 <button onClick={loadModels} disabled={loadingModels}
                   className="flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-soft bg-accent-wash px-2.5 py-1.5 rounded-lg transition-all">
                   {loadingModels ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                   โหลดโมเดลที่ใช้ได้
                 </button>
               }>
            {modelErr && <p className="text-danger text-xs">{modelErr}</p>}
            <Select label="โมเดลวิดีโอ (Veo)" value={cfg.vdo_model || 'veo-2.0-generate-001'} onChange={set('vdo_model')} options={veoOptions} />
            <Select label="โมเดลเขียนพรอมต์ (Gemini)" value={cfg.prompt_model || 'gemini-2.0-flash'} onChange={set('prompt_model')} options={gemOptions} />
            <div className="pt-1 border-t border-line-soft">
              <Toggle label="สร้างเสียงในวิดีโอ" hint="เฉพาะ Veo 3 (Veo 2 ไม่รองรับ)" value={!!cfg.generate_audio} onChange={set('generate_audio')} />
            </div>
          </Row>

          <Row icon={Mic} delay={160}
               title="อวตารรีวิว (D-ID)"
               desc="ใช้คนเสมือนพูดรีวิวสินค้า — ออปชันเสริม ต้องมี D-ID key">
            <Field label="D-ID API Key" value={cfg.did_api_key || ''} onChange={set('did_api_key')} type="password" placeholder="จาก studio.d-id.com" />
            <div className="grid grid-cols-2 gap-4">
              <Select label="เสียงพากย์" value={cfg.avatar_voice || 'th-TH-PremwadeeNeural'} onChange={set('avatar_voice')}
                options={['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural']} />
              <Select label="ความยาวสคริปต์ (วิ)" value={String(cfg.review_seconds || '18')} onChange={set('review_seconds')} options={['12','18','25','30']} />
            </div>
            <Field label="รูปอวตาร (URL)" value={cfg.avatar_url || ''} onChange={set('avatar_url')} placeholder="ลิงก์รูปหน้าคน (ค่าเริ่มต้น = presenter ของ D-ID)" />
          </Row>

          <Row icon={Video} delay={200}
               title="สไตล์วิดีโอ"
               desc="กำหนดโทน กลุ่มเป้าหมาย และความยาวของคลิปที่สร้าง">
            <div className="grid grid-cols-2 gap-4">
              <Select label="กลุ่มเป้าหมาย" value={cfg.age_group || 'All Ages'} onChange={set('age_group')} options={['All Ages','Gen Z','Millennial','Adult']} />
              <Select label="บุคลิก" value={cfg.personality || 'Fun'} onChange={set('personality')} options={['Fun','Serious','Friendly','Luxury']} />
              <Select label="สไตล์" value={cfg.style || 'Lifestyle'} onChange={set('style')} options={['Lifestyle','Review','Compare','Comedy']} />
              <Select label="ฉากหลัง" value={cfg.background || 'Studio'} onChange={set('background')} options={['Studio','Outdoor','Home','Office']} />
              <Select label="ความยาว (วินาที)" value={String(cfg.duration || '8')} onChange={set('duration')} options={['6','8','12','15']} />
            </div>
          </Row>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="shrink-0 border-t border-line bg-surface/80 backdrop-blur-xl">
        <div className="max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-10 py-3.5 flex items-center gap-3">
          <button onClick={save}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all active:scale-[.98]
              ${saved ? 'bg-success' : 'bg-accent hover:bg-accent-soft'}`}>
            {saved ? <Check size={15} strokeWidth={3} /> : <Save size={15} />}
            {saved ? 'บันทึกแล้ว' : 'บันทึกการตั้งค่า'}
          </button>
          <button onClick={testVideo} disabled={testing}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-ink-dim bg-elevated border border-line hover:border-accent hover:text-accent transition-all disabled:opacity-50">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {testing ? 'กำลังสร้าง…' : 'ทดสอบสร้างวิดีโอ'}
          </button>
          <p className="hidden md:block text-[11px] text-ink-mute ml-1">
            ทดสอบจะใช้สินค้าแรกในคิวสร้าง 1 คลิป — ดูผลที่บันทึกการทำงาน
          </p>
        </div>
      </div>
    </div>
  )
}
