import { Smartphone, ListOrdered } from 'lucide-react'

export function Topbar({ title, devices = 0, queue = 0 }) {
  return (
    <header className="h-[56px] flex items-center justify-between px-6 border-b border-line shrink-0 bg-base/80"
            style={{ backdropFilter: 'blur(12px)' }}>
      <h1 className="text-ink font-semibold text-[15px] tracking-tight">{title}</h1>
      <div className="flex items-center gap-2">
        <Pill icon={<Smartphone size={11} strokeWidth={2.5} />} val={devices} label="มือถือ" tone="info" />
        <Pill icon={<ListOrdered size={11} strokeWidth={2.5} />} val={queue}  label="คิว"   tone="accent" />
      </div>
    </header>
  )
}

function Pill({ icon, val, label, tone }) {
  const c = {
    info:   'bg-info/10   text-info   border-info/20',
    accent: 'bg-accent/10 text-accent border-accent/20',
  }[tone]
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold nums ${c}`}>
      {icon}<span className="opacity-70 font-medium">{label}</span> {val}
    </div>
  )
}
