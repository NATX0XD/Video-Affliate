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
    <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center z-50 p-4">
      {/* Glow backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Zap size={28} className="text-violet-400" fill="currentColor" />
          </div>
          <div className="text-center">
            <h1 className="text-white text-2xl font-extrabold tracking-tight">VDO Gen Auto Pilot</h1>
            <p className="text-zinc-400 text-sm mt-1">กรอก License Key เพื่อเริ่มใช้งาน</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/80 border border-zinc-700/60 rounded-2xl p-6 backdrop-blur-xl shadow-2xl flex flex-col gap-5">

          {/* License key input */}
          <div className="flex flex-col gap-2">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">License Key</label>
            <input
              value={key}
              onChange={handleChange}
              placeholder="VGAP-XXXX-XXXX-XXXX-XXXX"
              spellCheck={false}
              className={`w-full bg-zinc-800/60 border rounded-xl px-4 py-3 text-white font-mono text-sm tracking-widest placeholder:text-zinc-600 outline-none transition-colors
                ${error ? 'border-red-500/60 focus:border-red-500' : 'border-zinc-700/60 focus:border-violet-500/60'}`}
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* Machine ID */}
          <div className="flex flex-col gap-2">
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Machine ID (ส่งให้ผู้ขาย)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-zinc-800/40 border border-zinc-700/40 rounded-xl px-4 py-2.5 text-zinc-300 font-mono text-xs truncate">
                {machineId || '...'}
              </div>
              <button onClick={copyMid}
                className="shrink-0 w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* Activate button */}
          <button onClick={activate} disabled={loading || success}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[.98]
              ${success
                ? 'bg-emerald-600 text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}>
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> กำลังตรวจสอบ...</>
              : success
              ? <><Check size={16} strokeWidth={3} /> Activate สำเร็จ!</>
              : 'Activate License'}
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-5">
          License ผูกกับเครื่องนี้เท่านั้น — 1 เครื่องต่อ 1 Key
        </p>
      </div>
    </div>
  )
}
