import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
}

export function GlassCard({ strong, className, children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(strong ? 'glass-strong' : 'glass', 'rounded-[var(--radius-glass)]', className)}
      {...props}
    >
      {children}
    </div>
  )
}