'use client'
import { useState, useEffect } from 'react'
import { api }    from '@/lib/api'
import { Eye, EyeOff, Save, Key, SlidersHorizontal, Video, Check, Sparkles, RefreshCw, Play, Loader2, Mic } from 'lucide-react'

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  const [show, setShow] = useState(false)
  const secret = type === 'password'
  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-white/[0.04] last:border-0">
      <label className="text-slate-500 text-sm w-44 shrink-0">{label}</label>
      <div className="flex-1 relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 rounded-xl outline-none focus:border-violet-500/60 placeholder:text-slate-700 transition-colors"
        />
        {secret && (
          <button onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-white/[0.04] last:border-0">
      <label className="text-slate-500 text-sm w-44 shrink-0">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 bg-white/[0.04] border border-white/[0.08] text-white text-sm px-3 py-2 rounded-xl outline-none focus:border-violet-500/60 appearance-none cursor-pointer transition-colors">
        {options.map(o => <option key={o} value={o} style={{ background: '#1a1a2e' }}>{o}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, value, onChange, hint }) {
  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-white/[0.04] last:border-0">
      <label className="text-slate-500 text-sm w-44 shrink-0">
        {label}
        {hint && <span className="block text-[10px] text-slate-700 mt-0.5">{hint}</span>}
      </label>
      <button onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-violet-500' : 'bg-white/[0.1]'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Section({ icon: Icon, title, children, action }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: '#111120' }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.05]" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="p-1.5 rounded-lg bg-violet-500/10">
          <Icon size={13} className="text-violet-400" />
        </div>
        <h3 className="text-white font-semibold text-sm">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="px-5">{children}</div>
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
      else setModelErr(r.error || 'โหลดรายการ model ไม่ได้')
    } catch { setModelErr('เชื่อมต่อ backend ไม่ได้') }
    setLoadingModels(false)
  }

  const testVideo = async () => {
    setTesting(true)
    try { await api.videoTest() } catch {}
    setTimeout(() => setTesting(false), 4000)
  }

  // Fallback model lists if not fetched yet
  const veoOptions = veoModels.length ? veoModels : [cfg.vdo_model || 'veo-2.0-generate-001']
  const gemOptions = gemModels.length ? gemModels : [cfg.prompt_model || 'gemini-2.0-flash']

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl">

      <Section icon={Key} title="API Key (Google AI Studio)">
        <Field label="Google AI Key" value={cfg.google_api_key || ''} onChange={set('google_api_key')} type="password" placeholder="AI… (จาก aistudio.google.com + เปิด billing)" />
      </Section>

      <Section icon={SlidersHorizontal} title="App Config">
        <Field label="Server Port"     value={cfg.server_port    || ''} onChange={set('server_port')}    placeholder="3001" />
        <Field label="Shop Name"       value={cfg.shop_name      || ''} onChange={set('shop_name')}      placeholder="My Shop" />
        <Field label="Min Delay (sec)" value={cfg.post_delay_min || ''} onChange={set('post_delay_min')} placeholder="30" />
        <Field label="Max Delay (sec)" value={cfg.post_delay_max || ''} onChange={set('post_delay_max')} placeholder="120" />
      </Section>

      <Section icon={Sparkles} title="AI Models"
        action={
          <button onClick={loadModels} disabled={loadingModels}
            className="flex items-center gap-1.5 text-[11px] text-violet-400 hover:text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 rounded-lg transition-all">
            {loadingModels ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            โหลด model ที่ key ใช้ได้
          </button>
        }>
        {modelErr && <p className="text-rose-400 text-xs pt-3">{modelErr}</p>}
        <Select label="Video Model (Veo)"   value={cfg.vdo_model    || 'veo-2.0-generate-001'} onChange={set('vdo_model')}    options={veoOptions} />
        <Select label="Prompt Model (Gemini)" value={cfg.prompt_model || 'gemini-2.0-flash'}    onChange={set('prompt_model')} options={gemOptions} />
        <Toggle label="สร้างเสียงในวิดีโอ" hint="เฉพาะ Veo 3 (Veo 2 ไม่รองรับ)" value={!!cfg.generate_audio} onChange={set('generate_audio')} />
      </Section>

      <Section icon={Mic} title="Avatar Review (D-ID)">
        <Field label="D-ID API Key" value={cfg.did_api_key || ''} onChange={set('did_api_key')} type="password" placeholder="จาก studio.d-id.com (ทดลองฟรี 14 วัน)" />
        <Select label="เสียงพากย์" value={cfg.avatar_voice || 'th-TH-PremwadeeNeural'} onChange={set('avatar_voice')}
          options={['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural']} />
        <Field label="รูป Avatar (URL)" value={cfg.avatar_url || ''} onChange={set('avatar_url')} placeholder="ลิงก์รูปหน้าคน (default = presenter ของ D-ID)" />
        <Select label="ความยาวสคริปต์ (วิ)" value={String(cfg.review_seconds || '18')} onChange={set('review_seconds')} options={['12','18','25','30']} />
      </Section>

      <Section icon={Video} title="Video Settings">
        <Select label="Audience"    value={cfg.age_group    || 'All Ages'}  onChange={set('age_group')}   options={['All Ages','Gen Z','Millennial','Adult']} />
        <Select label="Personality" value={cfg.personality  || 'Fun'}       onChange={set('personality')} options={['Fun','Serious','Friendly','Luxury']} />
        <Select label="Style"       value={cfg.style        || 'Lifestyle'} onChange={set('style')}       options={['Lifestyle','Review','Compare','Comedy']} />
        <Select label="Background"  value={cfg.background   || 'Studio'}    onChange={set('background')}  options={['Studio','Outdoor','Home','Office']} />
        <Select label="Duration"    value={String(cfg.duration || '8')}     onChange={set('duration')}    options={['6','8','12','15']} />
      </Section>

      <div className="flex gap-3">
        <button onClick={save}
          className="flex items-center justify-center gap-2 flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: saved ? 'linear-gradient(135deg,#059669,#047857)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                   boxShadow: saved ? '0 4px 14px rgba(5,150,105,0.3)' : '0 4px 14px rgba(124,58,237,0.3)' }}>
          {saved ? <Check size={15} strokeWidth={3} /> : <Save size={15} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
        <button onClick={testVideo} disabled={testing}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/15 transition-all disabled:opacity-50">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {testing ? 'กำลังสร้าง…' : 'ทดสอบสร้างวิดีโอ'}
        </button>
      </div>
      <p className="text-[11px] text-slate-600 -mt-1">
        💡 "ทดสอบสร้างวิดีโอ" จะใช้สินค้าแรกในคิว (หรือตัวอย่าง) สร้าง 1 คลิป — ดูผลที่ System Log แล้วไฟล์จะอยู่ใน data/output/pending
      </p>
    </div>
  )
}
