'use client'
// เตือนเมื่อ "โพสต์ไม่ได้" ทั้งที่เปิดโพสต์อัตโนมัติไว้ / มีคลิปรอโพสต์อยู่
// เคสหลัก: ยังไม่ได้เสียบมือถือ — เดิมคลิปจะกองเงียบ ๆ ไม่มีอะไรบอกว่าทำไมไม่โพสต์สักที
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Smartphone, X, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const SNOOZE_KEY = 'post_blocked_snooze'
const SNOOZE_MS  = 30 * 60 * 1000        // กด "ไว้ก่อน" → เงียบ 30 นาที
const POLL_MS    = 20 * 1000

const ICONS = { device: Smartphone, platform: Share2 }
const GOTO  = { device: '/devices', platform: '/settings' }
const CTA   = { device: 'ไปหน้าอุปกรณ์', platform: 'ไปตั้งค่า' }

export function PostBlockedPrompt() {
  const [state, setState] = useState(null)
  const [snoozedAt, setSnoozedAt] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    try { setSnoozedAt(Number(localStorage.getItem(SNOOZE_KEY)) || 0) } catch {}
  }, [])

  useEffect(() => {
    let alive = true
    const check = () => api.pilot()
      .then(d => { if (alive) setState(d) })
      .catch(() => {})
    const t  = setTimeout(check, 3000)          // ให้แอปโหลดเสร็จก่อน
    const id = setInterval(check, POLL_MS)
    return () => { alive = false; clearTimeout(t); clearInterval(id) }
  }, [])

  const blockers = state?.blockers || []
  if (blockers.length === 0) return null
  if (Date.now() - snoozedAt < SNOOZE_MS) return null
  // อยู่หน้าที่แก้ปัญหานั้นอยู่แล้ว ไม่ต้องบังหน้าจอซ้ำ
  if (blockers.every(b => GOTO[b.code] === pathname)) return null

  const later = () => {
    const now = Date.now()
    try { localStorage.setItem(SNOOZE_KEY, String(now)) } catch {}
    setSnoozedAt(now)
  }

  const main = blockers[0]
  const Icon = ICONS[main.code] || Smartphone

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[115] w-[min(30rem,calc(100vw-2rem))]
      rounded-2xl border border-amber-500/40 bg-card shadow-lift p-4 animate-fade-up">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-amber-400/15 grid place-items-center shrink-0">
          <Icon size={18} className="text-amber-500" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-foreground font-bold text-sm leading-tight">{main.title}</p>
          <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{main.detail}</p>

          {blockers.length > 1 && (
            <ul className="mt-2 flex flex-col gap-1">
              {blockers.slice(1).map(b => (
                <li key={b.code} className="text-muted-foreground text-xs leading-relaxed">• {b.title}</li>
              ))}
            </ul>
          )}

          {state.waiting > 0 && (
            <p className="text-amber-500 text-xs mt-2 font-medium">
              มีคลิปรอโพสต์อยู่ {state.waiting} คลิป
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" onClick={() => router.push(GOTO[main.code] || '/devices')}>
              <Icon size={13} /> {CTA[main.code] || 'ไปแก้ไข'}
            </Button>
            <Button variant="outline" size="sm" onClick={later}>ไว้ก่อน</Button>
          </div>
        </div>
        <button onClick={later} aria-label="ปิด" className="text-muted-foreground hover:text-foreground shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
