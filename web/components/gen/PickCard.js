'use client'
// การ์ดเลือก 1 ตัวเลือก — ใช้ซ้ำทุกขั้น
// มีรูป (img/thumb) = การ์ดรูปใหญ่ · ไม่มีรูป = การ์ดข้อความ
import { Check, Trash2 } from 'lucide-react'

export function PickCard({ active, onClick, title, sub, img, thumb, onDelete, ratio = 'aspect-[4/3]' }) {
  const hasImage = !!(img || thumb)
  return (
    <div className="relative group">
      <button type="button" onClick={onClick}
        className={`w-full text-left rounded-xl border overflow-hidden transition-all cursor-pointer bg-surface
          ${active ? 'border-accent ring-2 ring-accent/30 shadow-card' : 'border-line hover:border-accent/50 hover:shadow-card'}`}>
        {hasImage && (
          <div className={`${ratio} w-full relative bg-elevated`} style={{ background: thumb || undefined }}>
            {img && <img src={img} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
            {active && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center shadow-xs">
                <Check size={12} className="text-white" strokeWidth={3} />
              </span>
            )}
          </div>
        )}
        <div className={`px-3 py-2.5 ${hasImage ? '' : 'flex items-start gap-2'}`}>
          <div className="min-w-0 flex-1">
            <p className={`t-section truncate ${active ? 'text-accent-ink' : 'text-ink'}`}>{title}</p>
            {sub && <p className="t-cap mt-0.5 leading-snug">{sub}</p>}
          </div>
          {!hasImage && active && <Check size={15} className="text-accent-ink shrink-0 mt-0.5" strokeWidth={3} />}
        </div>
      </button>

      {onDelete && (
        <button type="button" onClick={e => { e.stopPropagation(); onDelete(e) }} title="ลบ"
          className="absolute top-2 left-2 w-6 h-6 rounded-full bg-surface/90 border border-line text-ink-dim
                     hover:text-danger flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// แถวปุ่ม pill — ตัวเลือกสั้น ๆ ที่ไม่ต้องมีรูป
export function PillRow({ items, value, onPick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(it => (
        <button key={it.id} type="button" onClick={() => onPick(it.id)}
          className={`px-3.5 py-2 rounded-lg t-body border transition-all cursor-pointer
            ${value === it.id
              ? 'border-accent bg-accent-wash text-accent-ink font-semibold'
              : 'border-line bg-surface text-ink-dim hover:text-ink hover:border-accent/40'}`}>
          {it.name}
        </button>
      ))}
    </div>
  )
}
