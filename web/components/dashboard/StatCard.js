export function StatCard({ icon: Icon, label, value, color }) {
  const c = {
    sky:     { text: 'text-sky-300',     icon: 'bg-sky-500/12     text-sky-400',     bar: 'from-sky-500',     glow: '0 0 30px rgba(14,165,233,0.08)'  },
    amber:   { text: 'text-amber-300',   icon: 'bg-amber-500/12   text-amber-400',   bar: 'from-amber-500',   glow: '0 0 30px rgba(245,158,11,0.08)'   },
    emerald: { text: 'text-emerald-300', icon: 'bg-emerald-500/12 text-emerald-400', bar: 'from-emerald-500', glow: '0 0 30px rgba(16,185,129,0.08)'   },
    rose:    { text: 'text-rose-300',    icon: 'bg-rose-500/12    text-rose-400',    bar: 'from-rose-500',    glow: '0 0 30px rgba(244,63,94,0.08)'    },
  }[color] ?? {}

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]"
         style={{ background: '#111120', boxShadow: c.glow }}>
      <div className={`h-px bg-gradient-to-r ${c.bar} to-transparent opacity-60`} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest">{label}</p>
          {Icon && (
            <div className={`p-2 rounded-lg ${c.icon}`}>
              <Icon size={16} strokeWidth={2} />
            </div>
          )}
        </div>
        <p className={`text-[42px] font-black tabular-nums leading-none ${c.text}`}>{value}</p>
      </div>
    </div>
  )
}
