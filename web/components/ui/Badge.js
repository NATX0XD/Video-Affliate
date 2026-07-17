import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary/15 text-primary',
        secondary:   'border-transparent bg-secondary text-secondary-foreground',
        success:     'border-transparent bg-success/15 text-success',
        warning:     'border-transparent bg-amber-400/15 text-amber-500',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        outline:     'border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
