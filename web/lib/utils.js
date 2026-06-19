import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** cn — รวม className อย่างปลอดภัย (clsx + tailwind-merge) ใช้กับ shadcn/Tremor */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
