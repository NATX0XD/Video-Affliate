export function StatCard({ icon: Icon, label, value, index = 0, danger = false }) {
  const numTone = danger && value > 0 ? 'text-danger' : 'text-ink'
  return (
    <div
      className="animate-fade-up lift rounded-xl bg-surface border border-line shadow-card p-5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between mb-5">
        <span className="text-ink-dim text-[13px] font-medium">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent-wash">
          {Icon && <Icon size={17} strokeWidth={2.2} className="text-accent" />}
        </div>
      </div>
      <p className={`text-[32px] font-bold nums leading-none tracking-tight ${numTone}`}>{value}</p>
    </div>
  )
}
