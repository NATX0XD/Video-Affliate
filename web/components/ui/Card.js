export function Card({ children, className = '', glass = false }) {
  const base = glass
    ? 'bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl'
    : 'bg-[#161625] border border-white/[0.06] rounded-2xl'
  return <div className={`${base} ${className}`}>{children}</div>
}

export function CardHeader({ children, className = '' }) {
  return <div className={`px-5 pt-5 pb-3 ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>
}
