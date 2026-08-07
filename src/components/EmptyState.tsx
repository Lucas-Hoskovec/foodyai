import type { LucideIcon } from 'lucide-react'
import { GlassCard } from './GlassCard'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <GlassCard className="flex flex-col items-center gap-4 px-8 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/70 shadow-[var(--shadow-glass-soft)]">
        <Icon className="h-7 w-7 text-ink/40" strokeWidth={1.6} />
      </div>
      <div>
        <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{description}</p>
      </div>
    </GlassCard>
  )
}