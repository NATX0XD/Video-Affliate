'use client'
// แจ้งเตือนเมื่อมีเวอร์ชันใหม่บน GitHub — เลือกอัปเดตเลย หรือไว้ก่อน (เงียบ 24 ชม.)
import { useEffect, useState } from 'react'
import { Sparkles, X, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const SNOOZE_KEY = 'update_snooze'
const DAY = 24 * 60 * 60 * 1000

export function UpdatePrompt() {
  const [info, setInfo] = useState(null)      // ผลเช็กอัปเดต
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    const check = () => {
      // ผู้ใช้กด "ไว้ก่อน" ไปแล้ว → เงียบ 24 ชม. (เว้นแต่มี commit ใหม่กว่าที่เคยเลื่อน)
      let snooze = null
      try { snooze = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null') } catch {}
      api.appUpdateCheck()
        .then(d => {
          if (!alive || !d?.ok || !d.supported || !d.update_available) return
          if (snooze && snooze.latest === d.latest && Date.now() - snooze.at < DAY) return
          setInfo(d)
        })
        .catch(() => {})
    }
    const t = setTimeout(check, 4000)            // ให้แอปโหลดเสร็จก่อน
    const id = setInterval(check, 60 * 60 * 1000) // เช็กซ้ำทุกชั่วโมง
    return () => { alive = false; clearTimeout(t); clearInterval(id) }
  }, [])

  if (!info) return null

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ latest: info.latest, at: Date.now() })) } catch {}
    setInfo(null)
  }

  const update = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.appUpdate()
      if (r?.ok) setDone(true)
      else setErr(r?.error || 'อัปเดตไม่สำเร็จ')
    } catch { setErr('อัปเดตไม่สำเร็จ — เช็คอินเทอร์เน็ต') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[120] w-[22rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-surface shadow-lift p-4 animate-fade-up">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-accent-wash grid place-items-center shrink-0">
          {done ? <CheckCircle2 size={18} className="text-success" /> : <Sparkles size={18} className="text-accent-ink" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="t-section text-ink">{done ? 'อัปเดตเรียบร้อย' : 'มีเวอร์ชันใหม่'}</p>
          {done ? (
            <p className="t-cap mt-1 leading-relaxed">ปิดโปรแกรมแล้วเปิดใหม่ เพื่อใช้เวอร์ชันที่เพิ่งโหลดมา</p>
          ) : (
            <>
              <p className="t-cap mt-1 leading-relaxed truncate" title={info.message}>{info.message || 'มีการแก้ไขใหม่บน main'}</p>
              <p className="t-cap mt-0.5 opacity-80">{info.current} → {info.latest}</p>
            </>
          )}
          {err && <p className="t-cap text-danger mt-1.5 leading-relaxed">{err}</p>}
          {!done && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" onClick={update} disabled={busy}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} อัปเดตเลย
              </Button>
              <Button variant="outline" size="sm" onClick={later} disabled={busy}>ไว้ก่อน</Button>
            </div>
          )}
        </div>
        <button onClick={later} className="text-ink-mute hover:text-ink shrink-0"><X size={16} /></button>
      </div>
    </div>
  )
}
