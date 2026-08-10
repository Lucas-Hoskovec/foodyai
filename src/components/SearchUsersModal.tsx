import { useEffect, useState } from 'react'
import { Check, Search, UserCheck, UserPlus, X } from 'lucide-react'
import { api, type AuthUser } from '@/lib/api'
import type { FriendRequestItem, SocialUser } from '@/lib/types'
import { Avatar } from './Avatar'
import { GlassCard } from './GlassCard'

interface SearchUsersModalProps {
  me: AuthUser | null
  friendIds: Set<number>
  requests: FriendRequestItem[]
  onAccept: (id: number) => void
  onDecline: (id: number) => void
  onSend: (userId: number) => Promise<void>
  onCancelRequest: (userId: number) => void
  onOpenProfile: (user: SocialUser) => void
  onClose: () => void
}

type Result = SocialUser & { status?: string }

export function SearchUsersModal({
  me,
  friendIds,
  requests,
  onAccept,
  onDecline,
  onSend,
  onCancelRequest,
  onOpenProfile,
  onClose,
}: SearchUsersModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [pending, setPending] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      setBusy(false)
      return
    }
    let alive = true
    setBusy(true)
    const timer = window.setTimeout(async () => {
      try {
        const users = await api.socialSearchUsers(term)
        if (alive) setResults(users)
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        if (alive) setBusy(false)
      }
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query])

  const incomingRequestFor = (userId: number) => requests.find((r) => r.user.id === userId)

  const statusOf = (user: Result): string => {
    if (friendIds.has(user.id)) return 'friends'
    if (pending.has(user.id)) return 'pending'
    if (user.status === 'pending') return 'pending'
    if (user.status === 'incoming' || incomingRequestFor(user.id)) return 'incoming'
    return 'none'
  }

  const send = async (user: Result) => {
    setError(null)
    try {
      await onSend(user.id)
      setPending((prev) => new Set(prev).add(user.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Find people">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong flex max-h-[82%] w-full max-w-sm flex-col overflow-hidden rounded-3xl shadow-[var(--shadow-glass)]">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          <h2 className="flex-1 text-[18px] font-bold">Find people</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5">
          <div className="glass-strong flex items-center gap-2 rounded-full px-3 py-2">
            <Search className="h-4 w-4 text-ink-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by username…"
              className="h-8 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
              autoFocus
            />
          </div>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {requests.length > 0 && (
            <section className="mb-4">
              <h3 className="px-2 pb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                Friend requests ({requests.length})
              </h3>
              <div className="flex flex-col gap-2">
                {requests.map((r) => (
                  <GlassCard key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <button type="button" onClick={() => onOpenProfile(r.user)} className="pressable flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <Avatar name={r.user.username} avatar={r.user.avatar} size={36} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{r.user.username}</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Accept"
                      onClick={() => onAccept(r.id)}
                      className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Decline"
                      onClick={() => onDecline(r.id)}
                      className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </GlassCard>
                ))}
              </div>
            </section>
          )}

          {error && <p className="px-2 pb-2 text-[12px] text-red-500">{error}</p>}

          {query.trim() ? (
            busy ? (
              <div className="flex justify-center py-10">
                <span className="h-5 w-5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
              </div>
            ) : results.length === 0 ? (
              <p className="px-2 py-8 text-center text-[13px] text-ink-faint">No users match “{query.trim()}”.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {results.map((user) => {
                  const status = statusOf(user)
                  const incoming = status === 'incoming' ? incomingRequestFor(user.id) : undefined
                  return (
                    <GlassCard key={user.id} className="flex items-center gap-3 px-3 py-2">
                      <button type="button" onClick={() => onOpenProfile(user)} className="pressable flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        <Avatar name={user.username} avatar={user.avatar} size={36} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{user.username}</span>
                      </button>
                      <ResultActions
                        myId={me?.id}
                        userId={user.id}
                        status={status}
                        incomingId={incoming?.id}
                        onAdd={() => void send(user)}
                        onCancel={() => {
                          setPending((prev) => {
                            const next = new Set(prev)
                            next.delete(user.id)
                            return next
                          })
                          onCancelRequest(user.id)
                        }}
                        onAccept={onAccept}
                        onDecline={onDecline}
                      />
                    </GlassCard>
                  )
                })}
              </div>
            )
          ) : (
            <p className="px-2 py-6 text-center text-[13px] text-ink-faint">Search by username to find and add friends.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultActions({
  myId,
  userId,
  status,
  incomingId,
  onAdd,
  onCancel,
  onAccept,
  onDecline,
}: {
  myId?: number
  userId: number
  status: string
  incomingId?: number
  onAdd: () => void
  onCancel: () => void
  onAccept: (id: number) => void
  onDecline: (id: number) => void
}) {
  if (status === 'friends') {
    return (
      <span className="pressable inline-flex h-9 items-center gap-1 rounded-full bg-ink/[0.06] px-3 text-[12px] font-semibold text-ink-soft">
        <UserCheck className="h-4 w-4" />
        Friends
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <button type="button" onClick={onCancel} className="pressable inline-flex h-9 items-center gap-1 rounded-full border border-ink/10 px-3 text-[12px] font-semibold text-ink/70">
        <X className="h-4 w-4" />
        Cancel
      </button>
    )
  }
  if (status === 'incoming' && incomingId) {
    return (
      <span className="flex items-center gap-1">
        <button type="button" aria-label="Accept request" onClick={() => onAccept(incomingId)} className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Decline request" onClick={() => onDecline(incomingId)} className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft">
          <X className="h-4 w-4" />
        </button>
      </span>
    )
  }
  if (myId === userId) return null
  return (
    <button type="button" onClick={onAdd} className="pressable inline-flex h-9 items-center gap-1 rounded-full bg-ink px-3 text-[12px] font-semibold text-white">
      <UserPlus className="h-4 w-4" />
      Add
    </button>
  )
}