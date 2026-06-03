export function StatCard({ icon: Icon, label, value, tone = 'neutral' }) {
  const iconTone = {
    neutral: 'text-ink-dim',
    accent:  'text-accent',
    success: 'text-success',
    danger:  'text-danger',
  }[tone] ?? 'text-ink-dim'

  // ตัวเลขขาวเป็นหลัก — แดงเฉพาะ error ที่มีจริง (มีความหมาย)
  const numTone = tone === 'danger' && value > 0 ? 'text-danger' : 'text-ink'

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink-mute/40">
      <div className="flex items-center justify-between mb-4">
        <span className="text-ink-mute text-[11px] font-semibold uppercase tracking-widest">{label}</span>
        <div className="p-2 rounded-lg bg-elevated">
          {Icon && <Icon size={16} strokeWidth={2} className={iconTone} />}
        </div>
      </div>
      <p className={`text-[40px] font-bold nums leading-none ${numTone}`}>{value}</p>
    </div>
  )
}
