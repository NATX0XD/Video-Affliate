'use client'
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../layout'
import { api }    from '@/lib/api'
import {
  Film, RefreshCw, Play, X, Clock, CheckCircle2, AlertCircle,
  Download, Send, Square, Loader2, Smartphone
} from 'lucide-react'

const FOLDER = {
  pending: { label: 'พร้อมโพสต์', icon: Clock,        cls: 'text-amber-400   bg-amber-500/10   border-amber-500/20'  },
  done:    { label: 'โพสต์แล้ว',  icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  error:   { label: 'ผิดพลาด',   icon: AlertCircle,  cls: 'text-rose-400    bg-rose-500/10    border-rose-500/20'    },
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

  // refresh when gen/post events arrive via log
  useEffect(() => {
    const last = state.logs[state.logs.length - 1]
    if (last && /\[GEN\] เสร็จ|\[POST-ALL\]|video_ready/.test(last.msg)) load()
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
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.05] shrink-0 flex-wrap" style={{ background: '#0a0a16' }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/10"><Film size={14} className="text-violet-400" /></div>
          <span className="text-white font-semibold text-sm">คลังคลิป</span>
          <span className="text-[11px] text-slate-600 bg-white/[0.04] px-2 py-0.5 rounded-full">{videos.length}</span>
          {pendingCount > 0 && (
            <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {pendingCount} พร้อมโพสต์
            </span>
          )}
        </div>

        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>

        <div className="ml-auto flex items-center gap-2">
          {connected.length > 1 && (
            <select value={selSerial} onChange={e => setSelSerial(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] text-white text-xs px-2 py-1.5 rounded-lg outline-none">
              {connected.map(d => <option key={d.serial} value={d.serial} style={{ background:'#1a1a2e' }}>{d.model}</option>)}
            </select>
          )}
          {posting ? (
            <button onClick={stopPost}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 transition-all">
              <Square size={12} className="fill-current" /> หยุด
            </button>
          ) : (
            <button onClick={postAll} disabled={pendingCount === 0 || connected.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#059669,#047857)', boxShadow: '0 4px 14px rgba(5,150,105,0.25)' }}
              title={connected.length === 0 ? 'ต่อมือถือก่อน' : ''}>
              <Send size={13} /> โพสต์ทั้งหมด ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {connected.length === 0 && pendingCount > 0 && (
        <div className="px-6 py-2 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2 text-[11px] text-amber-400/80 shrink-0">
          <Smartphone size={12} /> ต่อมือถือใน Devices ก่อนถึงจะโพสต์ได้
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
        {videos.length === 0 ? (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center">
              <Film size={26} className="text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-slate-400 font-medium mb-1">ยังไม่มีคลิป</p>
              <p className="text-slate-600 text-sm">ไปที่ Products → เลือกสินค้า → "สร้างคลิป"</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {videos.map(v => {
              const f = FOLDER[v.folder] ?? FOLDER.pending
              return (
                <div key={`${v.folder}/${v.name}`}
                     className="group rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all"
                     style={{ background: '#111120' }}>
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
                  <div className="p-2.5">
                    <p className="text-white text-[11px] font-medium line-clamp-1" title={v.product || v.name}>
                      {v.product || v.name}
                    </p>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-600">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={() => setPreview(null)}>
          <div className="relative flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <video src={api.videoFileUrl(preview.folder, preview.name)}
                   className="max-h-[80vh] rounded-2xl border-2 border-white/10" controls autoPlay loop />
            <div className="flex items-center gap-3">
              <span className="text-white text-sm max-w-md truncate">{preview.product || preview.name}</span>
              <a href={api.videoFileUrl(preview.folder, preview.name)} download={preview.name}
                 className="flex items-center gap-1.5 text-xs text-violet-300 bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 rounded-lg hover:bg-violet-500/30 transition-all">
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
