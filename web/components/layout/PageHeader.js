export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div>
        <h2 className="text-ink text-[26px] lg:text-[30px] font-extrabold tracking-tight leading-none">{title}</h2>
        {subtitle && <p className="text-ink-dim text-sm mt-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// สถานะงานมาตรฐาน → สีโทน token (ใช้ร่วมหลายหน้า)
export const JOB_STATUS = {
  pending:    { label: 'รอคิว',      cls: 'text-ink-mute bg-elevated     border-line' },
  queued:     { label: 'รอคิว',      cls: 'text-ink-mute bg-elevated     border-line' },
  generating: { label: 'กำลังสร้าง', cls: 'text-accent   bg-accent-wash  border-accent/20', spin: true },
  generated:  { label: 'รอเผยแพร่',  cls: 'text-accent   bg-accent-wash  border-accent/20' },
  posting:    { label: 'กำลังโพสต์', cls: 'text-accent   bg-accent-wash  border-accent/20', spin: true },
  retry:      { label: 'ลองใหม่',    cls: 'text-accent   bg-accent-wash  border-accent/20', spin: true },
  done:       { label: 'สำเร็จ',      cls: 'text-success  bg-success/10   border-success/20' },
  posted:     { label: 'เผยแพร่แล้ว', cls: 'text-success  bg-success/10   border-success/20' },
  error:      { label: 'ผิดพลาด',     cls: 'text-danger   bg-danger/10    border-danger/20' },
}
