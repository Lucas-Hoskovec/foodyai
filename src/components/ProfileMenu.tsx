import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut, Settings, Sparkles, UserPlus } from 'lucide-react'
import type { AuthUser } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ProfileMenuProps {
  user: AuthUser | null
  onOpenSettings: () => void
  onOpenProfile: () => void
  onOpenAuth: (mode?: 'login' | 'register') => void
  onLogout: () => void
}

export function ProfileMenu({ user, onOpenSettings, onOpenProfile, onOpenAuth, onLogout }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="pressable flex h-10 w-10 items-center justify-center overflow-hidden rounded-full glass-strong"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-ink">
            {user ? user.username.charAt(0).toUpperCase() : <LogIn className="h-5 w-5 text-ink-soft" strokeWidth={1.8} />}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="glass-strong absolute right-0 top-12 z-40 flex min-w-[190px] flex-col gap-1 overflow-hidden rounded-2xl p-1.5 shadow-[var(--shadow-glass)]"
        >
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-[13px] font-semibold">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    user.username.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 truncate text-[13px] font-semibold">{user.username}</span>
              </div>
              <div className="mx-1 border-t border-black/5" />
              <MenuItem icon={<Sparkles className="h-4 w-4" />} label="About me" onClick={() => { setOpen(false); onOpenProfile() }} />
              <MenuItem icon={<Settings className="h-4 w-4" />} label="Settings" onClick={() => { setOpen(false); onOpenSettings() }} />
              <div className="mx-1 border-t border-black/5" />
              <MenuItem icon={<LogOut className="h-4 w-4" />} label="Sign out" danger onClick={() => { setOpen(false); onLogout() }} />
            </>
          ) : (
            <>
              <div className="px-3 py-2 text-[13px] font-semibold text-ink">Guest session</div>
              <div className="mx-1 border-t border-black/5" />
              <MenuItem icon={<LogIn className="h-4 w-4" />} label="Sign in" onClick={() => { setOpen(false); onOpenAuth('login') }} />
              <MenuItem icon={<UserPlus className="h-4 w-4" />} label="Create account" onClick={() => { setOpen(false); onOpenAuth('register') }} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'pressable flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink hover:bg-ink/[0.06]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}