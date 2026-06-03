'use client'
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../layout'
import { api }    from '@/lib/api'
import {
  Film, RefreshCw, Play, X, Clock, CheckCircle2, AlertCircle,
  Download, Send, Square, Smartphone
} from 'lucide-react'

const FOLDER = {
  pending: { label: 'พร้อมโพสต์', icon: Clock,        cls: 'text-accent  bg-accent-wash border-accent/20' },
  done:    { label: 'โพสต์แล้ว',  icon: CheckCircle2, cls: 'text-success bg-success/10  border-success/20' },
  error:   { label: 'ผิดพลาด',   icon: AlertCircle,  cls: 'text-danger  bg-danger/10   border-danger/20'  },
}

const fmtSize = b => b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : b > 1e3 ? `${(b/1e3).toFixed(0)} KB` : `${b} B`
const fmtTime = t => new Date(t*1000).toLocaleString('th-TH', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })

export default function LibraryPage() {
  const { state } = useApp()
  const [videos, setVideos]   = useState([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [posting, setPosting] = useState(false)
  const [selSerial, setSelSerial] = useState('')

  const connected = state.devices.filter(d => d.status === 'device')
  const pendingCount = videos.filter(v => v.folder === 'pending').length

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.listVideos(); setVideos(r.videos || []) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const last = state.logs[state.logs.length - 1]
    if (last && /\[GEN\] เสร็จ|\[POST-ALL\]|\[FLOW\] รับวิดีโอ/.test(last.msg)) load()
  }, [state.logs, load])

  const postAll = async () => {
    const serial = selSerial || connected[0]?.serial || ''
    if (!serial) return
    setPosting(true)
    try { await api.postAllStart(serial) } catch {}
    setTimeout(() => { setPosting(false); load() }, 2000)
  }
  const stopPost = async () => { await api.postAllStop(); setPosting(false) }

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 lg:px-8 py-3.5 border-b border-line shrink-0 flex-wrap bg-surface">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-wash"><Film size={15} className="text-accent" /></div>
          <span className="text-ink font-bold text-[15px]">คลังคลิป</span>
          <span className="text-[11px] text-ink-mute bg-elevated px-2 py-0.5 rounded-full nums">{videos.length}</span>
          {pendingCount > 0 && (
            <span className="text-[11px] text-accent bg-accent-wash border border-accent/20 px-2 py-0.5 rounded-full">
              {pendingCount} พร้อมโพสต์
            </span>
          )}
        </div>

        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-dim hover:text-ink px-3 py-1.5 rounded-lg bg-elevated border border-line hover:border-accent transition-all">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>

        <div className="ml-auto flex items-center gap-2">
          {connected.length > 1 && (
            <select value={selSerial} onChange={e => setSelSerial(e.target.value)}
              className="bg-elevated border border-line text-ink text-xs px-2.5 py-2 rounded-lg outline-none focus:border-accent">
              {connected.map(d => <option key={d.serial} value={d.serial}>{d.model}</option>)}
            </select>
          )}
          {posting ? (
            <button onClick={stopPost}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-danger bg-danger/10 border border-danger/20 transition-all">
              <Square size={12} className="fill-current" /> หยุด
            </button>
          ) : (
            <button onClick={postAll} disabled={pendingCount === 0 || connected.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-soft transition-all active:scale-[.98] disabled:opacity-40"
              title={connected.length === 0 ? 'ต่อมือถือก่อน' : ''}>
              <Send size={14} /> โพสต์ทั้งหมด ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {connected.length === 0 && pendingCount > 0 && (
        <div className="px-5 lg:px-8 py-2 bg-accent-wash border-b border-accent/10 flex items-center gap-2 text-[11px] text-accent shrink-0">
          <Smartphone size={12} /> ต่อมือถือที่หน้า "จัดการเครื่อง" ก่อนถึงจะโพสต์ได้
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto p-5 lg:p-8">
        {videos.length === 0 ? (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-line flex items-center justify-center">
              <Film size={26} className="text-ink-mute" />
            </div>
            <div className="text-center">
              <p className="text-ink font-semibold mb-1">ยังไม่มีคลิป</p>
              <p className="text-ink-dim text-sm">ไปที่ "สินค้า" → เลือกสินค้า → สร้างคลิป</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {videos.map(v => {
              const f = FOLDER[v.folder] ?? FOLDER.pending
              return (
                <div key={`${v.folder}/${v.name}`}
                     className="group lift rounded-2xl overflow-hidden border border-line bg-surface shadow-card">
                  <div className="relative aspect-[9/16] bg-black cursor-pointer" onClick={() => setPreview(v)}>
                    <video src={api.videoFileUrl(v.folder, v.name)} className="w-full h-full object-cover" muted preload="metadata" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                      <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play size={18} className="text-black fill-black ml-0.5" />
                      </div>
                    </div>
                    <span className={`absolute top-2 left-2 flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${f.cls}`}>
                      <f.icon size={9} /> {f.label}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="text-ink text-[12px] font-medium line-clamp-1" title={v.product || v.name}>
                      {v.product || v.name}
                    </p>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-ink-mute nums">
                      <span>{v.price ? `฿${Number(v.price).toLocaleString()}` : fmtSize(v.size)}</span>
                      <span>{fmtTime(v.mtime)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
    </div>
  )
}
