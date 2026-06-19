'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Zap, Store, ArrowRight, Loader2 } from 'lucide-react'

export function Onboarding({ initialShop = '', onDone }) {
  const [shop, setShop] = useState(initialShop)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const submit = async () => {
    if (!shop.trim()) { setErr('กรุณาใส่ชื่อร้าน'); return }
    setBusy(true); setErr('')
    try {
      const r = await api.saveSetup({ shop_name: shop.trim() })
      if (r.ok) onDone?.(r.shop_name)
      else setErr(r.error || 'บันทึกไม่สำเร็จ')
    } catch { setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ') }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-base p-4 overflow-y-auto">
      {/* violet glow backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[440px] animate-scale-in">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center glow-accent mb-4"
               style={{ background: 'linear-gradient(135deg,#b975f9,#a855f7)' }}>
            <Zap size={30} className="text-white fill-white" />
          </div>
          <h1 className="text-ink text-2xl font-extrabold tracking-tight">ยินดีต้อนรับสู่ VDO Gen Auto Pilot</h1>
          <p className="text-ink-dim text-sm mt-2">ตั้งชื่อร้านหรือแบรนด์ของคุณเพื่อเริ่มโพสต์วิดีโออัตโนมัติ</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-surface border border-line shadow-card p-6 flex flex-col gap-5">
          <Field icon={Store} label="ชื่อร้าน / แบรนด์" required
            value={shop} onChange={setShop} placeholder="เช่น ร้านของฉัน" autoFocus
            onEnter={submit} />

          {err && <p className="text-danger text-xs -mt-1">{err}</p>}

          <button onClick={submit} disabled={busy}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent hover:bg-accent-soft text-white text-sm font-bold transition-all active:scale-[.98] disabled:opacity-60 glow-accent">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <>เริ่มใช้งาน <ArrowRight size={16} /></>}
          </button>
        </div>

        <p className="text-center text-ink-mute text-[11px] mt-5">
          ข้อมูลถูกบันทึกในเครื่องของคุณเท่านั้น — แก้ไขได้ภายหลังที่หน้าตั้งค่า
        </p>
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, required, type = 'text', value, onChange, placeholder, autoFocus, onEnter }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-ink-dim text-xs font-medium flex items-center gap-1.5">
        <Icon size={13} className="text-ink-mute" /> {label}
        {required && <span className="text-accent">*</span>}
      </label>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        className="w-full bg-elevated border border-line text-ink text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute transition-all"
      />
    </div>
  )
}
