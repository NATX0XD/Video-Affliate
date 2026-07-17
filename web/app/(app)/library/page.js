'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useApp } from '../layout'
import { api }    from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { LazyVideo } from '@/components/ui/LazyVideo'
import {
  Film, RefreshCw, Play, X, Clock, CheckCircle2, AlertCircle,
  Download, Layers, Trash2, Unlink, AlertTriangle, Plus, Upload, Loader2, Pencil, Coins,
  Image as ImageIcon,
} from 'lucide-react'

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit:   { opacity: 0, scale: 0.95, transition: { duration: 0.18 } },
}
const gridVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
}

const FOLDER = {
  pending: { label: 'พร้อมโพสต์', icon: Clock,        cls: 'text-accent  bg-accent-wash border-accent/20' },
  done:    { label: 'โพสต์แล้ว',  icon: CheckCircle2, cls: 'text-success bg-success/10  border-success/20' },
  error:   { label: 'ผิดพลาด',   icon: AlertCircle,  cls: 'text-danger  bg-danger/10   border-danger/20'  },
}

const FILTERS = [
  { key: 'all',     label: 'ทั้งหมด',    icon: Layers },
  { key: 'pending', label: 'พร้อมโพสต์', icon: Clock },
  { key: 'done',    label: 'โพสต์แล้ว',  icon: CheckCircle2 },
  { key: 'error',   label: 'ผิดพลาด',   icon: AlertCircle },
]

const fmtSize = b => b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : b > 1e3 ? `${(b/1e3).toFixed(0)} KB` : `${b} B`
const fmtTime = t => new Date(t*1000).toLocaleString('th-TH', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })

export default function LibraryPage() {
  const { state } = useApp()
  const [videos, setVideos]   = useState([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [form, setForm]       = useState(null)   // 'new' | clip object | null
  const [delClip, setDelClip] = useState(null)   // คลิปที่จะลบ (รายตัว)
  const [filter, setFilter]   = useState('all')
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const removeClip = async () => {
    if (!delClip) return
    setDeleting(true)
    try { await api.deleteJob(delClip.id) } catch {}
    setDeleting(false); setDelClip(null); load()
  }

  const count = (k) => k === 'all' ? videos.length : videos.filter(v => v.folder === k).length
  const noLink = videos.filter(v => !(v.link || '').trim() && v.name !== 'test_video.mp4')
  const shown = filter === 'all' ? videos : videos.filter(v => v.folder === filter)

  const delNoLink = async () => {
    setDeleting(true)
    try { await api.deleteNoLink() } catch {}
    setDeleting(false); setConfirmDel(false); load()
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.listVideos(); setVideos(r.videos || []) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const last = state.logs[state.logs.length - 1]
    if (last && /\[GEN\] เสร็จ|\[UPLOAD\]|\[FLOW\] รับวิดีโอ/.test(last.msg)) load()
  }, [state.logs, load])

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 lg:px-8 py-3.5 border-b border-border shrink-0 flex-wrap bg-card">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-wash"><Film size={15} className="text-accent" /></div>
          <span className="text-foreground font-bold text-[15px]">คลังคลิป</span>
          <span className="text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full nums">{videos.length}</span>
        </div>

        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </Button>

        {noLink.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setConfirmDel(true)}
            className="border-danger/30 text-danger hover:bg-danger/10">
            <Unlink size={12} /> ลบไม่มีลิงก์ ({noLink.length})
          </Button>
        )}

        <div className="ml-auto">
          <Button onClick={() => setForm('new')}>
            <Plus size={14} /> เพิ่มคลิป
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 px-5 lg:px-8 py-2.5 border-b border-border shrink-0 overflow-x-auto bg-card/50">
        {FILTERS.map(f => {
          const active = filter === f.key
          const n = count(f.key)
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                ${active ? 'bg-accent-wash text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              <f.icon size={13} /> {f.label}
              <span className={`nums ${active ? 'text-accent' : 'text-muted-foreground'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-5 lg:p-8">
        <AnimatePresence mode="wait">
          {shown.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="h-full min-h-[400px] flex flex-col items-center justify-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
                <Film size={26} className="text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-foreground font-semibold mb-1">{videos.length === 0 ? 'ยังไม่มีคลิป' : 'ไม่มีคลิปในหมวดนี้'}</p>
                <p className="text-muted-foreground text-sm">{videos.length === 0 ? 'ส่งสินค้าจาก Extension เพื่อสร้างคลิป' : 'ลองเลือกแท็บอื่น'}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5"
              variants={gridVariants}
              initial="hidden"
              animate="show"
            >
              {shown.map((v) => {
                const f = FOLDER[v.folder] ?? FOLDER.pending
                return (
                  <motion.div
                    key={`${v.folder}/${v.name}`}
                    variants={cardVariants}
                    layout
                    className="group rounded-2xl overflow-hidden border border-border bg-card shadow-card hover:border-accent/30 transition-colors flex flex-col"
                  >
                    <div className="relative h-40 sm:h-44 bg-black cursor-pointer" onClick={() => setPreview(v)}>
                      {v.cover
                        ? <img src={api.videoFileUrl(v.folder, v.cover)} alt="" className="w-full h-full object-cover object-top" />
                        : <LazyVideo src={api.videoFileUrl(v.folder, v.name)} className="w-full h-full" videoClassName="w-full h-full object-cover object-[center_20%]" />}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/50 transition-all">
                        <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play size={18} className="text-black fill-black ml-0.5" />
                        </div>
                      </div>
                      <span className={`absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${f.cls}`}>
                        <f.icon size={10} /> {f.label}
                      </span>
                      {!(v.link || '').trim() && (
                        <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/90 text-white">
                          <Unlink size={10} /> ไม่มีลิงก์
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <p className="text-foreground text-sm font-semibold leading-snug line-clamp-2" title={v.product || v.name}>
                        {v.product || v.name}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {v.price
                          ? <span className="text-[15px] font-extrabold nums text-foreground">฿{Number(v.price).toLocaleString()}</span>
                          : <span className="text-xs text-muted-foreground nums">{fmtSize(v.size)}</span>}
                        {v.commission ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success/15 text-success border border-success/30 text-[11px] font-bold nums">
                            <Coins size={11} /> {v.commission}%
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[11px] text-muted-foreground nums">{fmtTime(v.mtime)}</span>
                      <div className="flex items-center gap-1.5 mt-auto pt-1">
                        <button onClick={() => setForm(v)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                          <Pencil size={12} /> แก้ไข
                        </button>
                        <button onClick={() => setDelClip(v)} title="ลบคลิป"
                          className="flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-danger hover:bg-danger/10 hover:border-danger/30 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fade-in" onClick={() => setPreview(null)}>
          <div className="relative flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <video src={api.videoFileUrl(preview.folder, preview.name)}
                   className="max-h-[80vh] rounded-2xl border-2 border-white/10" controls autoPlay loop />
            <div className="flex items-center gap-3">
              <span className="text-white text-sm max-w-md truncate">{preview.product || preview.name}</span>
              <a href={api.videoFileUrl(preview.folder, preview.name)} download={preview.name}
                 className="flex items-center gap-1.5 text-xs text-white bg-accent hover:bg-accent-soft px-3 py-1.5 rounded-lg transition-all">
                <Download size={12} /> ดาวน์โหลด
              </a>
            </div>
          </div>
          <button onClick={() => setPreview(null)}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fade-in"
             onClick={() => !deleting && setConfirmDel(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-lift p-6 animate-scale-in"
               onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-xl bg-danger/15 flex items-center justify-center mb-4">
              <AlertTriangle size={20} className="text-danger" />
            </div>
            <h3 className="text-foreground font-bold text-lg leading-tight">ลบคลิปที่ไม่มีลิงก์ตะกร้า?</h3>
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
              จะลบ <span className="text-danger font-bold nums">{noLink.length} คลิป</span> ที่ไม่มีลิงก์ตะกร้า
              (โพสต์ไปก็ไม่ได้ค่าคอมมิชชั่น) — <span className="text-foreground font-medium">ลบแล้วกู้คืนไม่ได้</span>
            </p>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDel(false)} disabled={deleting}>
                ยกเลิก
              </Button>
              <Button variant="destructive" className="flex-1" onClick={delNoLink} disabled={deleting}>
                {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                ลบ {noLink.length} คลิป
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit clip modal */}
      {form && <ClipFormModal clip={form === 'new' ? null : form}
                 onClose={() => setForm(null)} onDone={() => { setForm(null); load() }} />}

      {/* Per-clip delete confirm */}
      {delClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fade-in"
             onClick={() => !deleting && setDelClip(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-lift p-6 animate-scale-in"
               onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-xl bg-danger/15 flex items-center justify-center mb-4">
              <Trash2 size={20} className="text-danger" />
            </div>
            <h3 className="text-foreground font-bold text-lg leading-tight">ลบคลิปนี้?</h3>
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
              <span className="text-foreground font-medium">{delClip.product || delClip.name}</span> — ลบทั้งไฟล์และข้อมูล <span className="text-foreground font-medium">กู้คืนไม่ได้</span>
            </p>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setDelClip(null)} disabled={deleting}>ยกเลิก</Button>
              <Button variant="destructive" className="flex-1" onClick={removeClip} disabled={deleting}>
                {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />} ลบคลิป
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── โมดอลเพิ่ม/แก้ไขคลิป ──
function ClipFormModal({ clip, onClose, onDone }) {
  const editing = !!clip
  const [file, setFile]   = useState(null)
  const [src, setSrc]     = useState('')
  const [name, setName]   = useState(clip?.product || '')
  const [price, setPrice] = useState(clip?.price || '')
  const [comm, setComm]   = useState(clip?.commission || '')
  const [link, setLink]   = useState(clip?.link || '')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverSrc, setCoverSrc]   = useState('')

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); if (coverSrc) URL.revokeObjectURL(coverSrc) }, [src, coverSrc])

  const pick = (f) => {
    if (!f) return
    setErr('')
    setFile(f)
    if (src) URL.revokeObjectURL(src)
    setSrc(URL.createObjectURL(f))
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }
  const pickCover = (f) => {
    if (!f) return
    setCoverFile(f)
    if (coverSrc) URL.revokeObjectURL(coverSrc)
    setCoverSrc(URL.createObjectURL(f))
  }

  const submit = async () => {
    if (!editing && !file) { setErr('เลือกไฟล์คลิปก่อน'); return }
    setBusy(true); setErr('')
    try {
      if (editing) {
        await api.updateClip(clip.id, { name, price, commission: comm, link })
        if (coverFile) { const cf = new FormData(); cf.append('file', coverFile); await api.uploadCover(clip.id, cf) }
      } else {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('name', name); fd.append('price', price)
        fd.append('commission', comm); fd.append('link', link)
        await api.uploadClip(fd)
      }
      onDone()
    } catch { setErr(editing ? 'บันทึกไม่สำเร็จ — ลองใหม่' : 'อัปโหลดไม่สำเร็จ — ลองใหม่'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fade-in"
         onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-lift p-6 animate-scale-in"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-bold text-lg">{editing ? 'แก้ไขข้อมูลคลิป' : 'เพิ่มคลิปเข้าคลัง'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X size={18} /></button>
        </div>

        {/* พรีวิว/เลือกไฟล์ */}
        {editing ? (
          <>
            <div className="aspect-[16/10] rounded-xl overflow-hidden bg-black border border-border">
              <video src={api.videoFileUrl(clip.folder, clip.name)} muted controls className="w-full h-full object-contain" />
            </div>
            {/* ปกคลิป */}
            <div className="flex items-center gap-3 mt-3">
              <div className="w-12 h-16 rounded-lg overflow-hidden bg-black border border-border shrink-0">
                {(coverSrc || clip.cover)
                  ? <img src={coverSrc || api.videoFileUrl(clip.folder, clip.cover)} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} className="text-muted-foreground" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-sm font-medium">ปกคลิป</p>
                <p className="text-muted-foreground text-[11px]">{clip.cover ? 'มีปกแล้ว' : 'ยังไม่มีปก — Shopee จะเลือกเฟรมแรกแทน'}</p>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all cursor-pointer shrink-0">
                <ImageIcon size={13} /> เปลี่ยนปก
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickCover(e.target.files?.[0])} />
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="block cursor-pointer">
              <div className="relative aspect-[16/10] rounded-xl border-2 border-dashed border-border hover:border-accent/50 bg-secondary/50 overflow-hidden flex items-center justify-center transition-colors">
                {src
                  ? <video src={src} muted className="w-full h-full object-contain bg-black" />
                  : <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload size={26} /><span className="text-sm font-medium">เลือกไฟล์คลิป (.mp4)</span>
                    </div>}
              </div>
              <input type="file" accept="video/mp4,video/*" className="hidden"
                onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            {file && <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{file.name}</p>}
          </>
        )}

        {/* ข้อมูล */}
        <div className="flex flex-col gap-2.5 mt-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อสินค้า"
            className="px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 placeholder:text-muted-foreground" />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="ราคา (บาท)" inputMode="numeric"
              className="px-3 py-2 text-sm nums bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 placeholder:text-muted-foreground" />
            <input value={comm} onChange={e => setComm(e.target.value)} placeholder="ค่าคอม (%)" inputMode="numeric"
              className="px-3 py-2 text-sm nums bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 placeholder:text-muted-foreground" />
          </div>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="ลิงก์ตะกร้า (affiliate)"
            className="px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 placeholder:text-muted-foreground" />
        </div>

        {err && <p className="text-danger text-xs mt-3">{err}</p>}

        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button className="flex-1" onClick={submit} disabled={busy || (!editing && !file)}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Pencil size={14} /> : <Plus size={14} />}
            {editing ? 'บันทึก' : 'เพิ่มคลิป'}
          </Button>
        </div>
      </div>
    </div>
  )
}
