'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Package, RefreshCw, Search, ExternalLink, Sparkles, Check, CheckSquare, Square,
  ShoppingCart, Loader2, LayoutGrid, Rows3, Trash2, AlertTriangle, Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import Link from 'next/link'
import { productUid, hasCart, productName, productPrice, productImg, commissionRate } from '@/lib/gen-options'

// ลิงก์ไปหน้าคลังคลิปพร้อมข้อมูลสินค้า → กล่อง "เพิ่มคลิปเข้าคลัง" จะกรอกให้เอง
const uploadHref = (p) => {
  const q = new URLSearchParams({ upload: '1' })
  const name = productName(p); if (name) q.set('name', name)
  const price = productPrice(p); if (price) q.set('price', String(price))
  const rate = commissionRate(p); if (rate != null) q.set('commission', String(rate))
  const link = p.cart_link || p.links?.affiliate_link || ''; if (link) q.set('link', link)
  return `/library?${q.toString()}`
}

const AFFILIATE_URL = 'https://affiliate.shopee.co.th/offer/product_offer'

// มุมมองคลังสินค้า — จำค่าที่ผู้ใช้เลือกไว้ข้ามการเปิดหน้าใหม่
const VIEW_KEY = 'products_view'
const VIEWS = [
  { id: 'grid',  label: 'การ์ด',  Icon: LayoutGrid },
  { id: 'table', label: 'ตาราง', Icon: Rows3 },
]

const STATUS_FILTERS = [
  { id: 'all',    label: 'ทั้งหมด' },
  { id: 'cart',   label: 'มีตะกร้า' },
  { id: 'nocart', label: 'ยังไม่มีตะกร้า' },
  { id: 'done',   label: 'สร้างคลิปแล้ว' },
]

const statusOf = p => {
  const s = p.video_status || p.status
  if (s === 'done' || s === 'generated' || s === 'posted' || p.posted_at || p.video_posted_at) return 'done'
  if (s === 'queued') return 'queued'
  return 'new'
}

function fmtPrice(v) {
  const n = Number(v)
  return isFinite(n) && n > 0 ? `฿${n.toLocaleString()}` : '—'
}

function ProductCard({ p, selected, onToggle, onDelete }) {
  const img = productImg(p)
  const cart = hasCart(p)
  const st = statusOf(p)
  const name = productName(p)
  const rate = commissionRate(p)
  return (
    <div role="button" tabIndex={0} aria-pressed={selected} onClick={onToggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={`group text-left rounded-xl border overflow-hidden bg-card transition-all cursor-pointer
        ${selected ? 'border-accent ring-2 ring-accent/40' : 'border-border hover:border-accent/40'}`}>
      <div className="aspect-square relative bg-secondary overflow-hidden">
        {img
          ? <img src={img} alt={name} loading="lazy"
              className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">
              <Package size={26} className="text-muted-foreground/40" />
            </div>}
        {/* select check */}
        <div className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center border transition-all
          ${selected ? 'bg-accent border-accent' : 'bg-black/50 border-white/40 group-hover:border-white'}`}>
          {selected && <Check size={14} className="text-white" strokeWidth={3} />}
        </div>
        {/* status badges */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {st === 'done'   && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/90 text-white">มีคลิปแล้ว</span>}
          {st === 'queued' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/90 text-white">ในคิว</span>}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cart ? 'bg-accent/90 text-white' : 'bg-black/60 text-white/70'}`}>
            {cart ? 'มีตะกร้า' : 'ไม่มีตะกร้า'}
          </span>
        </div>
        {/* ลบรายการเดียว — โผล่ตอนชี้เมาส์ กันกดโดนตอนเลือกสินค้า */}
        <button type="button" title="ลบสินค้านี้" aria-label="ลบสินค้านี้"
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center
            bg-black/60 text-white/80 opacity-100
            hover:bg-destructive hover:text-white transition-all cursor-pointer">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="p-2.5">
        <p className="text-foreground text-xs font-medium line-clamp-2 leading-snug min-h-[2rem]">
          {name || 'ไม่มีชื่อ'}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-accent font-bold text-sm">{fmtPrice(productPrice(p))}</span>
          {rate != null && <span className="text-[10px] text-muted-foreground">คอม {rate}%</span>}
        </div>
      </div>
    </div>
  )
}

function ProductRow({ p, selected, onToggle, onDelete }) {
  const img = productImg(p)
  const cart = hasCart(p)
  const st = statusOf(p)
  const name = productName(p)
  const rate = commissionRate(p)
  return (
    <tr onClick={onToggle}
      className={`border-t border-border cursor-pointer transition-colors
        ${selected ? 'bg-accent-wash' : 'hover:bg-secondary/60'}`}>
      <td className="px-3 py-2 w-9">
        <div className={`w-[18px] h-[18px] rounded flex items-center justify-center border transition-all
          ${selected ? 'bg-accent border-accent' : 'border-border'}`}>
          {selected && <Check size={12} className="text-white" strokeWidth={3} />}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
            {img
              ? <img src={img} alt={name} loading="lazy" className="w-full h-full object-cover" />
              : <Package size={14} className="text-muted-foreground/40" />}
          </div>
          <p className="text-foreground text-xs font-medium line-clamp-2 leading-snug">{name || 'ไม่มีชื่อ'}</p>
        </div>
      </td>
      <td className="px-3 py-2 text-accent font-bold text-xs whitespace-nowrap">{fmtPrice(productPrice(p))}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">{rate != null ? `${rate}%` : '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cart ? 'bg-accent-wash text-accent' : 'bg-secondary text-muted-foreground'}`}>
          {cart ? 'มีตะกร้า' : 'ไม่มีตะกร้า'}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {st === 'done'   && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success">มีคลิปแล้ว</span>}
        {st === 'queued' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">ในคิว</span>}
        {st === 'new'    && <span className="text-[10px] text-muted-foreground">ยังไม่สร้าง</span>}
      </td>
      <td className="px-3 py-2 w-20 text-right whitespace-nowrap">
        {/* ทางออกตอนสร้างคลิปได้แต่โหลดไฟล์ลงเครื่องไม่สำเร็จ — เซฟคลิปจาก Flow เองแล้วเอาเข้าระบบ
            ข้อมูลสินค้าติดไปกับลิงก์ จะได้ไม่ต้องพิมพ์ชื่อ/ราคา/ลิงก์ใหม่ */}
        <Link href={uploadHref(p)} onClick={e => e.stopPropagation()}
          title="มีไฟล์คลิปอยู่แล้ว — เพิ่มเข้าคลังเพื่อรอโพสต์"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent-wash transition-colors cursor-pointer inline-block align-middle">
          <Upload size={14} />
        </Link>
        <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
          title="ลบสินค้านี้" aria-label="ลบสินค้านี้"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer align-middle">
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  // ค่าเริ่มต้นพาคนไปดูของที่ยังไม่ได้ทำก่อน
  const [filter, setFilter] = useState('new')
  const [cat, setCat] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [view, setView] = useState('grid')
  const [toDelete, setToDelete] = useState(null)   // สินค้าที่รอยืนยันลบ (array) · null = ไม่มีโมดอล
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()

  // จำมุมมองที่เลือกไว้ (อ่านหลัง mount — กัน hydration ไม่ตรงตอน export เป็นไฟล์นิ่ง)
  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === 'grid' || v === 'table') setView(v) } catch {}
  }, [])
  useEffect(() => {
    const f = searchParams.get('filter')
    if (['new', 'done', 'all', 'cart', 'nocart'].includes(f)) setFilter(f)
  }, [searchParams])
  const pickView = v => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch {} }

  const load = useCallback(async (manual) => {
    if (manual) setRefreshing(true)
    try {
      const d = await api.products()
      setProducts(d.products || [])
    } catch { /* toast auto */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 6000); return () => clearInterval(id) }, [load])

  const cats = useMemo(() => {
    const s = new Set()
    products.forEach(p => p.category && s.add(p.category))
    return ['all', ...Array.from(s)]
  }, [products])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(p => {
      if (q && !productName(p).toLowerCase().includes(q)) return false
      if (cat !== 'all' && p.category !== cat) return false
      if (filter === 'cart'   && !hasCart(p)) return false
      if (filter === 'nocart' && hasCart(p))  return false
      if (filter === 'done'   && statusOf(p) !== 'done') return false
      if (filter === 'new'    && statusOf(p) === 'done') return false
      return true
    })
  }, [products, query, cat, filter])

  const notCreated = visible.filter(p => statusOf(p) !== 'done')
  const created = visible.filter(p => statusOf(p) === 'done')

  const toggle = uid => setSelected(prev => {
    const n = new Set(prev)
    n.has(uid) ? n.delete(uid) : n.add(uid)
    return n
  })
  const selectAllVisible = () => setSelected(new Set(visible.map(productUid)))
  const clearSel = () => setSelected(new Set())

  const chosen = useMemo(
    () => products.filter(p => selected.has(productUid(p))).map(p => ({ ...p, _uid: productUid(p) })),
    [products, selected])

  // ส่ง id สินค้าที่เลือกไปหน้าสร้างคลิป (6 ขั้น)
  const openCreate = () => router.push(`/products/create?ids=${chosen.map(productUid).join(',')}`)

  // ── ลบสินค้า: กดแล้วเปิดโมดอลยืนยันเสมอ ไม่ลบทันที ──
  const askDelete = items => setToDelete(items.filter(Boolean))
  const doDelete = async () => {
    const items = toDelete || []
    const ids = items.map(p => p.id).filter(id => id != null)
    if (ids.length === 0) { setToDelete(null); return }
    setDeleting(true)
    try {
      const d = await api.deleteProducts(ids)
      if (d?.ok === false) throw new Error(d.error || 'ลบไม่สำเร็จ')
      const gone = new Set(items.map(productUid))
      setProducts(prev => prev.filter(p => !gone.has(productUid(p))))
      setSelected(prev => {
        const n = new Set(prev)
        gone.forEach(uid => n.delete(uid))
        return n
      })
      setToDelete(null)
      toast.success(`ลบสินค้า ${d?.deleted ?? ids.length} รายการแล้ว`)
      load()
    } catch (e) {
      toast.error(e?.message || 'ลบสินค้าไม่สำเร็จ')
    } finally { setDeleting(false) }
  }

  const Grid = ({ items }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map(p => {
        const uid = productUid(p)
        return <ProductCard key={uid} p={p} selected={selected.has(uid)}
          onToggle={() => toggle(uid)} onDelete={() => askDelete([p])} />
      })}
    </div>
  )

  const Section = ({ title, items }) => items.length === 0 ? null : (
    <div>
      <p className="text-muted-foreground text-xs font-bold mb-2.5 flex items-center gap-1.5">
        {title} <span className="nums">({items.length})</span>
      </p>
      <Grid items={items} />
    </div>
  )

  const TableSection = ({ title, items }) => items.length === 0 ? null : (
    <section className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-bold flex items-center gap-1.5">
        {title} <span className="nums">({items.length})</span>
      </p>
      <Table items={items} />
    </section>
  )

  const allVisibleSelected = visible.length > 0 && visible.every(p => selected.has(productUid(p)))

  const Table = ({ items }) => (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-secondary/60 text-muted-foreground text-[11px] font-bold">
              <th className="px-3 py-2 w-9">
                <button type="button" aria-label="เลือกทั้งหมดที่เห็น"
                  onClick={() => allVisibleSelected ? clearSel() : selectAllVisible()}
                  className={`w-[18px] h-[18px] rounded flex items-center justify-center border transition-all cursor-pointer
                    ${allVisibleSelected ? 'bg-accent border-accent' : 'border-border hover:border-accent'}`}>
                  {allVisibleSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                </button>
              </th>
              <th className="px-3 py-2">สินค้า</th>
              <th className="px-3 py-2">ราคา</th>
              <th className="px-3 py-2">คอม</th>
              <th className="px-3 py-2">ตะกร้า</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {items.map(p => {
              const uid = productUid(p)
              return <ProductRow key={uid} p={p} selected={selected.has(uid)}
                onToggle={() => toggle(uid)} onDelete={() => askDelete([p])} />
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">
      {/* header */}
      <motion.div className="flex items-start justify-between gap-4 flex-wrap"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}>
        <div>
          <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">คลังสินค้า</h2>
          <p className="text-muted-foreground text-sm mt-2">
            เลือกสินค้าแล้วสร้างคลิปได้เลย · ทั้งหมด {products.length} ชิ้น
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* สลับมุมมอง: การ์ด (เดิม) / ตาราง */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-secondary">
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => pickView(v.id)} title={`มุมมอง${v.label}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer
                  ${view === v.id ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}`}>
                <v.Icon size={13} /> {v.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={AFFILIATE_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> เปิดหน้า Affiliate
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> รีเฟรช
          </Button>
        </div>
      </motion.div>

      {/* controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อสินค้า…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 placeholder:text-muted-foreground" />
          </div>
          {[{ id: 'new', label: `ยังไม่ได้สร้าง (${products.filter(p => statusOf(p) !== 'done').length})` },
            { id: 'done', label: `สร้างคลิปแล้ว (${products.filter(p => statusOf(p) === 'done').length})` },
            ...STATUS_FILTERS.filter(f => f.id !== 'done')].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                ${filter === f.id ? 'bg-accent-wash text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {cats.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer
                  ${cat === c ? 'bg-accent text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                {c === 'all' ? 'ทุกหมวด' : c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* body */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-accent" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card shadow-card p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-muted-foreground" />
          </div>
          <p className="text-foreground font-bold">ยังไม่มีสินค้าในคลัง</p>
          <p className="text-muted-foreground text-sm mt-1.5 max-w-sm mx-auto">
            เปิดหน้า Shopee Affiliate แล้วใช้หน้าต่างลอยของส่วนขยาย "ดูดสินค้า" — สินค้าจะไหลมาที่นี่
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <a href={AFFILIATE_URL} target="_blank" rel="noreferrer"><ExternalLink size={13} /> เปิดหน้า Affiliate</a>
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-16">ไม่พบสินค้าตามที่กรอง</p>
      ) : (
        <div className="flex flex-col gap-6 pb-24">
          {view === 'table' ? (
            <div className="flex flex-col gap-6">
              <TableSection title="ยังไม่ได้สร้าง" items={notCreated} />
              <TableSection title="สร้างคลิปแล้ว" items={created} />
            </div>
          ) : (
            <>
              <Section title={`ยังไม่ได้สร้าง · มีตะกร้า (${notCreated.filter(hasCart).length})`} items={notCreated.filter(hasCart)} />
              <Section title={`ยังไม่ได้สร้าง · ยังไม่มีตะกร้า (${notCreated.filter(p => !hasCart(p)).length})`} items={notCreated.filter(p => !hasCart(p))} />
              <Section title="สร้างคลิปแล้ว" items={created} />
            </>
          )}
        </div>
      )}

      {/* selection action bar (sticky bottom) */}
      {selected.size > 0 && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card shadow-lift">
          <span className="text-sm text-foreground font-semibold">เลือก {selected.size} ชิ้น</span>
          <button onClick={selectAllVisible} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <CheckSquare size={13} /> เลือกทั้งหมด
          </button>
          <button onClick={clearSel} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Square size={13} /> ล้าง
          </button>
          <Button size="sm" variant="outline" onClick={() => askDelete(chosen)}
            className="text-destructive border-destructive/40 hover:bg-destructive/10">
            <Trash2 size={14} /> ลบที่เลือก
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Sparkles size={14} /> สร้างคลิปจากที่เลือก
          </Button>
        </motion.div>
      )}

      {/* ยืนยันก่อนลบ — ลบแล้วเอาคืนไม่ได้ ต้องดูดสินค้าใหม่ */}
      <Dialog
        open={!!toDelete}
        onClose={() => { if (!deleting) setToDelete(null) }}
        icon={AlertTriangle}
        title={`ลบสินค้า ${toDelete?.length || 0} รายการ?`}
        description="ลบออกจากคลังสินค้าถาวร — เอากลับคืนไม่ได้ ต้องดูดจากหน้า Affiliate ใหม่ · คลิปที่สร้างไปแล้วยังอยู่ครบ"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setToDelete(null)} disabled={deleting}>
              ยกเลิก
            </Button>
            <Button variant="destructive" size="sm" onClick={doDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deleting ? 'กำลังลบ…' : `ลบ ${toDelete?.length || 0} รายการ`}
            </Button>
          </>
        }>
        <ul className="flex flex-col gap-1.5 text-sm">
          {(toDelete || []).slice(0, 8).map(p => (
            <li key={productUid(p)} className="flex items-center gap-2 text-foreground">
              <Package size={13} className="text-muted-foreground shrink-0" />
              <span className="truncate">{productName(p) || 'ไม่มีชื่อ'}</span>
            </li>
          ))}
          {(toDelete?.length || 0) > 8 && (
            <li className="text-muted-foreground text-xs">…และอีก {toDelete.length - 8} รายการ</li>
          )}
        </ul>
      </Dialog>

    </div>
  )
}
