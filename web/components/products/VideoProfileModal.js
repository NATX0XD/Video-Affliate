'use client'
import { useState } from 'react'
import { Sparkles, X, Clock, Users, Smile, Film, Image as ImageIcon, Volume2, Zap, Gift, Mic } from 'lucide-react'

const FIELDS = [
  { key: 'duration',    icon: Clock,     label: 'ความยาว',   opts: ['6','8','12','15'],
    render: v => `${v} วิ` },
  { key: 'age_group',   icon: Users,     label: 'กลุ่มวัย',  opts: ['All Ages','Gen Z','Millennial','Adult'] },
  { key: 'personality', icon: Smile,     label: 'บุคลิก',    opts: ['Fun','Serious','Friendly','Luxury'] },
  { key: 'style',       icon: Film,      label: 'สไตล์',     opts: ['Lifestyle','Review','Compare','Comedy'] },
  { key: 'background',  icon: ImageIcon, label: 'ฉากหลัง',   opts: ['Studio','Outdoor','Home','Office'] },
]

export function VideoProfileModal({ count, initial = {}, onConfirm, onClose }) {
  const [p, setP] = useState({
    engine:      initial.engine      ?? 'template',
    duration:    String(initial.duration ?? '8'),
    age_group:   initial.age_group   ?? 'All Ages',
    personality: initial.personality ?? 'Fun',
    style:       initial.style       ?? 'Lifestyle',
    background:  initial.background  ?? 'Studio',
    generate_audio: !!initial.generate_audio,
  })
  const set = (k, v) => setP(s => ({ ...s, [k]: v }))
  const isVeo = p.engine === 'veo'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] overflow-hidden"
           style={{ background: '#13131f' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className="p-2 rounded-xl bg-violet-500/15">
            <Sparkles size={16} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">ตั้งลักษณะวิดีโอ</h3>
            <p className="text-slate-500 text-[11px]">AI จะคิด prompt + สร้าง {count} คลิป ตาม profile นี้</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Fields */}
        <div className="p-5 flex flex-col gap-4 max-h-[55vh] overflow-y-auto">

          {/* Engine選択 */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-slate-400 text-xs font-medium">
              <Zap size={12} /> วิธีสร้าง
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => set('engine', 'template')}
                className={`flex flex-col items-start gap-1 px-2.5 py-2.5 rounded-xl border text-left transition-all
                  ${p.engine === 'template' ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.15]'}`}>
                <div className="flex items-center gap-1">
                  <Gift size={12} className={p.engine === 'template' ? 'text-emerald-400' : 'text-slate-500'} />
                  <span className={`text-xs font-semibold ${p.engine === 'template' ? 'text-emerald-400' : 'text-slate-300'}`}>Template</span>
                </div>
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 rounded">ฟรี</span>
                <span className="text-[9px] text-slate-500 leading-tight">รูปสินค้า + ซูม</span>
              </button>
              <button onClick={() => set('engine', 'avatar')}
                className={`flex flex-col items-start gap-1 px-2.5 py-2.5 rounded-xl border text-left transition-all
                  ${p.engine === 'avatar' ? 'bg-sky-500/10 border-sky-500/40' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.15]'}`}>
                <div className="flex items-center gap-1">
                  <Mic size={12} className={p.engine === 'avatar' ? 'text-sky-400' : 'text-slate-500'} />
                  <span className={`text-xs font-semibold ${p.engine === 'avatar' ? 'text-sky-400' : 'text-slate-300'}`}>Avatar</span>
                </div>
                <span className="text-[9px] font-bold text-sky-400 bg-sky-500/20 px-1.5 rounded">รีวิว</span>
                <span className="text-[9px] text-slate-500 leading-tight">คนพูดรีวิว (D-ID)</span>
              </button>
              <button onClick={() => set('engine', 'veo')}
                className={`flex flex-col items-start gap-1 px-2.5 py-2.5 rounded-xl border text-left transition-all
                  ${isVeo ? 'bg-violet-500/10 border-violet-500/40' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.15]'}`}>
                <div className="flex items-center gap-1">
                  <Sparkles size={12} className={isVeo ? 'text-violet-400' : 'text-slate-500'} />
                  <span className={`text-xs font-semibold ${isVeo ? 'text-violet-400' : 'text-slate-300'}`}>AI Veo</span>
                </div>
                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/20 px-1.5 rounded">เสียเงิน</span>
                <span className="text-[9px] text-slate-500 leading-tight">AI สร้างใหม่</span>
              </button>
            </div>
          </div>

          {FIELDS.map(({ key, icon: Icon, label, opts, render }) => (
            <div key={key}>
              <div className="flex items-center gap-1.5 mb-2 text-slate-400 text-xs font-medium">
                <Icon size={12} /> {label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {opts.map(o => {
                  const on = p[key] === o
                  return (
                    <button key={o} onClick={() => set(key, o)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${on ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                             : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white hover:border-white/[0.15]'}`}>
                      {render ? render(o) : o}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {p.engine === 'template' && (
            <p className="text-[11px] text-slate-600 bg-white/[0.02] rounded-lg px-3 py-2 leading-relaxed">
              💡 Template ใช้ <b className="text-slate-400">รูปสินค้าจริง</b> + ซูม + ข้อความ ฟรี 100% เร็ว 2 วิ
              <br/>เพิ่มเพลง: วางไฟล์ .mp3 ใน <code className="text-slate-500">data/music/</code>
            </p>
          )}
          {p.engine === 'avatar' && (
            <p className="text-[11px] text-slate-600 bg-sky-500/[0.06] rounded-lg px-3 py-2 leading-relaxed">
              🎙 Avatar = <b className="text-sky-400">คนพูดรีวิวสินค้า</b> (D-ID) + Gemini เขียนสคริปต์ไทย + เสียงพากย์
              <br/>ต้องใส่ D-ID key ใน Settings · ใช้เครดิต D-ID (~2/คลิป)
            </p>
          )}
          {p.engine === 'veo' && (
            <p className="text-[11px] text-slate-600 bg-violet-500/[0.06] rounded-lg px-3 py-2 leading-relaxed">
              ✨ Veo = AI สร้างวิดีโอใหม่จากรูปสินค้า · ต้อง GCP billing · ~$1-3/คลิป
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-white/[0.06]">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all">
            ยกเลิก
          </button>
          <button onClick={() => onConfirm({ ...p, duration: Number(p.duration) })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
            <Sparkles size={14} /> สร้าง {count} คลิป
          </button>
        </div>
      </div>
    </div>
  )
}
