import { cn } from '@/lib/utils'

interface TagChipProps {
  label: string
  icon?: React.ReactNode
  className?: string
}

export function TagChip({ label, icon, className }: TagChipProps) {
  return (
    <span
      className={cn(
        'glass-badge pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink/80',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  )
}