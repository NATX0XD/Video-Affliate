'use client'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'

/**
 * DonutChart สไตล์ Tremor (บน Recharts) — โดนัทพร้อมป้ายกลาง
 *
 * props:
 *   data           [{ [index]: 'Flow', [category]: 12.5 }]
 *   index          คีย์ชื่อ (เช่น 'name')
 *   category       คีย์ค่า (เช่น 'value')
 *   colors         สี hex ของแต่ละชิ้น
 *   valueFormatter (n) => string
 *   centerLabel    ข้อความใต้ตัวเลขกลาง (เช่น 'รวม')
 *   height         px (default 160)
 */
export function DonutChart({
  data = [], index = 'name', category = 'value', colors = ['#a855f7'],
  valueFormatter = (v) => String(v), centerLabel, height = 160, className,
}) {
  const total = data.reduce((a, d) => a + (Number(d[category]) || 0), 0)

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey={category} nameKey={index}
               innerRadius="64%" outerRadius="100%" paddingAngle={2}
               stroke="none" startAngle={90} endAngle={-270}>
            {data.map((d, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip content={<DonutTooltip fmt={valueFormatter} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-foreground text-lg font-extrabold nums leading-none">{valueFormatter(total)}</span>
        {centerLabel && <span className="text-muted-foreground text-[10px] mt-1">{centerLabel}</span>}
      </div>
    </div>
  )
}

function DonutTooltip({ active, payload, fmt }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lift px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.payload.fill }} />
        <span className="text-muted-foreground">{p.name}</span>
        <span className="ml-auto font-semibold nums text-foreground">{fmt(p.value)}</span>
      </div>
    </div>
  )
}
