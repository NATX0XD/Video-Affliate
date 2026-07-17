'use client'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/* เส้นแสงวิ่งข้ามการ์ด (shimmer) */
function ShimmerLine() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 40%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.07) 60%, transparent 100%)',
        width: '55%',
      }}
      initial={{ x: '-100%' }}
      animate={{ x: '360%' }}
      transition={{
        duration: 1.9,
        ease: 'easeInOut',
        repeat: Infinity,
        repeatDelay: 0.35,
      }}
    />
  )
}

/* building-block — กล่องสีเทาพร้อม shimmer */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg bg-elevated/70', className)}
      {...props}
    >
      <ShimmerLine />
    </div>
  )
}

/* ─── Preset: KPI metric card ─── */
export function SkeletonCard({ className }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-4 lg:p-5 flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28 rounded-md" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-16 rounded-lg mt-1" />
    </div>
  )
}

/* ─── Preset: chart / tall card ─── */
export function SkeletonChartCard({ className, height = 280 }) {
  return (
    <div
      className={cn('rounded-2xl border border-border bg-card p-5', className)}
      style={{ height }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="h-4 w-40 rounded-md" />
      </div>
      <Skeleton className="w-full rounded-xl" style={{ height: height - 90 }} />
    </div>
  )
}

/* ─── Preset: job list item ─── */
export function SkeletonJobItem() {
  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-[68px] rounded-lg shrink-0" />
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <Skeleton className="h-4 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
          <Skeleton className="h-6 w-36 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full shrink-0" />
      </div>
      <div className="flex items-center gap-3 mt-3">
        <Skeleton className="flex-1 h-2.5 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-md" />
      </div>
    </div>
  )
}

/* ─── Preset: device card ─── */
export function SkeletonDeviceCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    </div>
  )
}
