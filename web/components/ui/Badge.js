const COLORS = {
  green:  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  red:    'bg-rose-500/20    text-rose-400    border-rose-500/30',
  blue:   'bg-sky-500/20     text-sky-400     border-sky-500/30',
  yellow: 'bg-amber-500/20   text-amber-400   border-amber-500/30',
  purple: 'bg-violet-500/20  text-violet-400  border-violet-500/30',
  gray:   'bg-slate-500/20   text-slate-400   border-slate-500/30',
}

export function Badge({ children, color = 'gray', dot = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${COLORS[color]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full bg-current`} />}
      {children}
    </span>
  )
}
