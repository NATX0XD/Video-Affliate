'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import {
  Package, RefreshCw, Search, ExternalLink, Sparkles, Check, CheckSquare, Square,
  ShoppingCart, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { GenWizard } from '@/components/products/GenWizard'
import { productUid, hasCart, productName, productPrice, productImg, commissionRate } from '@/lib/gen-options'

const AFFILIATE_URL = 'https://affiliate.shopee.co.th/offer/product_offer'

const STATUS_FILTERS = [
  { id: 'all',    label: 'ทั้งหมด' },
  { id: 'cart',   label: 'มีตะกร้า' },
  { id: 'nocart', label: 'ยังไม่มีตะกร้า' },
  { id: 'done',   label: 'สร้างคลิปแล้ว' },
]

const statusOf = p => {
  const s = p.status || p.video_status
  if (s === 'done' || p.posted_at) return 'done'
  if (s === 'queued') return 'queued'
  return 'new'
}

function fmtPrice(v) {
  const n = Number(v)
  return isFinite(n) && n > 0 ? `฿${n.toLocaleString()}` : '—'
}

function ProductCard({ p, selected, onToggle }) {
  const img = productImg(p)
  const cart = hasCart(p)
  const st = statusOf(p)
  const name = productName(p)
  const rate = commissionRate(p)
  return (
    <button type="button" onClick={onToggle}
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
    </button>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [cat, setCat] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [wizard, setWizard] = useState(false)

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
      return true
    })
  }, [products, query, cat, filter])

  const withCart = visible.filter(hasCart)
  const noCart   = visible.filter(p => !hasCart(p))

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

  const Section = ({ title, items }) => items.length === 0 ? null : (
    <div>
      <p className="text-muted-foreground text-xs font-bold mb-2.5 flex items-center gap-1.5">
        {title} <span className="nums">({items.length})</span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.map(p => {
          const uid = productUid(p)
          return <ProductCard key={uid} p={p} selected={selected.has(uid)} onToggle={() => toggle(uid)} />
        })}
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
          {STATUS_FILTERS.map(f => (
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
          <Section title="พร้อมโพสต์ · มีตะกร้า" items={withCart} />
          <Section title="ยังไม่มีตะกร้า" items={noCart} />
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
          <Button size="sm" onClick={() => setWizard(true)}>
            <Sparkles size={14} /> สร้างคลิปจากที่เลือก
          </Button>
        </motion.div>
      )}

      {wizard && (
        <GenWizard products={chosen} onClose={() => setWizard(false)}
          onDone={() => { setWizard(false); clearSel(); load(true) }} />
      )}
    </div>
  )
}
