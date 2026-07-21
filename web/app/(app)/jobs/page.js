'use client'
import { useState, useEffect, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { api }        from '@/lib/api'
import { Button }     from '@/components/ui/Button'
import { SkeletonJobItem } from '@/components/ui/Skeleton'
import { PageHeader, JOB_STATUS } from '@/components/layout/PageHeader'
import { LazyVideo } from '@/components/ui/LazyVideo'
import { Send, Trash2, ListChecks, Loader2, Link2, Copy, Check, Film, FlaskConical, Play, X, Coins, Search, ArrowUpDown } from 'lucide-react'

const shortLink = (u) => (u || '').replace(/^https?:\/\//, '')

const FILTERS = [
  { key: 'all',        label: 'ทั้งหมด' },
  { key: 'generated',  label: 'รอเผยแพร่' },
  { key: 'active',     label: 'กำลังทำ' },
  { key: 'posted',     label: 'สำเร็จ' },
  { key: 'error',      label: 'พลาด' },
]

const matchFilter = (j, f) =>
  f === 'all' ? true
  : f === 'active' ? ['generating', 'posting', 'retry'].includes(j.status)
  : f === 'posted' ? ['posted', 'done'].includes(j.status)
  : j.status === f

const isPosted = (j) => ['posted', 'done'].includes(j.status)

// ลายเซ็นข้อมูลงาน — ใช้เทียบว่า poll รอบนี้ "เปลี่ยนจริงไหม" (กัน re-render เปล่า)
const jobsSig = (arr) => (arr || []).map(j => `${j.id}:${j.status}:${j.updated_at}:${j.attempts}`).join('|')

// re-render การ์ดเฉพาะตอน job เปลี่ยน หรือสถานะปุ่ม (busy/dry/copied) ของ "ใบนี้" เปลี่ยน
const jobCardEqual = (a, b) =>
  a.job === b.job &&
  (a.busy === a.job.id)    === (b.busy === b.job.id) &&
  (a.dryBusy === a.job.id) === (b.dryBusy === b.job.id) &&
  (a.copied === a.job.id)  === (b.copied === b.job.id)

const num = (v) => Number(v) || 0
const SORTERS = {
  new:   (a, b) => (b.id || 0) - (a.id || 0),
  comm:  (a, b) => num(b.commission) - num(a.commission),
  price: (a, b) => num(b.price) - num(a.price),
}
const SORT_LABEL = { new: 'ใหม่สุด', comm: 'ค่าคอมมาก→น้อย', price: 'ราคามาก→น้อย' }

export default function JobsPage() {
  const [jobs, setJobs]   = useState([])
  const [filter, setFilter] = useState('all')
  const [busy, setBusy]   = useState(null)
  const [dryBusy, setDryBusy] = useState(null)
  const [copied, setCopied] = useState(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null)   // คลิปที่กำลังเปิดดู (โมดอล)
  const [sort, setSort]   = useState('new')
  const [query, setQuery] = useState('')
  const copy = (text, id) => { try { navigator.clipboard?.writeText(text) } catch {}; setCopied(id); setTimeout(() => setCopied(null), 1500) }

  const load = useCallback(async () => {
    try {
      const d = await api.jobs()
      const next = d.jobs || []
      // อัปเดตเฉพาะตอนข้อมูลเปลี่ยนจริง → กัน re-render การ์ด+วิดีโอทุก 4 วิ (กระตุก)
      setJobs(prev => jobsSig(prev) === jobsSig(next) ? prev : next)
    } catch {}
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id) }, [load])

  const postNow = async (id) => { setBusy(id); try { await api.postJob(id) } catch {}; setTimeout(() => { setBusy(null); load() }, 1500) }
  const dryNow  = async (id) => { setDryBusy(id); try { await api.dryPostJob(id) } catch {}; setTimeout(() => setDryBusy(null), 3000) }
  const remove  = async (id) => { setBusy(id); try { await api.deleteJob(id) } catch {}; setBusy(null); load() }
  const cancel  = async (id) => { setBusy(id); try { await api.cancelJob(id) } catch {}; setBusy(null); load() }

  const q = query.trim().toLowerCase()
  const shown = jobs
    .filter(j => matchFilter(j, filter))
    .filter(j => !q || (j.name || '').toLowerCase().includes(q))
    .sort(SORTERS[sort] || SORTERS.new)
  const notPosted = shown.filter(j => !isPosted(j))
  const posted    = shown.filter(j => isPosted(j))

  return (
    <div className="flex flex-col gap-5 lg:gap-6 p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <motion.div
        className="flex items-start justify-between gap-4 flex-wrap"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <h2 className="text-foreground text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">งาน</h2>
          <p className="text-muted-foreground text-sm mt-2">รีเช็คคลิปแล้วโพสต์เอง · <span className="nums">{jobs.length}</span> งาน</p>
        </div>
      </motion.div>

      {/* Filter chips */}
      <motion.div
        className="flex items-center gap-2 flex-wrap"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
      >
        {FILTERS.map(f => {
          const n = jobs.filter(j => matchFilter(j, f.key)).length
          const on = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${on ? 'bg-accent-wash text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              {f.label} <span className={`nums ${on ? 'text-accent' : 'text-muted-foreground'}`}>{n}</span>
            </button>
          )
        })}

        {/* ค้นหา + เรียง (ช่วยงาน manual) */}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อสินค้า…"
              className="w-40 sm:w-52 pl-8 pr-3 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 placeholder:text-muted-foreground" />
          </div>
          <div className="relative flex items-center">
            <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="appearance-none pl-8 pr-7 py-1.5 text-xs font-medium bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-accent/50 cursor-pointer">
              {Object.entries(SORT_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Job list — AnimatePresence ครอบทุก state ป้องกันข้อมูลหาย */}
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          /* skeleton ขณะโหลดครั้งแรก */
          <motion.div
            key="skeleton"
            className="flex flex-col gap-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {[...Array(4)].map((_, i) => <SkeletonJobItem key={i} />)}
          </motion.div>
        ) : shown.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-card shadow-card p-16 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
              <ListChecks size={24} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold mb-1">{jobs.length === 0 ? 'ยังไม่มีงาน' : 'ไม่มีงานในหมวดนี้'}</p>
            <p className="text-muted-foreground text-sm">คลิปที่ extension สร้างเสร็จจะมาแสดงที่นี่</p>
          </motion.div>
        ) : (
          /* รายการ jobs แบ่งหมวด: ยังไม่ได้โพสต์ / โพสต์แล้ว */
          <motion.div
            key="list"
            className="flex flex-col gap-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {notPosted.length > 0 && (
              <section>
                <GroupHeader title="ยังไม่ได้โพสต์" count={notPosted.length} tone="accent" />
                <div className="flex flex-col gap-2.5">
                  <AnimatePresence initial={false}>
                    {notPosted.map(j => (
                      <JobCard key={j.id} job={j} busy={busy} dryBusy={dryBusy} copied={copied}
                        onCopy={copy} onDry={dryNow} onPost={postNow} onCancel={cancel} onRemove={remove} onOpen={setPreview} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
            {posted.length > 0 && (
              <section>
                <GroupHeader title="โพสต์แล้ว" count={posted.length} tone="success" />
                <div className="flex flex-col gap-2.5">
                  <AnimatePresence initial={false}>
                    {posted.map(j => (
                      <JobCard key={j.id} job={j} busy={busy} dryBusy={dryBusy} copied={copied}
                        onCopy={copy} onDry={dryNow} onPost={postNow} onCancel={cancel} onRemove={remove} onOpen={setPreview} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* โมดอลเล่นคลิป (รีเช็ค) */}
      <AnimatePresence>
        {preview && (
          <ClipPreviewModal key="preview" job={preview} busy={busy} dryBusy={dryBusy} copied={copied}
            onCopy={copy} onDry={dryNow} onPost={postNow} onCancel={cancel} onRemove={remove} onClose={() => setPreview(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── หัวข้อหมวด ──
function GroupHeader({ title, count, tone }) {
  const dot = tone === 'success' ? 'bg-success' : 'bg-accent'
  const txt = tone === 'success' ? 'text-success' : 'text-accent'
  return (
    <div className="flex items-center gap-2.5 mb-3 px-1">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-sm font-bold text-foreground">{title}</span>
      <span className={`text-xs font-semibold nums ${txt}`}>{count}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ── การ์ดงาน 1 ใบ ──
const JobCard = memo(function JobCard({ job: j, busy, dryBusy, copied, onCopy, onDry, onPost, onCancel, onRemove, onOpen }) {
  const s = JOB_STATUS[j.status] ?? JOB_STATUS.pending
  const isErr = j.status === 'error'
  return (
    <motion.div
      key={j.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="group rounded-xl bg-card text-card-foreground border border-border shadow-card p-4 lift"
    >
      <div className="flex items-center gap-4">
        {/* รูปย่อคลิป (ใหญ่ขึ้น + กดเล่น) */}
        <button onClick={() => j.file && onOpen(j)} disabled={!j.file}
          className="relative w-16 h-24 rounded-lg overflow-hidden bg-black shrink-0 border border-border hover:border-accent/60 transition-colors disabled:cursor-default">
          {j.cover
            ? <img src={api.videoFileUrl(j.folder, j.cover)} alt="" className="w-full h-full object-cover object-top" />
            : j.file
              ? <LazyVideo src={api.videoFileUrl(j.folder, j.file)} className="w-full h-full" videoClassName="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Film size={20} className="text-muted-foreground" /></div>}
          {j.file && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity">
                <Play size={15} className="text-white ml-0.5" fill="currentColor" />
              </span>
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-sm font-medium truncate">{j.name || 'ไม่มีชื่อ'}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {j.price
              ? <span className="text-[15px] font-extrabold nums text-foreground">฿{Number(j.price).toLocaleString()}</span>
              : <span className="text-sm text-muted-foreground">—</span>}
            {j.commission ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success/15 text-success border border-success/30 text-[11px] font-bold nums">
                <Coins size={11} /> ค่าคอม {j.commission}%
              </span>
            ) : null}
          </div>
          {(j.attempts > 0 || (isErr && j.error)) && (
            <p className="text-muted-foreground text-[11px] nums mt-1">
              {j.attempts > 0 ? `ลองแล้ว ${j.attempts} ครั้ง` : ''}
              {isErr && j.error ? `${j.attempts > 0 ? ' · ' : ''}${j.error}` : ''}
            </p>
          )}
          {j.link ? (
            <button onClick={() => onCopy(j.link, j.id)} title={j.link}
              className="mt-1.5 inline-flex items-center gap-1.5 max-w-full text-[11px] bg-secondary hover:bg-secondary/70 border border-border rounded-lg px-2 py-1 transition-all">
              <Link2 size={11} className="text-accent shrink-0" />
              <span className="text-muted-foreground shrink-0">ตะกร้า</span>
              <span className="text-foreground truncate">{shortLink(j.link)}</span>
              {copied === j.id
                ? <Check size={11} className="text-success shrink-0" />
                : <Copy size={11} className="text-muted-foreground shrink-0" />}
            </button>
          ) : (
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-danger">
              <Link2 size={11} /> ไม่มีลิงก์ตะกร้า
            </span>
          )}
        </div>
        <span title={j.error || ''}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold shrink-0 ${s.cls}`}>
          {s.spin && <Loader2 size={11} className="animate-spin" />}{s.label}
        </span>
        {j.status === 'generated' && (
          <>
            <button onClick={() => onDry(j.id)} disabled={dryBusy === j.id}
              title="ทดสอบโพสต์ (dry) — รัน ADB ถึง caption ไม่โพสต์จริง ไม่เปลี่ยนสถานะ"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0 disabled:opacity-50">
              {dryBusy === j.id ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />} ทดสอบ
            </button>
            <Button size="sm" onClick={() => onPost(j.id)} disabled={busy === j.id} className="shrink-0">
              {busy === j.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} โพสต์เลย
            </Button>
          </>
        )}
        {/* งานค้าง (posting/generating/retry) หรือ error → ยกเลิก + ลองใหม่ */}
        {['posting', 'generating', 'retry', 'error'].includes(j.status) && (
          <>
            <button onClick={() => onCancel(j.id)} disabled={busy === j.id}
              title="ยกเลิกงานที่ค้าง → กลับเป็น 'พร้อมโพสต์' (ลองใหม่ได้)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all shrink-0 disabled:opacity-50">
              {busy === j.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} ยกเลิก
            </button>
            <Button size="sm" variant="outline" onClick={() => onPost(j.id)} disabled={busy === j.id}
              title="สั่งโพสต์ใหม่อีกครั้ง" className="shrink-0">
              <Send size={12} /> ลองใหม่
            </Button>
          </>
        )}
        <button onClick={() => onRemove(j.id)} disabled={busy === j.id}
          className="p-2 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  )
}, jobCardEqual)

// ── โมดอลเล่นคลิป (รีเช็ค + ลงมือ) ──
function ClipPreviewModal({ job: j, busy, dryBusy, copied, onCopy, onDry, onPost, onCancel, onRemove, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const s = JOB_STATUS[j.status] ?? JOB_STATUS.pending
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative z-10 flex flex-col sm:flex-row gap-5 w-full max-w-[760px]"
        initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
        {/* วิดีโอเต็ม */}
        <div className="shrink-0 mx-auto">
          {j.file
            ? <video src={api.videoFileUrl(j.folder, j.file)} controls autoPlay muted loop playsInline
                className="h-[70vh] max-h-[580px] rounded-2xl bg-black border border-border shadow-lift" />
            : <div className="h-[70vh] max-h-[580px] aspect-[9/16] rounded-2xl bg-black border border-border flex items-center justify-center"><Film size={40} className="text-muted-foreground" /></div>}
        </div>
        {/* ข้อมูล + ปุ่ม */}
        <div className="flex-1 min-w-0 bg-card border border-border rounded-2xl shadow-card p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-3">
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${s.cls}`}>
              {s.spin && <Loader2 size={11} className="animate-spin" />}{s.label}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X size={18} /></button>
          </div>
          <h3 className="text-foreground font-bold text-lg leading-snug break-words">{j.name || 'ไม่มีชื่อ'}</h3>
          <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
            {j.price ? <span className="text-2xl font-extrabold nums text-foreground">฿{Number(j.price).toLocaleString()}</span> : null}
            {j.commission ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success/15 text-success border border-success/30 text-sm font-bold nums">
                <Coins size={14} /> ค่าคอม {j.commission}%
              </span>
            ) : null}
          </div>
          {j.attempts > 0 && <p className="text-muted-foreground text-xs nums mt-2">ลองแล้ว {j.attempts} ครั้ง</p>}
          {j.link ? (
            <button onClick={() => onCopy(j.link, j.id)} title={j.link}
              className="mt-3 inline-flex items-center gap-1.5 max-w-full text-xs bg-secondary hover:bg-secondary/70 border border-border rounded-lg px-2.5 py-1.5 transition-all self-start">
              <Link2 size={12} className="text-accent shrink-0" />
              <span className="text-muted-foreground shrink-0">ตะกร้า</span>
              <span className="text-foreground truncate">{shortLink(j.link)}</span>
              {copied === j.id ? <Check size={12} className="text-success shrink-0" /> : <Copy size={12} className="text-muted-foreground shrink-0" />}
            </button>
          ) : (
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-danger"><Link2 size={12} /> ไม่มีลิงก์ตะกร้า</span>
          )}
          {j.error && <p className="mt-3 text-xs text-danger break-words">{j.error}</p>}

          <div className="mt-auto pt-6 flex flex-col gap-2">
            {j.status === 'generated' && (
              <>
                <button onClick={() => onDry(j.id)} disabled={dryBusy === j.id}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50">
                  {dryBusy === j.id ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} ทดสอบโพสต์ (ไม่ลงจริง)
                </button>
                <Button onClick={() => { onPost(j.id); onClose() }} disabled={busy === j.id} className="w-full justify-center">
                  {busy === j.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} โพสต์เลย
                </Button>
              </>
            )}
            <button onClick={() => { onRemove(j.id); onClose() }} disabled={busy === j.id}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-danger hover:bg-danger/10 transition-all">
              <Trash2 size={14} /> ลบคลิป
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
