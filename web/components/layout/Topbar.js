import { Smartphone, ListOrdered, Menu } from 'lucide-react'

export function Topbar({ title, devices = 0, queue = 0, onMenu }) {
  return (
    <header className="h-[60px] lg:h-[64px] flex items-center gap-3 px-4 lg:px-8 border-b border-line shrink-0 bg-surface/80 backdrop-blur-xl sticky top-0 z-10">
      <button onClick={onMenu}
        className="lg:hidden p-2 -ml-1 rounded-lg text-ink-dim hover:text-ink hover:bg-elevated">
        <Menu size={20} />
      </button>

      <h1 className="text-ink font-bold text-[17px] lg:text-[19px] tracking-tight truncate flex-1">{title}</h1>

      <div className="flex items-center gap-2.5 shrink-0">
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
      <span className="hidden sm:inline text-ink-mute text-xs font-medium">{label}</span>
      <span className="text-ink text-sm font-bold nums">{val}</span>
    </div>
  )
}
