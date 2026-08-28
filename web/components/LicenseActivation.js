'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Zap, Copy, Check, Loader2 } from 'lucide-react'

// Format as user types: XXXX-XXXX-XXXX-XXXX-XXXX
function formatKey(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
  const parts = []
  for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4))
  return parts.join('-')
}

export default function LicenseActivation({ onActivated }) {
  const [key, setKey]         = useState('')
  const [machineId, setMid]   = useState('')
  const [copied, setCopied]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.machineId().then(d => setMid(d.machine_id || '')).catch(() => {})
  }, [])

  const handleChange = (e) => {
    setKey(formatKey(e.target.value))
    setError('')
  }

  const copyMid = async () => {
    if (!machineId) return
    await navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activate = async () => {
    if (key.replace(/-/g, '').length < 20) {
      setError('กรุณากรอก License Key ให้ครบ')
      return
    }
    setLoading(true)
    setError('')
    try {
      const r = await api.licenseActivate(key)
      if (r.ok) {
        setSuccess(true)
        setTimeout(() => onActivated?.(), 1200)
      } else {
        setError(r.reason || 'ไม่สามารถ Activate ได้')
      }
    } catch {
      setError('เชื่อมต่อ desktop app ไม่ได้ — ตรวจสอบว่ารันอยู่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-base flex items-center justify-center z-50 p-4">
      {/* Glow backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent-wash border border-accent/30 flex items-center justify-center">
            <Zap size={28} className="text-accent" fill="currentColor" />
          </div>
          <div className="text-center">
            <h1 className="text-ink text-2xl font-extrabold tracking-tight">VDO Gen Auto Pilot</h1>
            <p className="text-ink-dim text-sm mt-1">กรอก License Key เพื่อเริ่มใช้งาน</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface border border-line rounded-2xl p-6 backdrop-blur-xl shadow-2xl flex flex-col gap-5">

          {/* License key input */}
          <div className="flex flex-col gap-2">
            <label className="t-cap font-semibold">License Key</label>
            <input
              value={key}
              onChange={handleChange}
              placeholder="VGAP-XXXX-XXXX-XXXX-XXXX"
              spellCheck={false}
              className={`w-full bg-elevated border rounded-xl px-4 py-3 text-ink font-mono text-sm tracking-widest placeholder:text-ink-mute outline-none transition-colors
                ${error ? 'border-danger/60 focus:border-danger' : 'border-line focus:border-accent'}`}
            />
            {error && <p className="text-danger text-xs">{error}</p>}
          </div>

          {/* Machine ID */}
          <div className="flex flex-col gap-2">
            <label className="t-cap font-semibold">Machine ID (ส่งให้ผู้ขาย)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-elevated border border-line rounded-xl px-4 py-2.5 text-ink-dim font-mono text-xs truncate">
                {machineId || '...'}
              </div>
              <button onClick={copyMid}
                className="shrink-0 w-10 h-10 rounded-xl bg-elevated border border-line flex items-center justify-center text-ink-dim hover:text-ink hover:border-accent/40 transition-colors">
                {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* Activate button */}
          <button onClick={activate} disabled={loading || success}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[.98]
              ${success
                ? 'bg-success text-white'
                : 'bg-accent hover:bg-accent-soft text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}>
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> กำลังตรวจสอบ...</>
              : success
              ? <><Check size={16} strokeWidth={3} /> Activate สำเร็จ!</>
              : 'Activate License'}
          </button>
        </div>

        <p className="text-center t-cap mt-5">
          License ผูกกับเครื่องนี้เท่านั้น — 1 เครื่องต่อ 1 Key
        </p>
      </div>
    </div>
  )
}
