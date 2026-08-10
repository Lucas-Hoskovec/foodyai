import { Crown, MessagesSquare } from 'lucide-react'
import type { Group } from '@/lib/types'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import { Avatar } from './Avatar'
import { EmptyState } from './EmptyState'
import { GlassCard } from './GlassCard'

interface GroupsViewProps {
  groups: Group[]
  onOpenGroup: (group: Group) => void
}

function preview(group: Group): string {
  if (!group.lastMessage) return 'No messages yet'
  if (group.lastMessage.deletedAt) return 'This message was deleted'
  const body =
    group.lastMessage.type === 'image' ? 'Photo' : group.lastMessage.type === 'recipe' ? 'Recipe' : group.lastMessage.text
  return `${group.lastMessage.senderName}: ${body}`
}

export function GroupsView({ groups, onOpenGroup }: GroupsViewProps) {
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
            <Avatar name={group.name} avatar={group.avatar} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{group.name}</span>
                {group.isAdmin && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
              </div>
              <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{preview(group)}</span>
              <span className="mt-0.5 block text-[11px] text-ink-faint">
                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-[11px] text-ink-faint">{group.lastMessage ? timeAgo(group.lastMessage.createdAt) : ''}</span>
              {(group.unreadCount ?? 0) > 0 && (
                <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[10px] font-bold text-white')}>
                  {group.unreadCount}
                </span>
              )}
            </div>
          </GlassCard>
        </button>
      ))}
    </div>
  )
}