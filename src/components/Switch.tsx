import { cn } from '@/lib/utils'

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'pressable relative h-6 w-11 shrink-0 rounded-full transition-colors',
        on ? 'bg-ink' : 'bg-ink/15',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
          on && 'translate-x-[21px]',
        )}
      />
    </button>
  )
}