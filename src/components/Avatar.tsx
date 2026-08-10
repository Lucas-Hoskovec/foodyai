import { cn } from '@/lib/utils'

interface AvatarProps {
  /** username or full avatar source for the fallback letter. */
  name?: string | null
  avatar?: string | null
  size?: number
  className?: string
}

/** Circular avatar with gradient-letter fallback. */
export function Avatar({ name, avatar, size = 40, className }: AvatarProps) {
  const style = { width: size, height: size } as const
  if (avatar) {
    return <img src={avatar} alt="" style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
  }
  return (
    <span
      style={style}
      aria-hidden
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-[#ffd9c4] to-[#cfe6ff] font-semibold text-ink',
        className,
      )}
    >
      <span style={{ fontSize: size * 0.42 }}>{name?.charAt(0).toUpperCase() ?? '?'}</span>
    </span>
  )
}