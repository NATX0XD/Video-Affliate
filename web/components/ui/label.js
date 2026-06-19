'use client'
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

/** shadcn Label (Radix) */
export function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-sm font-medium leading-none text-foreground select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  )
}
