import { Smartphone, ListOrdered } from 'lucide-react'

export function Topbar({ title, devices = 0, queue = 0 }) {
  return (
    <header className="h-[64px] flex items-center justify-between px-8 border-b border-line shrink-0 bg-surface/80 backdrop-blur-xl sticky top-0 z-10">
      <h1 className="text-ink font-bold text-[19px] tracking-tight">{title}</h1>
      <div className="flex items-center gap-2.5">
        <Pill icon={Smartphone}  val={devices} label="มือถือ" />
        <Pill icon={ListOrdered} val={queue}   label="คิวงาน" />
      </div>
    </header>
  )
}

function Pill({ icon: Icon, val, label }) {
  return (
    <div className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg border border-line bg-surface shadow-xs">
      <Icon size={14} strokeWidth={2.2} className="text-ink-mute" />
      <span className="text-ink-mute text-xs font-medium">{label}</span>
      <span className="text-ink text-sm font-bold nums">{val}</span>
    </div>
  )
}
