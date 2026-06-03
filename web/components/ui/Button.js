export function Button({ children, variant = 'primary', size = 'md',
                          className = '', disabled, onClick, ...props }) {
  const base   = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes  = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-2.5 text-base' }
  const vars   = {
    primary:  'bg-violet-600 text-white hover:bg-violet-500 active:scale-95',
    secondary:'bg-white/10 text-white hover:bg-white/20 border border-white/10 active:scale-95',
    success:  'bg-emerald-500 text-white hover:bg-emerald-400 active:scale-95',
    danger:   'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/20 active:scale-95',
    ghost:    'bg-transparent text-slate-400 hover:bg-white/10 active:scale-95',
    outline:  'bg-transparent border border-slate-600 text-slate-300 hover:border-violet-500 hover:text-violet-400',
  }
  return (
    <button className={`${base} ${sizes[size]} ${vars[variant]} ${className}`}
            disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  )
}
