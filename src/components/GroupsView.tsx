import { Crown, MessagesSquare, Plus } from 'lucide-react'
import type { Group } from '@/lib/types'
import { EmptyState } from './EmptyState'
import { GlassCard } from './GlassCard'

interface GroupsViewProps {
  groups: Group[]
  onOpenGroup: (group: Group) => void
  onCreate: () => void
}

export function GroupsView({ groups, onOpenGroup, onCreate }: GroupsViewProps) {
  if (groups.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center pb-16">
        <EmptyState
          icon={MessagesSquare}
          title="No groups yet"
          description="Create a group from your friends to chat, share photos, and send recipes."
        />
      </div>
    )
  }
  return (
    <div className="flex min-h-full flex-col gap-3 pb-10">
      {groups.map((group) => (
        <button key={group.id} type="button" onClick={() => onOpenGroup(group)} className="pressable text-left">
          <GlassCard strong className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink/[0.06]">
              <MessagesSquare className="h-6 w-6 text-ink" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{group.name}</span>
                {group.isAdmin && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
              </div>
              <span className="text-[12px] text-ink-soft">
                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          </GlassCard>
        </button>
      ))}

      <button
        type="button"
        aria-label="New group"
        onClick={onCreate}
        className="pressable absolute right-5 z-20 bottom-[calc(max(env(safe-area-inset-bottom),14px)+86px)] flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
      >
        <Plus className="h-6 w-6" strokeWidth={2.2} />
      </button>
    </div>
  )
}