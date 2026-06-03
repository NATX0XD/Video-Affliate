'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../layout'
import { api }    from '@/lib/api'
import { VideoProfileModal } from '@/components/products/VideoProfileModal'
import {
  Package, Upload, Trash2, Send, CheckSquare, Square,
  Search, FileJson, Image as ImageIcon, TrendingUp, Percent, X,
  Sparkles, Rocket
} from 'lucide-react'

const STORE_KEY = 'imported_products'

// Pull a renderable image src from a scraped product
function imgSrc(p) {
  const b64 = p.images_b64?.find(s => s?.startsWith('data:'))
  if (b64) return b64
  return p.images?.find(s => s?.startsWith('http')) || ''
}

function ProductThumb({ p }) {
  const [failed, setFailed] = useState(false)
  const src = imgSrc(p)
  if (!src || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white/[0.02]">
        <ImageIcon size={22} className="text-slate-700" />
      </div>
    )
  }
  return (
    <img src={src} alt={p.basic_info?.name || ''} referrerPolicy="no-referrer"
         onError={() => setFailed(true)}
         className="w-full h-full object-cover" />
  )
}

export default function ProductsPage() {
  const { patch } = useApp()
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [query, setQuery]       = useState('')
  const [drag, setDrag]         = useState(false)
  const [toast, setToast]       = useState('')
  const fileRef = useRef(null)

  // Stable unique id per imported product (independent of product_id collisions)
  const newUid = () =>
    (globalThis.crypto?.randomUUID?.() ?? `u${Date.now()}${Math.random().toString(36).slice(2)}`)
  const uid = (p) => p._uid

  // Persist across navigation
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
      if (Array.isArray(saved)) {
        // backfill _uid for older saved data
        setProducts(saved.map(p => p._uid ? p : { ...p, _uid: newUid() }))
      }
    } catch {}
  }, [])
  const persist = (list) => {
    setProducts(list)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)) } catch {}
  }

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── Import JSON ──
  const ingest = useCallback((arr, srcName) => {
    if (!Array.isArray(arr)) arr = [arr]
    const valid = arr.filter(p => p && (p.basic_info?.name || p.product_id))
    if (!valid.length) { flash('ไม่พบสินค้าในไฟล์'); return }
    // logical de-dup by product_id (or name) against what's already imported
    const seen = new Set(products.map(p => p.product_id || p.basic_info?.name))
    const fresh = valid
      .filter(p => {
        const k = p.product_id || p.basic_info?.name
        if (seen.has(k)) return false
        seen.add(k)        // also dedup within the same file
        return true
      })
      .map(p => ({ ...p, _uid: newUid() }))
    persist([...products, ...fresh])
    flash(`นำเข้า ${fresh.length} สินค้า${srcName ? ` จาก ${srcName}` : ''} (ข้ามซ้ำ ${valid.length - fresh.length})`)
  }, [products])

  const readFiles = (files) => {
    [...files].forEach(f => {
      const r = new FileReader()
      r.onload = e => {
        try { ingest(JSON.parse(e.target.result), f.name) }
        catch { flash(`อ่าน ${f.name} ไม่ได้ (ไม่ใช่ JSON)`) }
      }
      r.readAsText(f)
    })
  }

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    if (e.dataTransfer.files?.length) readFiles(e.dataTransfer.files)
  }

  // ── Selection ──
  const toggle = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const filtered = products.filter(p =>
    !query || (p.basic_info?.name || '').toLowerCase().includes(query.toLowerCase()))
  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(uid(p)))
  const toggleAll = () => {
    setSelected(s => {
      const n = new Set(s)
      const keys = filtered.map(uid)
      if (allSelected) keys.forEach(k => n.delete(k))
      else keys.forEach(k => n.add(k))
      return n
    })
  }

  const remove = (id) => {
    persist(products.filter(p => uid(p) !== id))
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
  }
  const clearAll = () => { persist([]); setSelected(new Set()) }

  // strip internal field before sending to backend
  const clean = (p) => { const { _uid, ...rest } = p; return rest }
  const targets = () => {
    const chosen = products.filter(p => selected.has(uid(p)))
    return (chosen.length ? chosen : filtered).map(clean)
  }

  // ── Generate clips (AI, no posting) — opens profile modal first ──
  const [genning, setGenning] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const openProfile = () => { if (targets().length) setShowProfile(true) }
  const genClips = async (profile) => {
    setShowProfile(false)
    const toSend = targets()
    if (!toSend.length) return
    setGenning(true)
    try {
      await api.genStart(toSend, profile)
      flash(`เริ่มสร้าง ${toSend.length} คลิป (${profile.duration}s · ${profile.style}) — ดูที่ Clips`)
      setSelected(new Set())
    } catch {
      flash('สั่งไม่สำเร็จ — backend ทำงานอยู่ไหม?')
    }
    setGenning(false)
  }

  // ── Send to Auto Pilot (gen + post) ──
  const [sending, setSending] = useState(false)
  const sendToQueue = async () => {
    const toSend = targets()
    if (!toSend.length) return
    setSending(true)
    try {
      await api.generate(toSend)
      flash(`ส่ง ${toSend.length} สินค้าเข้า Auto Pilot (สร้าง+โพสต์)`)
      setSelected(new Set())
    } catch {
      flash('ส่งไม่สำเร็จ — backend ทำงานอยู่ไหม?')
    }
    setSending(false)
  }

  // ── Send to Google Flow queue (extension สร้างวิดีโอในเบราว์เซอร์) ──
  const [flowing, setFlowing] = useState(false)
  const sendToFlow = async () => {
    const toSend = targets()
    if (!toSend.length) return
    setFlowing(true)
    try {
      await api.flowEnqueue(toSend)
      flash(`ส่ง ${toSend.length} สินค้าเข้าคิว Flow — ไปกดปุ่มเขียว "คิว desktop" ในหน้า Flow`)
      setSelected(new Set())
    } catch {
      flash('ส่งไม่สำเร็จ — backend ทำงานอยู่ไหม?')
    }
    setFlowing(false)
  }

  const selCount = selected.size

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.05] shrink-0 flex-wrap"
           style={{ background: '#0a0a16' }}>
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
          <Upload size={14} strokeWidth={2.5} /> นำเข้า JSON
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden
               onChange={e => { readFiles(e.target.files); e.target.value = '' }} />

        {products.length > 0 && (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาสินค้า…"
                  className="w-full bg-white/[0.04] border border-white/[0.08] text-white text-sm pl-8 pr-3 py-2 rounded-xl outline-none focus:border-violet-500/60 placeholder:text-slate-700" />
              </div>
            </div>

            <button onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all">
              {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              {allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>

            <button onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-rose-500/10 border border-white/[0.06] transition-all">
              <Trash2 size={12} /> ล้าง
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={sendToQueue} disabled={sending || genning || flowing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-all disabled:opacity-50"
                title="สร้างวิดีโอแล้วโพสต์ขึ้น Shopee อัตโนมัติ">
                <Rocket size={13} />
                {sending ? 'กำลังส่ง…' : 'Auto Pilot'}
              </button>
              <button onClick={sendToFlow} disabled={flowing || sending || genning}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}
                title="ส่งเข้าคิว Google Flow — สร้างวิดีโอด้วย extension ในเบราว์เซอร์">
                <Sparkles size={13} />
                {flowing ? 'กำลังส่ง…' : selCount ? `Flow ${selCount}` : 'Flow'}
              </button>
              <button onClick={openProfile} disabled={genning || sending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}
                title="สร้างคลิปด้วย AI (ไม่โพสต์)">
                <Sparkles size={13} />
                {genning ? 'กำลังสั่ง…' : selCount ? `สร้างคลิป ${selCount}` : `สร้างคลิป (${filtered.length})`}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg shadow-violet-900/40">
          {toast}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-6"
           onDragOver={e => { e.preventDefault(); setDrag(true) }}
           onDragLeave={() => setDrag(false)}
           onDrop={onDrop}>

        {products.length === 0 ? (
          <div className={`h-full min-h-[400px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all
            ${drag ? 'border-violet-500 bg-violet-500/5' : 'border-white/[0.08]'}`}>
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <FileJson size={28} className="text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold mb-1">ลากไฟล์ JSON มาวาง หรือกด "นำเข้า JSON"</p>
              <p className="text-slate-600 text-sm">ไฟล์สินค้าที่ export จาก Chrome Extension (extracomm_*.json)</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {filtered.map((p) => {
              const id = uid(p)
              const sel = selected.has(id)
              const name = p.basic_info?.name || 'ไม่มีชื่อ'
              const price = p.basic_info?.price
              const comm = p.commission?.rate
              const sold = p.basic_info?.sold_count
              return (
                <div key={id} onClick={() => toggle(id)}
                  className={`group relative rounded-2xl overflow-hidden border cursor-pointer transition-all
                    ${sel ? 'border-violet-500 ring-1 ring-violet-500/50' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
                  style={{ background: '#111120' }}>

                  {/* Checkbox */}
                  <div className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all
                    ${sel ? 'bg-violet-500' : 'bg-black/50 border border-white/20 opacity-0 group-hover:opacity-100'}`}>
                    {sel && <CheckSquare size={12} className="text-white" />}
                  </div>

                  {/* Remove */}
                  <button onClick={e => { e.stopPropagation(); remove(id) }}
                    className="absolute top-2 right-2 z-10 w-5 h-5 rounded-md bg-black/50 hover:bg-rose-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <X size={11} className="text-white" />
                  </button>

                  {/* Image */}
                  <div className="aspect-square bg-black">
                    <ProductThumb p={p} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-white text-xs font-medium line-clamp-2 leading-snug min-h-[2rem]">{name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {price != null && (
                        <span className="text-emerald-400 text-sm font-bold tabular-nums">
                          ฿{Number(price).toLocaleString()}
                        </span>
                      )}
                      {comm != null && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-semibold ml-auto">
                          <Percent size={9} />{comm}
                        </span>
                      )}
                    </div>
                    {sold && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-600 mt-1">
                        <TrendingUp size={9} /> ขาย {sold}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer count */}
      {products.length > 0 && (
        <div className="px-6 py-2 border-t border-white/[0.05] shrink-0 flex items-center gap-3 text-[11px] text-slate-600"
             style={{ background: '#0a0a16' }}>
          <Package size={12} />
          <span>{filtered.length} สินค้า{query ? ` (จาก ${products.length})` : ''}</span>
          {selCount > 0 && <span className="text-violet-400">· เลือก {selCount}</span>}
          <span className="ml-auto">รูปจาก images_b64 / images URL</span>
        </div>
      )}

      {showProfile && (
        <VideoProfileModal
          count={targets().length}
          onConfirm={genClips}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  )
}
