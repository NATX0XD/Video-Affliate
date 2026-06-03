import { Smartphone, ListOrdered } from 'lucide-react'

export function Topbar({ title, devices = 0, queue = 0 }) {
  return (
    <header className="h-[56px] flex items-center justify-between px-6 border-b border-white/[0.05] shrink-0"
            style={{ background: 'rgba(10,10,22,0.85)', backdropFilter: 'blur(12px)' }}>
      <h1 className="text-white font-semibold text-[15px] tracking-tight">{title}</h1>
      <div className="flex items-center gap-2">
        <Pill icon={<Smartphone size={11} strokeWidth={2.5} />} val={devices} color="sky"   />
        <Pill icon={<ListOrdered size={11} strokeWidth={2.5} />} val={queue}   color="amber" />
      </div>
    </header>
  )
}

function Pill({ icon, val, color }) {
  const c = {
    sky:   'bg-sky-500/10   text-sky-400   border-sky-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }[color]
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold tabular-nums ${c}`}>
      {icon} {val}
    </div>
  )
}
