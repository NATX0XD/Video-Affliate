'use client'
// หัวข้อ 1 อัน = ป้ายชื่อ + ปุ่มสลับ "เขียนเอง" + ตัวเลือกพรีเซ็ต (children) หรือช่องพิมพ์
// ปิดโหมดเขียนเอง = ล้างข้อความหัวข้อนั้นทิ้ง แล้วกลับไปใช้พรีเซ็ต
import { useState } from 'react'
import { Loader2, Pencil, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import { GEN_PROMPT_FIELDS, productName, productPrice, commissionRate } from '@/lib/gen-options'
import { api } from '@/lib/api'

const fieldOf = key => GEN_PROMPT_FIELDS.find(f => f.key === key)

function estimateWords(text) {
  const s = String(text || '').trim()
  if (!s) return 0
  const chunks = s.split(/\s+/).filter(Boolean)
  const thai = (s.match(/[ก-๙]/g) || []).length
  return thai > 8 ? Math.max(chunks.length, Math.ceil(thai / 4)) : chunks.length
}

function parseOptions(data) {
  const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    const list = Array.isArray(parsed) ? parsed : parsed.options
    if (Array.isArray(list)) return list.map(x => typeof x === 'string' ? { text: x } : x).filter(x => x?.text)
  } catch {}
  return cleaned.split(/\n+/).map(x => x.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(x => x.length > 8).map(text => ({ text }))
}

function buildPrompt(fieldKey, products, presets, existing) {
  const items = (products || []).map(p => ({
    ชื่อสินค้า: productName(p) || 'ไม่ทราบชื่อ',
    ราคา: productPrice(p) || 'ไม่ระบุ',
    คอมมิชชัน: commissionRate(p) == null ? 'ไม่ระบุ' : `${commissionRate(p)}%`,
  }))
  const safePreset = { ...(presets || {}) }
  delete safePreset.prompts
  delete safePreset.bgImage
  delete safePreset.moodImage
  const f = fieldOf(fieldKey)
  const scriptRule = fieldKey === 'script'
    ? 'ต้องเป็นบทพูดจริงที่พูดได้ทันที เปิดด้วยฮุกใน 3 วินาทีแรก และยาวพอดี 8-15 วินาที (ประมาณ 18-35 คำภาษาไทย) ห้ามเขียนคำบรรยายฉากแทนบทพูด'
    : 'เขียนให้ใช้ได้จริงกับสินค้านี้ ไม่ใช้คำกว้างๆ ที่ใช้กับสินค้าอะไรก็ได้'
  const editing = existing?.trim()
    ? `ข้อความที่ผู้ใช้พิมพ์ค้างไว้ (ให้ช่วยขัดเกลาและรักษาเจตนาเดิม ไม่ต้องเขียนหนีจากข้อความนี้):\n${existing.trim()}`
    : 'ยังไม่มีข้อความค้าง ให้ร่างใหม่โดยอิงข้อมูลด้านบน'
  return `คุณเป็นนักเขียนคอนเทนต์ขายของสำหรับคลิปสั้นภาษาไทย\nหัวข้อที่ต้องร่าง: ${f?.label || fieldKey}\n\nสินค้า (ต้องพูดถึงชื่อสินค้าจริงอย่างน้อยหนึ่งครั้งในทุกตัวเลือก):\n${JSON.stringify(items, null, 2)}\n\nพรีเซ็ตที่ผู้ใช้เลือกไว้แล้วจากขั้นก่อนหน้า (ต้องเคารพบริบทนี้):\n${JSON.stringify(safePreset, null, 2)}\n\n${editing}\n\nข้อกำหนด: ${scriptRule}\nส่งกลับ JSON เท่านั้น รูปแบบ {"options":[{"text":"ตัวเลือกที่ 1"},{"text":"ตัวเลือกที่ 2"},{"text":"ตัวเลือกที่ 3"}]} ต้องมี 3 ตัวเลือกพอดี ไม่มี markdown ไม่มีคำอธิบายนอก JSON`;
}

function AiDraft({ fieldKey, products, presets, value, onPick }) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = async () => {
    if (!products?.length) { setError('ยังไม่พบข้อมูลสินค้า — กลับไปเลือกสินค้าจากคลังแล้วลองใหม่'); return }
    setLoading(true); setError('')
    try {
      const data = await api.gemini(buildPrompt(fieldKey, products, presets, value), {
        responseMimeType: 'application/json',
        temperature: 0.85,
      })
      const next = parseOptions(data).slice(0, 3)
      if (next.length < 3) throw new Error('AI ส่งตัวเลือกกลับมาไม่ครบ 3 แบบ — กดขอใหม่อีกครั้ง')
      setOptions(next)
    } catch (e) {
      setOptions([])
      setError(e?.message || 'AI ร่างข้อความไม่สำเร็จ — ลองใหม่อีกครั้ง')
    } finally { setLoading(false) }
  }
  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={request} disabled={loading}
        className="w-fit inline-flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent-wash px-3 py-1.5 t-cap font-semibold text-accent-ink hover:bg-accent/20 disabled:opacity-60">
        {loading ? <Loader2 size={14} className="animate-spin" /> : options.length ? <RefreshCw size={14} /> : <Sparkles size={14} />}
        {loading ? 'AI กำลังคิด…' : options.length ? 'ขอใหม่' : 'ให้ AI ร่างให้'}
      </button>
      {error && <p role="alert" className="t-cap text-danger leading-relaxed">{error}</p>}
      {options.length > 0 && (
        <div className="grid gap-2">
          <p className="t-cap text-ink-dim">เลือกตัวเลือกที่ชอบ แล้วแก้ต่อในช่องได้เลย</p>
          {options.map((option, i) => (
            <button type="button" key={`${i}-${option.text}`} onClick={() => onPick(option.text)}
              className="text-left rounded-xl border border-line bg-surface px-3.5 py-3 hover:border-accent hover:bg-accent-wash transition-colors">
              <span className="t-cap font-semibold text-accent-ink">ตัวเลือก {i + 1}{fieldKey === 'script' ? ` · ประมาณ ${option.words || estimateWords(option.text)} คำ` : ''}</span>
              <span className="block t-body text-ink mt-1 whitespace-pre-wrap">{option.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Topic({ label, fieldKey, prompts, onPrompts, hint, children, onClear, custom: extra, products, presets }) {
  const typed = !!(prompts[fieldKey] || '').trim()
  const [custom, setCustom] = useState(typed)
  const f = fieldOf(fieldKey)

  const toggle = () => {
    const next = !custom
    setCustom(next)
    if (!next) {
      const p = { ...prompts }; delete p[fieldKey]
      onPrompts(p)
      onClear?.()
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <h3 className="t-section text-ink">{label}</h3>
        {hint && !custom && <p className="t-cap hidden sm:block">{hint}</p>}
        {fieldKey && (
          <button type="button" onClick={toggle}
            className={`ml-auto flex items-center gap-1.5 t-cap font-semibold rounded-lg px-2.5 py-1 border transition-colors
              ${custom ? 'border-accent bg-accent-wash text-accent-ink' : 'border-line text-ink-dim hover:text-ink'}`}>
            {custom ? <><RotateCcw size={13} /> ใช้ตัวเลือก</> : <><Pencil size={13} /> เขียนเอง</>}
          </button>
        )}
      </div>

      {custom
        ? <div className="flex flex-col gap-3">
            <textarea
              value={prompts[fieldKey] || ''}
              onChange={e => onPrompts({ ...prompts, [fieldKey]: e.target.value })}
              placeholder={f?.ph}
              rows={3}
              className="w-full resize-y rounded-xl border border-accent/40 bg-surface px-3.5 py-2.5 t-body
                         text-ink placeholder:text-ink-mute outline-none focus:border-accent" />
            <AiDraft fieldKey={fieldKey} products={products} presets={presets} value={prompts[fieldKey] || ''}
              onPick={text => onPrompts({ ...prompts, [fieldKey]: text })} />
            {/* กล่องอัปรูป/บันทึกของหัวข้อนั้น — โผล่ทันทีที่กด "เขียนเอง" ไม่ต้องรอพิมพ์ก่อน */}
            {extra}
          </div>
        : children}
    </section>
  )
}

// ช่องพิมพ์เดี่ยว ๆ สำหรับหัวข้อที่ไม่มีพรีเซ็ตให้เลือก
export function PromptBox({ fieldKey, prompts, onPrompts, rows = 3, products, presets }) {
  const f = fieldOf(fieldKey)
  const typed = !!(prompts[fieldKey] || '').trim()
  return (
    <div className="flex flex-col gap-1.5">
      <p className={`t-section ${typed ? 'text-accent-ink' : 'text-ink'}`}>{f?.label}</p>
      <textarea
        value={prompts[fieldKey] || ''}
        onChange={e => onPrompts({ ...prompts, [fieldKey]: e.target.value })}
        placeholder={f?.ph}
        rows={rows}
        className={`w-full resize-y rounded-xl border bg-surface px-3.5 py-2.5 t-body text-ink
                    placeholder:text-ink-mute outline-none focus:border-accent
                    ${typed ? 'border-accent/40' : 'border-line'}`} />
      <AiDraft fieldKey={fieldKey} products={products} presets={presets} value={prompts[fieldKey] || ''}
        onPick={text => onPrompts({ ...prompts, [fieldKey]: text })} />
    </div>
  )
}
