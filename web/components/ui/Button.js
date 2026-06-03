export function Button({ children, variant = 'primary', size = 'md',
                          className = '', disabled, onClick, ...props }) {
  const base   = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none'
  const sizes  = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5 text-base' }
  const vars   = {
    primary:  'bg-accent text-white hover:bg-accent-soft active:scale-[.98] shadow-[0_2px_14px_rgba(255,92,43,0.25)]',
    secondary:'bg-elevated text-ink border border-line hover:border-ink-mute active:scale-[.98]',
    success:  'bg-success text-white hover:opacity-90 active:scale-[.98]',
    danger:   'bg-danger/15 text-danger border border-danger/25 hover:bg-danger/25 active:scale-[.98]',
    ghost:    'bg-transparent text-ink-dim hover:bg-line hover:text-ink active:scale-[.98]',
    outline:  'bg-transparent border border-line text-ink-dim hover:border-accent hover:text-accent',
  }
  return (
    <button className={`${base} ${sizes[size]} ${vars[variant]} ${className}`}
            disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  )
}
