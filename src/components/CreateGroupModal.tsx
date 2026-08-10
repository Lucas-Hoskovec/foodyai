import { useState } from 'react'
import { Check, Users, X } from 'lucide-react'
import type { SocialUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'

interface CreateGroupModalProps {
  friends: SocialUser[]
  onCreate: (name: string, memberIds: number[]) => Promise<void>
  onClose: () => void
}

export function CreateGroupModal({ friends, onCreate, onClose }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(name.trim(), [...selected])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create group">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong flex max-h-[85%] w-full max-w-sm flex-col overflow-hidden rounded-3xl shadow-[var(--shadow-glass)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-[18px] font-bold">New group</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            maxLength={60}
            className="input"
            autoFocus
          />
          <p className="text-[12px] text-ink-soft">Invite friends to chat, share photos & recipes.</p>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {friends.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-ink-faint">You don't have friends yet. Add friends first.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {friends.map((friend) => {
                const active = selected.has(friend.id)
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => toggle(friend.id)}
                    className={cn(
                      'pressable flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left',
                      active ? 'bg-ink/[0.08]' : 'bg-ink/[0.03]',
                    )}
                  >
                    <Avatar name={friend.username} avatar={friend.avatar} size={38} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{friend.username}</span>
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border',
                        active ? 'border-ink bg-ink text-white' : 'border-ink/20 text-transparent',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="mx-5 pb-2 text-[12px] text-red-500">{error}</p>}

        <div className="p-3">
          <button
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => void create()}
            className="pressable flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-semibold text-white disabled:opacity-40"
          >
            <Users className="h-4 w-4" />
            {busy ? 'Creating…' : `Create (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}