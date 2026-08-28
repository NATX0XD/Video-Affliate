'use client'
// ขั้น 6 — ตรวจแล้วสร้าง
import { useState, useEffect } from 'react'
import { ExternalLink, Save, BookmarkPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import {
  GEN_CHARS, GEN_AUDS, GEN_STYLES, GEN_LENS, GEN_ENGINES, GEN_BGS, GEN_MOODS,
  GEN_LANGS, GEN_MUSICS, GEN_PROMPT_FIELDS, cleanPrompts,
} from '@/lib/gen-options'
import { saveTemplate } from '@/lib/gen-templates'
import { PromptBox } from '@/components/gen/CustomField'

export function StepReview({ o, set, products, onNotify, onError }) {
  const [extOnline, setExtOnline] = useState(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const prompts = o.prompts || {}
  const custom = cleanPrompts(prompts)
  const clips = (o.len || 1) * products.length

  useEffect(() => {
    let alive = true
    const chk = () => api.flowStatus().then(d => alive && setExtOnline(!!d.ext_online)).catch(() => alive && setExtOnline(false))
    chk(); const id = setInterval(chk, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const rows = [
    ['ตัวละคร', custom.char ? 'กำหนดเอง' : GEN_CHARS.find(c => c.id === o.charId)?.name],
    ['กลุ่มเป้าหมาย', GEN_AUDS.find(a => a.id === o.aud)?.name],
    ['แนวคลิป', GEN_STYLES.find(s => s.id === o.style)?.name],
    ['ความยาว', GEN_LENS.find(l => l.n === o.len)?.t],
    ['เอนจิน', GEN_ENGINES.find(e => e.id === o.engine)?.t],
    ['ฉาก', custom.scene ? 'กำหนดเอง' : GEN_BGS.find(b => b.id === o.bg)?.name],
    ['อารมณ์ภาพ', custom.mood ? 'กำหนดเอง' : GEN_MOODS.find(m => m.id === o.mood)?.name],
    ['ภาษา', o.sound === 'mute' ? 'ไม่มีเสียงพูด' : GEN_LANGS.find(l => l.id === o.lang)?.name],
    ['เพลง', custom.music ? 'กำหนดเอง' : GEN_MUSICS.find(m => m.id === o.music)?.name],
  ]

  const save = () => {
    const r = saveTemplate(name, o)
    if (!r.ok) { onError(r.error); return }
    setNaming(false)
    onNotify(r.replaced ? `ทับสูตร "${name.trim()}" แล้ว` : `บันทึกสูตร "${name.trim()}" แล้ว`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="t-title text-ink">ตรวจแล้วสร้าง</h2>
        <p className="t-cap mt-1">จะสร้าง {clips} คลิป จาก {products.length} สินค้า · ใช้ ~{clips} เครดิต Flow</p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="t-cap">{k}</span>
            <span className="t-body font-semibold text-ink">{v || '-'}</span>
          </div>
        ))}
      </div>

      {(Object.keys(custom).length > 0 || o.bgImage) && (
        <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-2.5">
          <p className="t-section text-ink">พรอมป์ที่เขียนเอง</p>
          {GEN_PROMPT_FIELDS.filter(f => custom[f.key]).map(f => (
            <p key={f.key} className="t-body">
              <span className="text-accent-ink font-semibold">{f.label}: </span>
              <span className="text-ink">{custom[f.key]}</span>
            </p>
          ))}
          {o.bgImage && (
            <div className="flex items-center gap-3">
              <img src={o.bgImage} alt="" className="w-14 h-14 rounded-lg object-cover border border-line" />
              <span className="t-cap">รูปฉากหลัง — ส่งเข้า Flow เป็นภาพอ้างอิงฉากตอนสร้างเฟรม</span>
            </div>
          )}
        </div>
      )}

      <PromptBox fieldKey="avoid" prompts={prompts} onPrompts={p => set({ prompts: p })} rows={2} />

      {/* บันทึกเป็นสูตร */}
      <div>
        {naming ? (
          <div className="flex flex-wrap items-center gap-2">
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="ชื่อสูตร เช่น สายบิวตี้ห้องนอน"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 t-body text-ink outline-none focus:border-accent w-64" />
            <Button size="sm" onClick={save} disabled={!name.trim()}><Save size={13} /> บันทึก</Button>
            <button type="button" onClick={() => setNaming(false)} className="t-cap hover:text-ink">ยกเลิก</button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setNaming(true)}>
            <BookmarkPlus size={13} /> บันทึกเป็นสูตร
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-2">
        <p className="t-section text-ink flex items-center gap-2">
          <ExternalLink size={14} className="text-accent-ink" /> ก่อนสร้าง — เปิด Google Flow + ล็อกอินค้างไว้
        </p>
        <div className={`flex items-center gap-2 t-cap font-semibold rounded-lg px-3 py-1.5 w-fit
          ${extOnline === true ? 'bg-success/15 text-success'
            : extOnline === false ? 'bg-danger/15 text-danger' : 'bg-elevated text-ink-dim'}`}>
          <span className={`w-2 h-2 rounded-full ${extOnline === true ? 'bg-success' : extOnline === false ? 'bg-danger' : 'bg-ink-mute'}`} />
          {extOnline === true ? 'ส่วนขยายเชื่อมแล้ว — พร้อมสร้าง'
            : extOnline === false ? 'ส่วนขยายยังไม่เชื่อม — เปิด Chrome ที่ติดตั้งส่วนขยายไว้ก่อนกดสร้าง'
            : 'กำลังเช็กส่วนขยาย…'}
        </div>
        <p className="t-cap leading-relaxed">
          กด "สร้างจริง" แล้วงานเข้าคิว → ส่วนขยายจะเปิด Google Flow แล้วขับสร้างให้อัตโนมัติ
          (สร้างโปรเจกต์ใหม่ + ใส่พรอมป์ + รอเรนเดอร์)
        </p>
        <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 t-cap font-semibold text-accent-ink hover:underline w-fit">
          <ExternalLink size={13} /> เปิด Google Flow เพื่อล็อกอิน
        </a>
      </div>
    </div>
  )
}
