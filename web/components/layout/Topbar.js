import { Smartphone, ListOrdered, Menu } from 'lucide-react'

export function Topbar({ title, devices = 0, queue = 0, onMenu }) {
  return (
    <header className="h-[60px] lg:h-[64px] flex items-center gap-3 px-4 lg:px-8 border-b border-border shrink-0 bg-card sticky top-0 z-10">
      <button onClick={onMenu}
        className="lg:hidden p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary">
        <Menu size={20} />
      </button>

      <h1 className="text-foreground font-bold text-[17px] lg:text-[19px] tracking-tight truncate flex-1">{title}</h1>

      <div className="hidden sm:flex items-center gap-2.5 shrink-0">
        <Pill icon={Smartphone}  val={devices} label="มือถือ" />
        <Pill icon={ListOrdered} val={queue}   label="คิวงาน" />
      </div>
    </header>
  )
}

function Pill({ icon: Icon, val, label }) {
  return (
    <div className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg border border-border bg-secondary">
      <Icon size={14} strokeWidth={2.2} className="text-muted-foreground" />
      <span className="hidden sm:inline text-muted-foreground text-xs font-medium">{label}</span>
      <span className="text-foreground text-sm font-bold nums">{val}</span>
    </div>
  )
}
