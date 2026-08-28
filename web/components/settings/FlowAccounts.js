'use client'
// บัญชี Google Flow ที่ให้ระบบหมุนเมื่อเครดิตหมด
// เก็บแค่ "อีเมล" ไม่เก็บรหัสผ่าน — ผู้ใช้ล็อกอินเองใน Chrome ครั้งเดียวต่อบัญชี
// แล้วส่วนขยายจะสลับบัญชีผ่านเมนูบัญชีของ Google เอง (ไม่มีการกรอกรหัสอัตโนมัติ)
import { useState, useEffect } from 'react'
import { Plus, Trash2, Pause, Play, ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const FLOW_URL = 'https://labs.google/fx/th/tools/flow'
const fmtAt = ts => {
  if (!ts) return 'ยังไม่เคยอ่าน'
  const m = Math.round((Date.now() / 1000 - ts) / 60)
  if (m < 1) return 'เมื่อครู่'
  if (m < 60) return `${m} นาทีที่แล้ว`
  return `${Math.round(m / 60)} ชม.ที่แล้ว`
}

export function FlowAccounts({ onNotify, onError }) {
  const [list, setList] = useState([])
  const [perClip, setPerClip] = useState(15)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => api.flowAccounts()
    .then(d => { setList(d.accounts || []); if (d.per_clip) setPerClip(d.per_clip) })
    .catch(() => onError?.('โหลดรายการบัญชีไม่สำเร็จ'))
    .finally(() => setLoading(false))
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id) }, [])   // eslint-disable-line

  const persist = async next => {
    setSaving(true)
    try {
      const r = await api.saveFlowAccounts(next.map(({ email, label, paused }) => ({ email, label, paused })))
      if (!r?.ok) { onError?.(r?.error || 'บันทึกไม่สำเร็จ'); return false }
      setList(next)
      return true
    } catch { onError?.('บันทึกไม่สำเร็จ'); return false }
    finally { setSaving(false) }
  }

  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) { onError?.('ใส่อีเมล Google ให้ถูกต้อง'); return }
    if (list.some(a => a.email === e)) { onError?.('มีบัญชีนี้อยู่แล้ว'); return }
    if (await persist([...list, { email: e, label: '', paused: false }])) {
      setEmail('')
      onNotify?.('เพิ่มบัญชีแล้ว — อย่าลืมล็อกอินบัญชีนี้ใน Chrome ด้วย')
    }
  }
  const remove = a => persist(list.filter(x => x.email !== a.email))
  const togglePause = a => persist(list.map(x => x.email === a.email ? { ...x, paused: !x.paused } : x))

  const total = list.reduce((s, a) => s + (Number.isFinite(a.credit) ? a.credit : 0), 0)
  const known = list.filter(a => Number.isFinite(a.credit)).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="t-section text-ink">บัญชี Google Flow (หมุนอัตโนมัติเมื่อเครดิตหมด)</h3>
        <p className="t-cap mt-1 leading-relaxed">
          ใส่ได้หลายบัญชี ระบบจะสลับให้เองเมื่อเครดิตเหลือน้อยกว่า {perClip}/คลิป ·
          <span className="text-ink"> เก็บแค่อีเมล ไม่เก็บรหัสผ่าน</span> — ต้องล็อกอินบัญชีนั้นใน Chrome ไว้ก่อนครั้งเดียว
        </p>
      </div>

      {/* เพิ่มบัญชี */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="อีเมล Google เช่น myshop2@gmail.com"
          className="flex-1 min-w-[16rem] rounded-lg border border-line bg-surface px-3 py-2 t-body text-ink
                     placeholder:text-ink-mute outline-none focus:border-accent" />
        <Button size="sm" onClick={add} disabled={saving}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} เพิ่มบัญชี
        </Button>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw size={13} /> รีเฟรช</Button>
      </div>

      {loading ? (
        <div className="py-6 grid place-items-center"><Loader2 size={20} className="animate-spin text-accent" /></div>
      ) : list.length === 0 ? (
        <p className="t-cap">ยังไม่มีบัญชี — ตอนนี้ระบบใช้บัญชีที่ล็อกอินอยู่ใน Chrome บัญชีเดียว</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {list.map(a => (
              <div key={a.email}
                className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5
                  ${a.paused ? 'border-line bg-elevated opacity-70' : 'border-line bg-surface'}`}>
                <div className="flex-1 min-w-[12rem]">
                  <p className="t-body font-semibold text-ink truncate">{a.email}</p>
                  <p className="t-cap">
                    {Number.isFinite(a.credit)
                      ? <>เครดิต <span className={a.credit >= perClip ? 'text-success font-semibold' : 'text-danger font-semibold'}>{a.credit}</span> · อ่านเมื่อ {fmtAt(a.credit_at)}</>
                      : 'ยังไม่เคยอ่านเครดิต — เปิดหน้า Flow ด้วยบัญชีนี้สักครั้ง'}
                  </p>
                </div>
                <span className={`t-badge px-2 py-0.5 rounded-full
                  ${a.paused ? 'bg-elevated text-ink-dim'
                    : a.usable ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                  {a.paused ? 'พักไว้' : a.usable ? 'พร้อมใช้' : 'เครดิตไม่พอ'}
                </span>
                <button onClick={() => togglePause(a)} title={a.paused ? 'เปิดใช้' : 'พักบัญชีนี้'}
                  className="p-1.5 rounded-lg text-ink-dim hover:text-ink hover:bg-elevated">
                  {a.paused ? <Play size={14} /> : <Pause size={14} />}
                </button>
                <a href={`${FLOW_URL}?authuser=${encodeURIComponent(a.email)}`} target="_blank" rel="noreferrer"
                  title="เปิด Flow เพื่อล็อกอิน/เช็กเครดิตบัญชีนี้"
                  className="p-1.5 rounded-lg text-ink-dim hover:text-accent-ink hover:bg-elevated">
                  <ExternalLink size={14} />
                </a>
                <button onClick={() => remove(a)} title="ลบบัญชีนี้"
                  className="p-1.5 rounded-lg text-ink-dim hover:text-danger hover:bg-elevated">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="t-cap">
            รวมเครดิตที่อ่านได้ <span className="text-ink font-semibold">{total}</span> จาก {known}/{list.length} บัญชี
            {known < list.length && ' — บัญชีที่เหลือยังไม่เคยเปิดหน้า Flow เลยยังไม่รู้ยอด'}
          </p>
        </>
      )}

      <div className="rounded-xl border border-line bg-elevated px-4 py-3">
        <p className="t-section text-ink mb-1.5">ต้องทำครั้งเดียวต่อบัญชี</p>
        <ol className="t-cap leading-relaxed list-decimal ml-4 space-y-0.5">
          <li>เปิด Chrome → รูปโปรไฟล์มุมขวาบน → <span className="text-ink">เพิ่มบัญชี</span> แล้วล็อกอิน Google บัญชีนั้น</li>
          <li>เปิด <a href={FLOW_URL} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">Google Flow</a> ด้วยบัญชีนั้นสักครั้ง เพื่อให้ระบบอ่านยอดเครดิตได้</li>
          <li>กลับมาหน้านี้ กด "เพิ่มบัญชี" ใส่อีเมลเดียวกัน</li>
        </ol>
        <p className="t-cap mt-2 leading-relaxed">
          ระบบจะไม่กรอกรหัสผ่านให้ — Google บล็อกการล็อกอินอัตโนมัติ และเสี่ยงโดนระงับบัญชี
          การสลับใช้เมนูบัญชีของ Google ที่ล็อกอินค้างไว้แล้วเท่านั้น
        </p>
      </div>
    </div>
  )
}
