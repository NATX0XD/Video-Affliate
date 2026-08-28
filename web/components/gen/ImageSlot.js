'use client'
// กล่องอัปรูปอ้างอิง 1 ช่อง (ฉากหลัง / โทนสี / หน้าคน) — ใช้ซ้ำได้ทุกหัวข้อ
import { useRef, useState } from 'react'
import { Upload, Trash2, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { downscale } from '@/lib/downscale'

export function ImageSlot({ title, hint, image, imageName, onPick, onClear, onError, max = 768, children }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const choose = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try { onPick(await downscale(f, max, 0.88), f.name) }
    catch { onError?.('อ่านรูปไม่สำเร็จ — ลองไฟล์ JPG/PNG อื่น') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden border border-line bg-elevated grid place-items-center shrink-0">
          {image
            ? <img src={image} alt="" className="w-full h-full object-cover" />
            : <ImagePlus size={18} className="text-ink-mute" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="t-section text-ink">{title}</p>
          <p className="t-cap mt-0.5 truncate">{image ? (imageName || 'รูปที่อัปไว้') : hint}</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={choose} className="hidden" />
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={13} /> {busy ? 'กำลังอ่านรูป…' : image ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
            </Button>
            {image && (
              <button type="button" onClick={onClear}
                className="t-cap text-danger hover:underline flex items-center gap-1">
                <Trash2 size={12} /> เอาออก
              </button>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
