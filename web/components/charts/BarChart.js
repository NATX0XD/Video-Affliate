'use client'
import {
  ResponsiveContainer, BarChart as RBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { cn } from '@/lib/utils'

/**
 * BarChart สไตล์ Tremor (บน Recharts) — ธีมตาม token ของโปรเจกต์
 *
 * props:
 *   data            [{ [index]: 'label', cat1: n, cat2: n }]
 *   index           คีย์แกน X (เช่น 'date')
 *   categories      คีย์ค่าที่จะวาด (เช่น ['flow','gemini'])
 *   colors          สี hex ของแต่ละ category
 *   labels          map คีย์ → ชื่อแสดง (legend/tooltip)
 *   valueFormatter  (n) => string
 *   stack           ซ้อนแท่ง (default false)
 *   height          ความสูง px (default 200)
 *   showLegend      โชว์คำอธิบายสี (default true ถ้ามี >1 category)
 */
export function BarChart({
  data = [], index, categories = [], colors = ['#a855f7'],
  labels = {}, valueFormatter = (v) => String(v),
  stack = false, height = 200, showLegend, className,
}) {
  const legend = showLegend ?? categories.length > 1
  const lbl = (k) => labels[k] || k

  return (
    <div className={cn('w-full', className)}>
      {legend && (
        <div className="flex items-center justify-end gap-3 mb-3 text-[11px]">
          {categories.map((c, i) => (
            <span key={c} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[i] }} />
              {lbl(c)}
            </span>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey={index} axisLine={false} tickLine={false}
                 tick={{ fontSize: 10, fill: '#6a6a76' }} dy={4} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} width={44}
                 tick={{ fontSize: 10, fill: '#6a6a76' }}
                 tickFormatter={(v) => valueFormatter(v)} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                   content={<ChartTooltip index={index} labels={labels} fmt={valueFormatter} />} />
          {categories.map((c, i) => {
            const top = i === categories.length - 1
            return (
              <Bar key={c} dataKey={c} fill={colors[i]} stackId={stack ? 'a' : undefined}
                   radius={top ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={34} />
            )
          })}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload, label, index, labels, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lift px-3 py-2 text-xs">
      <p className="font-semibold mb-1.5 text-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground">{labels[p.dataKey] || p.dataKey}</span>
            <span className="ml-auto font-semibold nums text-foreground">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
