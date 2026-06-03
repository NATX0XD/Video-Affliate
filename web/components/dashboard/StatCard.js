export function StatCard({ icon: Icon, label, value, tone = 'neutral', hero = false }) {
  const chip = {
    neutral: 'bg-ink/5      text-ink-dim',
    accent:  'bg-accent/12  text-accent',
    success: 'bg-success/12 text-success',
    info:    'bg-info/12    text-info',
    danger:  'bg-danger/12  text-danger',
  }[tone] ?? 'bg-ink/5 text-ink-dim'

  if (hero) {
    return (
      <div className="rounded-2xl p-5 flex flex-col items-center text-center bg-side-bg"
           style={{ boxShadow: 'var(--shadow-hero)' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-accent/15">
          {Icon && <Icon size={20} className="text-accent" strokeWidth={2.2} />}
        </div>
        <p className="text-side-dim text-xs font-medium mb-1.5">{label}</p>
        <p className="text-[30px] font-extrabold nums leading-none text-accent">{value}</p>
      </div>
    )
  }

  const numTone = tone === 'danger' && value > 0 ? 'text-danger' : 'text-ink'

  return (
    <div className="rounded-2xl bg-surface border border-line shadow-card p-5 flex flex-col items-center text-center transition-transform hover:-translate-y-0.5">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${chip}`}>
        {Icon && <Icon size={20} strokeWidth={2.2} />}
      </div>
      <p className="text-ink-mute text-xs font-medium mb-1.5">{label}</p>
      <p className={`text-[30px] font-extrabold nums leading-none ${numTone}`}>{value}</p>
    </div>
  )
}
