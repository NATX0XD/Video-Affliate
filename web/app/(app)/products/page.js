'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../layout'
import { api }    from '@/lib/api'
import { VideoProfileModal } from '@/components/products/VideoProfileModal'
import {
  Package, Upload, Trash2, CheckSquare, Square,
  Search, FileJson, Image as ImageIcon, TrendingUp, Percent, X,
  Sparkles, Rocket
} from 'lucide-react'

const STORE_KEY = 'imported_products'

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
      <div className="w-full h-full flex items-center justify-center bg-elevated">
        <ImageIcon size={22} className="text-ink-mute" />
      </div>
    )
  }
  return (
    <img src={src} alt={p.basic_info?.name || ''} referrerPolicy="no-referrer"
         onError={() => setFailed(true)} className="w-full h-full object-cover" />
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

  const newUid = () =>
    (globalThis.crypto?.randomUUID?.() ?? `u${Date.now()}${Math.random().toString(36).slice(2)}`)
  const uid = (p) => p._uid

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
      if (Array.isArray(saved)) setProducts(saved.map(p => p._uid ? p : { ...p, _uid: newUid() }))
    } catch {}
  }, [])
  const persist = (list) => {
    setProducts(list)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)) } catch {}
  }
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const ingest = useCallback((arr, srcName) => {
    if (!Array.isArray(arr)) arr = [arr]
    const valid = arr.filter(p => p && (p.basic_info?.name || p.product_id))
    if (!valid.length) { flash('ไม่พบสินค้าในไฟล์'); return }
    const seen = new Set(products.map(p => p.product_id || p.basic_info?.name))
    const fresh = valid.filter(p => {
        const k = p.product_id || p.basic_info?.name
        if (seen.has(k)) return false
        seen.add(k); return true
      }).map(p => ({ ...p, _uid: newUid() }))
    persist([...products, ...fresh])
    flash(`นำเข้า ${fresh.length} สินค้า${srcName ? ` จาก ${srcName}` : ''} (ข้ามซ้ำ ${valid.length - fresh.length})`)
  }, [products])

  const readFiles = (files) => {
    [...files].forEach(f => {
      const r = new FileReader()
      r.onload = e => { try { ingest(JSON.parse(e.target.result), f.name) } catch { flash(`อ่าน ${f.name} ไม่ได้ (ไม่ใช่ JSON)`) } }
      r.readAsText(f)
    })
  }
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) readFiles(e.dataTransfer.files) }

  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const filtered = products.filter(p => !query || (p.basic_info?.name || '').toLowerCase().includes(query.toLowerCase()))
  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(uid(p)))
  const toggleAll = () => setSelected(s => {
    const n = new Set(s); const keys = filtered.map(uid)
    if (allSelected) keys.forEach(k => n.delete(k)); else keys.forEach(k => n.add(k))
    return n
  })
  const remove = (id) => { persist(products.filter(p => uid(p) !== id)); setSelected(s => { const n = new Set(s); n.delete(id); return n }) }
  const clearAll = () => { persist([]); setSelected(new Set()) }

  const clean = (p) => { const { _uid, ...rest } = p; return rest }
  const targets = () => {
    const chosen = products.filter(p => selected.has(uid(p)))
    return (chosen.length ? chosen : filtered).map(clean)
  }

  const [genning, setGenning] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const openProfile = () => { if (targets().length) setShowProfile(true) }
  const genClips = async (profile) => {
    setShowProfile(false)
    const toSend = targets(); if (!toSend.length) return
    setGenning(true)
    try { await api.genStart(toSend, profile); flash(`เริ่มสร้าง ${toSend.length} คลิป — ดูที่ คลังคลิป`); setSelected(new Set()) }
    catch { flash('สั่งไม่สำเร็จ — เปิด backend อยู่ไหม?') }
    setGenning(false)
  }

  const [sending, setSending] = useState(false)
  const sendToQueue = async () => {
    const toSend = targets(); if (!toSend.length) return
    setSending(true)
    try { await api.generate(toSend); flash(`ส่ง ${toSend.length} สินค้าเข้าออโต้ไพลอต`); setSelected(new Set()) }
    catch { flash('ส่งไม่สำเร็จ — เปิด backend อยู่ไหม?') }
    setSending(false)
  }

  const [flowing, setFlowing] = useState(false)
  const sendToFlow = async () => {
    const toSend = targets(); if (!toSend.length) return
    setFlowing(true)
    try { await api.flowEnqueue(toSend); flash(`ส่ง ${toSend.length} สินค้าเข้าคิว Flow`); setSelected(new Set()) }
    catch { flash('ส่งไม่สำเร็จ — เปิด backend อยู่ไหม?') }
    setFlowing(false)
  }

  const selCount = selected.size

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 lg:px-8 py-3.5 border-b border-line shrink-0 flex-wrap bg-surface">
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-soft transition-all active:scale-[.98]">
          <Upload size={14} strokeWidth={2.5} /> นำเข้า JSON
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden
               onChange={e => { readFiles(e.target.files); e.target.value = '' }} />

        {products.length > 0 && (
          <>
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาสินค้า…"
                className="w-full bg-elevated border border-line text-ink text-sm pl-9 pr-3 py-2 rounded-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 placeholder:text-ink-mute" />
            </div>

            <button onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs font-medium text-ink-dim hover:text-ink px-3 py-2 rounded-lg bg-elevated border border-line hover:border-accent transition-all">
              {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              {allSelected ? 'ยกเลิก' : 'เลือกทั้งหมด'}
            </button>
            <button onClick={clearAll}
              className="flex items-center gap-1.5 text-xs font-medium text-ink-dim hover:text-danger px-3 py-2 rounded-lg bg-elevated border border-line hover:border-danger/30 transition-all">
              <Trash2 size={12} /> ล้าง
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={sendToQueue} disabled={sending || genning || flowing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-ink-dim bg-elevated border border-line hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                title="สร้าง+โพสต์อัตโนมัติ">
                <Rocket size={13} /> {sending ? 'กำลังส่ง…' : 'ออโต้ไพลอต'}
              </button>
              <button onClick={sendToFlow} disabled={flowing || sending || genning}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-success hover:opacity-90 transition-all disabled:opacity-50"
                title="ส่งเข้าคิว Google Flow">
                <Sparkles size={13} /> {flowing ? 'กำลังส่ง…' : selCount ? `Flow ${selCount}` : 'Flow'}
              </button>
              <button onClick={openProfile} disabled={genning || sending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-soft transition-all active:scale-[.98] disabled:opacity-50"
                title="สร้างคลิปด้วย AI (ไม่โพสต์)">
                <Sparkles size={13} /> {genning ? 'กำลังสั่ง…' : selCount ? `สร้างคลิป ${selCount}` : `สร้างคลิป (${filtered.length})`}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-accent text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lift animate-fade-up">
          {toast}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 lg:p-8"
           onDragOver={e => { e.preventDefault(); setDrag(true) }}
           onDragLeave={() => setDrag(false)} onDrop={onDrop}>

        {products.length === 0 ? (
          <div className={`h-full min-h-[400px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all
            ${drag ? 'border-accent bg-accent-wash' : 'border-line bg-surface'}`}>
            <div className="w-16 h-16 rounded-2xl bg-accent-wash flex items-center justify-center">
              <FileJson size={28} className="text-accent" />
            </div>
            <div className="text-center">
              <p className="text-ink font-semibold mb-1">ลากไฟล์ JSON มาวาง หรือกด "นำเข้า JSON"</p>
              <p className="text-ink-dim text-sm">ไฟล์สินค้าที่ส่งออกจาก Chrome Extension</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
            {filtered.map((p) => {
              const id = uid(p); const sel = selected.has(id)
              const name = p.basic_info?.name || 'ไม่มีชื่อ'
              const price = p.basic_info?.price, comm = p.commission?.rate, sold = p.basic_info?.sold_count
              return (
                <div key={id} onClick={() => toggle(id)}
                  className={`group relative rounded-2xl overflow-hidden border cursor-pointer bg-surface shadow-card transition-all
                    ${sel ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:-translate-y-0.5'}`}>
                  <div className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all
                    ${sel ? 'bg-accent' : 'bg-black/50 border border-white/30 opacity-0 group-hover:opacity-100'}`}>
                    {sel && <CheckSquare size={12} className="text-white" />}
                  </div>
                  <button onClick={e => { e.stopPropagation(); remove(id) }}
                    className="absolute top-2 right-2 z-10 w-5 h-5 rounded-md bg-black/50 hover:bg-danger flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <X size={11} className="text-white" />
                  </button>
                  <div className="aspect-square bg-black"><ProductThumb p={p} /></div>
                  <div className="p-3">
                    <p className="text-ink text-xs font-medium line-clamp-2 leading-snug min-h-[2rem]">{name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {price != null && <span className="text-ink text-sm font-bold nums">฿{Number(price).toLocaleString()}</span>}
                      {comm != null && (
                        <span className="flex items-center gap-0.5 text-[10px] text-accent font-semibold ml-auto">
                          <Percent size={9} />{comm}
                        </span>
                      )}
                    </div>
                    {sold && <span className="flex items-center gap-1 text-[10px] text-ink-mute mt-1"><TrendingUp size={9} /> ขาย {sold}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {products.length > 0 && (
        <div className="px-5 lg:px-8 py-2.5 border-t border-line shrink-0 flex items-center gap-3 text-[11px] text-ink-mute bg-surface">
          <Package size={12} />
          <span>{filtered.length} สินค้า{query ? ` (จาก ${products.length})` : ''}</span>
          {selCount > 0 && <span className="text-accent font-medium">· เลือก {selCount}</span>}
        </div>
      )}

      {showProfile && (
        <VideoProfileModal count={targets().length} onConfirm={genClips} onClose={() => setShowProfile(false)} />
      )}
    </div>
  )
}
