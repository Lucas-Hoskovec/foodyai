import { Check, UserMinus, X } from 'lucide-react'
import type { FriendRequestItem, SocialUser } from '@/lib/types'
import { Avatar } from './Avatar'
import { GlassCard } from './GlassCard'

interface FriendsListModalProps {
  title: string
  users: SocialUser[]
  requests?: FriendRequestItem[]
  isOwn: boolean
  onOpenProfile: (user: SocialUser) => void
  onAccept?: (id: number) => void
  onDecline?: (id: number) => void
  onRemove?: (userId: number) => void
  onClose: () => void
}

/** Accounts behind a friends/requests count. */
export function FriendsListModal({
  title,
  users,
  requests = [],
  isOwn,
  onOpenProfile,
  onAccept,
  onDecline,
  onRemove,
  onClose,
}: FriendsListModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong flex max-h-[82%] w-full max-w-sm flex-col overflow-hidden rounded-3xl shadow-[var(--shadow-glass)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-[18px] font-bold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {requests.length > 0 && (
            <section className="mb-3">
              <h3 className="px-2 pb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Requests</h3>
              <div className="flex flex-col gap-2">
                {requests.map((r) => (
                  <GlassCard key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <button type="button" onClick={() => onOpenProfile(r.user)} className="pressable flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <Avatar name={r.user.username} avatar={r.user.avatar} size={36} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{r.user.username}</span>
                    </button>
                    {onAccept && (
                      <button type="button" aria-label="Accept" onClick={() => onAccept(r.id)} className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {onDecline && (
                      <button type="button" aria-label="Decline" onClick={() => onDecline(r.id)} className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </GlassCard>
                ))}
              </div>
            </section>
          )}

          {users.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-ink-faint">
              {requests.length ? 'No friends yet.' : 'No accounts here yet.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map((user) => (
                <GlassCard key={user.id} className="flex items-center gap-3 px-3 py-2">
                  <button type="button" onClick={() => onOpenProfile(user)} className="pressable flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <Avatar name={user.username} avatar={user.avatar} size={36} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{user.username}</span>
                  </button>
                  {isOwn && onRemove && (
                    <button
                      type="button"
                      aria-label={`Remove ${user.username}`}
                      onClick={() => onRemove(user.id)}
                      className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-faint hover:text-red-500"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}