'use client'
import { useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'

const VARS = [
  { key: 'name',       label: 'ชื่อสินค้า',
    btn: 'bg-blue-500/15 text-blue-300 border-blue-500/25 hover:bg-blue-500/25',
    chip: 'background:rgba(59,130,246,.15);color:rgb(147,197,253);border:1px solid rgba(59,130,246,.3)' },
  { key: 'price',      label: 'ราคา',
    btn: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/25',
    chip: 'background:rgba(16,185,129,.15);color:rgb(110,231,183);border:1px solid rgba(16,185,129,.3)' },
  { key: 'commission', label: 'ค่าคอม %',
    btn: 'bg-orange-500/15 text-orange-300 border-orange-500/25 hover:bg-orange-500/25',
    chip: 'background:rgba(249,115,22,.15);color:rgb(253,186,116);border:1px solid rgba(249,115,22,.3)' },
  { key: 'link',       label: 'ลิงก์',
    btn: 'bg-purple-500/15 text-purple-300 border-purple-500/25 hover:bg-purple-500/25',
    chip: 'background:rgba(168,85,247,.15);color:rgb(216,180,254);border:1px solid rgba(168,85,247,.3)' },
  { key: 'shop',       label: 'ชื่อร้าน',
    btn: 'bg-pink-500/15 text-pink-300 border-pink-500/25 hover:bg-pink-500/25',
    chip: 'background:rgba(236,72,153,.15);color:rgb(249,168,212);border:1px solid rgba(236,72,153,.3)' },
]

const SAMPLE = {
  name: 'กระเป๋าหนัง PU Classic สีดำ',
  price: '299',
  commission: '8',
  link: 'https://s.shopee.co.th/3AeXample',
  shop: 'ร้านของฉัน',
}

const CHIP_BASE = 'border-radius:6px;padding:1px 8px;font-size:12px;font-weight:500;display:inline-block;margin:0 2px;white-space:nowrap;line-height:1.8;'

function tmplToHtml(str) {
  if (!str) return ''
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    const v = VARS.find(v => v.key === key)
    if (!v) return `{${key}}`
    return `<span contenteditable="false" data-var="${key}" style="${v.chip};${CHIP_BASE}">${v.label}</span>`
  })
}

function htmlToTmpl(el) {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent
    else if (node.dataset?.var) out += `{${node.dataset.var}}`
    else out += node.textContent
  }
  return out
}

function previewTmpl(tmpl) {
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? `{${k}}`)
}

function TemplateEditor({ value, onChange, onRemove }) {
  const ref  = useRef(null)
  const init = useRef(false)

  useEffect(() => {
    if (ref.current && !init.current) {
      ref.current.innerHTML = tmplToHtml(value || '')
      init.current = true
    }
  }, [])

  const insertVar = (key) => {
    const el = ref.current
    if (!el) return
    el.focus()
    const v = VARS.find(v => v.key === key)

    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.var = key
    chip.style.cssText = `${v.chip};${CHIP_BASE}`
    chip.textContent = v.label

    const sel = window.getSelection()
    let range
    if (sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0)
      range.deleteContents()
    } else {
      range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
    }
    range.insertNode(chip)

    const after = document.createRange()
    after.setStartAfter(chip)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)

    onChange(htmlToTmpl(el))
  }

  return (
    <div className="rounded-xl border border-border bg-secondary overflow-hidden">
      {/* Variable chip bar */}
      <div className="flex items-center gap-1.5 flex-wrap px-3 pt-3 pb-2 border-b border-border/50">
        <span className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase mr-1">แทรก</span>
        {VARS.map(v => (
          <button key={v.key}
            onMouseDown={e => { e.preventDefault(); insertVar(v.key) }}
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium border transition-all ${v.btn}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex items-start gap-2 p-3">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange(htmlToTmpl(ref.current))}
          className="flex-1 min-h-[44px] rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 leading-7 cursor-text"
        />
        {onRemove && (
          <button onClick={onRemove}
            className="mt-1.5 p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all shrink-0">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export function CaptionBuilder({ templates = [''], onChange }) {
  const list = templates.length ? templates : ['']

  const update = (i, val) => { const n = [...list]; n[i] = val; onChange(n) }
  const remove = (i) => onChange(list.filter((_, j) => j !== i))
  const add    = () => onChange([...list, ''])

  return (
    <div className="flex flex-col gap-3">
      {list.map((tmpl, i) => (
        <div key={i}>
          {list.length > 1 && (
            <p className="text-[11px] text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
              สูตรที่ {i + 1}
              <span className="opacity-50">— ระบบสุ่มใช้แต่ละครั้ง</span>
            </p>
          )}
          <TemplateEditor
            value={tmpl}
            onChange={val => update(i, val)}
            onRemove={list.length > 1 ? () => remove(i) : null}
          />
        </div>
      ))}

      <button onClick={add}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-accent/40 text-sm transition-all">
        <Plus size={14} /> เพิ่มสูตร (ระบบสุ่มหมุนเวียน)
      </button>

      {list.some(t => t?.trim()) && (
        <div className="rounded-xl bg-secondary border border-border/50 p-4">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-2.5">ตัวอย่างผลลัพธ์</p>
          <div className="flex flex-col gap-2">
            {list.filter(t => t?.trim()).map((t, i) => (
              <p key={i} className="text-sm text-foreground leading-relaxed break-all">{previewTmpl(t)}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
