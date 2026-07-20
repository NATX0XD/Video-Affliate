export function Card({ children, className = '', glass = false }) {
  // glass เดิมใช้ backdrop-blur-md ทุกการ์ด = GPU churn (หลายใบ/หน้า) → พื้นทึบสูงแทน look เกือบเดิม
  const base = glass
    ? 'bg-surface/95 border border-line rounded-2xl'
    : 'bg-surface border border-line rounded-2xl shadow-card'
  return <div className={`${base} ${className}`}>{children}</div>
}

export function CardHeader({ children, className = '' }) {
  return <div className={`px-5 pt-5 pb-3 ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>
}
