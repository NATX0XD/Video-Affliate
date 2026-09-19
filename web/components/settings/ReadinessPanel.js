'use client'
// ความพร้อมระบบ — ที่เดียวที่บอกว่า "อะไรพร้อม/อะไรยังขาด" ก่อนเริ่มสร้างคลิป
// ทำไมต้องมี: คนติดตั้งใหม่ไม่รู้ว่ายังขาดคีย์ AI / ส่วนขยาย / มือถือ แล้วไปเจอตอนกดสร้างคลิปแล้วล้มเงียบ
// อ่านจาก API จริงทุก 10 วิ (ไม่ใช่ค่าที่บันทึกไว้) — ขาดข้อไหนบอกวิธีแก้ต่อท้ายทันที
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { CheckCircle2, XCircle, RefreshCw, Loader2, ExternalLink } from 'lucide-react'

const AI_STUDIO = 'https://aistudio.google.com/apikey'

export function ReadinessPanel() {
  const [setup, setSetup]   = useState(null)
  const [status, setStatus] = useState(null)
  const [accts, setAccts]   = useState(null)
  const [busy, setBusy]     = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    await Promise.all([
      api.getSetup().then(setSetup).catch(() => {}),
      api.status().then(setStatus).catch(() => {}),
      api.flowAccounts().then(d => setAccts(d.accounts || [])).catch(() => {}),
    ])
    setBusy(false)
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id) }, [load])

  const online   = (status?.devices || []).filter(d => d.status === 'device')
  const extOk    = !!status?.extension?.connected
  const keyOk    = !!setup?.google_api_key_set
  const acctList = accts || []
  const acctOk   = acctList.some(a => !a.paused)

  const rows = [
    {
      ok: keyOk,
      label: 'คีย์ AI (Gemini)',
      okText: 'ตั้งไว้แล้ว',
      badText: 'ยังไม่ได้ใส่คีย์ — สร้างคลิปไม่ได้',
      fix: 'เลื่อนลงไปหัวข้อ "คีย์ AI (Gemini)" ด้านล่าง วางคีย์ที่ขึ้นต้นด้วย AIza… แล้วกด "บันทึกการตั้งค่า"',
      action: (
        <a href={AI_STUDIO} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1 text-accent text-xs font-medium hover:underline">
          <ExternalLink size={12} /> ขอคีย์ฟรี
        </a>
      ),
    },
    {
      ok: extOk,
      label: 'ส่วนขยาย Chrome',
      okText: 'เชื่อมต่ออยู่',
      badText: 'ยังไม่ได้เชื่อม — สั่ง Google Flow สร้างคลิปไม่ได้',
      fix: 'เปิด Chrome ค้างไว้ → ไปที่ chrome://extensions → เช็กว่า "VDO Gen" เปิดอยู่ แล้วกด reload (ถ้ายังไม่ได้ติดตั้ง ให้กด "อัปเดต Extension" ด้านล่าง)',
    },
    {
      ok: online.length > 0,
      label: 'แท็บเล็ต / มือถือ',
      okText: `ออนไลน์ ${online.length} เครื่อง — ${online.map(d => d.model || d.serial).join(', ')}`,
      badText: 'ยังไม่พบเครื่อง — โพสต์อัตโนมัติไม่ได้ (สร้างคลิปได้อยู่)',
      fix: 'เสียบสาย USB + เปิด "โหมดนักพัฒนา" และ "การแก้จุดบกพร่อง USB" บนเครื่อง แล้วกด "อนุญาต (Allow)" — ดูรายละเอียดที่หน้า "ดูแลเครื่อง"',
    },
    {
      ok: acctOk,
      label: 'บัญชี Google Flow',
      okText: `ใส่แล้ว ${acctList.filter(a => !a.paused).length} บัญชี`,
      badText: acctList.length
        ? 'มีบัญชีแต่ถูกพักไว้ทั้งหมด — ระบบจะหมุนเครดิตไม่ได้'
        : 'ยังไม่ได้ใส่บัญชี — เครดิตหมดแล้วระบบสลับบัญชีเองไม่ได้',
      fix: 'เลื่อนลงไปหัวข้อ "บัญชี Google Flow" ด้านล่าง แล้วเพิ่มอีเมล Google ที่ล็อกอินค้างไว้ใน Chrome',
    },
  ]

  const missing = rows.filter(r => !r.ok).length

  return (
    <div className="rounded-xl border border-border bg-card shadow-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {setup === null && status === null
            ? 'กำลังตรวจความพร้อม…'
            : missing === 0
              ? 'พร้อมใช้งานครบทุกข้อ ✓'
              : `ยังขาดอยู่ ${missing} ข้อ`}
        </p>
        <button onClick={load} disabled={busy}
          className="flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          เช็คอีกครั้ง
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map(r => (
          <div key={r.label} className="flex gap-2.5">
            {r.ok
              ? <CheckCircle2 size={16} className="text-success shrink-0 mt-[2px]" />
              : <XCircle size={16} className="text-danger shrink-0 mt-[2px]" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground font-medium leading-tight">
                {r.label}
                <span className={`ml-2 font-normal text-xs ${r.ok ? 'text-success' : 'text-danger'}`}>
                  {r.ok ? r.okText : r.badText}
                </span>
              </p>
              {!r.ok && (
                <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
                  {r.fix} {r.action}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
