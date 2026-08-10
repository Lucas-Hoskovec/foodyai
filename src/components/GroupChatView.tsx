import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Crown, Image as ImageIcon, Send, Settings2, UserMinus, UserPlus, Users } from 'lucide-react'
import { api } from '@/lib/api'
import type { Group, GroupMessage, Recipe, SocialUser } from '@/lib/types'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { EmptyState } from './EmptyState'
import { GlassCard } from './GlassCard'
import { RecipePicker } from './RecipePicker'

interface GroupChatViewProps {
  groupId: string
  meId: number
  friends: SocialUser[]
  saved: Recipe[]
  history: Recipe[]
  onBack: () => void
  onOpenRecipe: (recipe: Recipe) => void
  onOpenProfile: (user: SocialUser) => void
}

export function GroupChatView({
  groupId,
  meId,
  friends,
  saved,
  history,
  onBack,
  onOpenRecipe,
  onOpenProfile,
}: GroupChatViewProps) {
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [picking, setPicking] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadGroup = useCallback(async () => {
    try {
      setGroup(await api.socialGroup(groupId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load group')
    }
  }, [groupId])

  const loadMessages = useCallback(async () => {
    try {
      const next = await api.socialMessages(groupId)
      setMessages(next)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages')
    }
  }, [groupId])

  useEffect(() => {
    void loadGroup()
    void loadMessages()
    const poll = window.setInterval(() => void loadMessages(), 4000)
    return () => window.clearInterval(poll)
  }, [loadGroup, loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const msg = await api.socialSendMessage(groupId, { type: 'text', text })
      setMessages((prev) => [...prev, msg])
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const sendImage = async (file: File | undefined) => {
    if (!file) return
    setSending(true)
    try {
      const msg = await api.socialSendImage(groupId, file)
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send image')
    } finally {
      setSending(false)
    }
  }

  const sendRecipe = async (recipe: Recipe) => {
    setPicking(false)
    setSending(true)
    try {
      const msg = await api.socialSendMessage(groupId, { type: 'recipe', recipe })
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send recipe')
    } finally {
      setSending(false)
    }
  }

  const addMember = async (user: SocialUser) => {
    try {
      const updated = await api.socialAddMember(groupId, user.id)
      setGroup(updated)
      setAddingMember(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member')
    }
  }

  const removeMember = async (user: SocialUser) => {
    try {
      await api.socialRemoveMember(groupId, user.id)
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member')
    }
  }

  const promote = async (user: SocialUser) => {
    try {
      await api.socialPromoteAdmin(groupId, user.id)
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not promote member')
    }
  }

  const memberIds = new Set(group?.members?.map((m) => m.user.id) ?? [])
  const addableFriends = friends.filter((f) => !memberIds.has(f.id))

  return (
    <div className="flex min-h-full flex-col pb-2">
      <header className="flex items-center gap-2">
        <button type="button" aria-label="Back" onClick={onBack} className="pressable flex h-10 w-10 items-center justify-center rounded-full glass-strong text-ink">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-[18px] font-bold">{group?.name ?? 'Group'}</h1>
          <p className="text-[12px] text-ink-soft">
            {group ? `${group.members?.length ?? 0} members · ${group.isAdmin ? 'you are an admin' : 'member'}` : '…'}
          </p>
        </div>
        {group?.isAdmin && (
          <button
            type="button"
            aria-label="Manage group"
            aria-pressed={manageOpen}
            onClick={() => setManageOpen((prev) => !prev)}
            className={cn('pressable flex h-10 w-10 items-center justify-center rounded-full glass-strong', manageOpen && 'bg-ink text-white')}
          >
            <Settings2 className="h-5 w-5" />
          </button>
        )}
      </header>

      {manageOpen && group && (
        <GlassCard strong className="mt-3 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="text-[14px] font-semibold">Members</h2>
            {addableFriends.length > 0 && (
              <button type="button" onClick={() => setAddingMember((prev) => !prev)} className="pressable inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </button>
            )}
          </div>
          <div className="px-3 py-2">
            {addingMember && (
              <div className="mb-2 flex flex-col gap-1 rounded-2xl bg-ink/[0.04] p-2">
                {addableFriends.map((f) => (
                  <button key={f.id} type="button" onClick={() => void addMember(f)} className="pressable flex items-center gap-2 rounded-xl px-2 py-1.5 text-left">
                    <Avatar name={f.username} avatar={f.avatar} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.username}</span>
                    <UserPlus className="h-4 w-4 text-ink-faint" />
                  </button>
                ))}
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {group.members?.map(({ user, isAdmin }) => (
                <li key={user.id} className="flex items-center gap-2 px-1 py-1.5">
                  <button type="button" onClick={() => onOpenProfile(user)} className="pressable flex min-w-0 flex-1 items-center gap-2 text-left">
                    <Avatar name={user.username} avatar={user.avatar} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{user.username}</span>
                    {isAdmin && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}
                  </button>
                  {group.isAdmin && !isAdmin && (
                    <button type="button" aria-label={`Make ${user.username} admin`} onClick={() => void promote(user)} className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft">
                      <Crown className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {group.isAdmin && !isAdmin && (
                    <button type="button" aria-label={`Remove ${user.username}`} onClick={() => void removeMember(user)} className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft hover:text-red-500">
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>
      )}

      <div ref={scrollRef} className="mt-4 flex-1 space-y-3 overflow-y-auto no-scrollbar pb-4">
        {!loaded && <div className="flex justify-center py-10"><span className="h-5 w-5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" /></div>}
        {loaded && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10">
            <EmptyState icon={Users} title="Say hello" description="Share photos, recipes, and chat with your group." />
          </div>
        )}
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            message={msg}
            self={msg.sender.id === meId}
            onOpenProfile={onOpenProfile}
            onOpenRecipe={onOpenRecipe}
          />
        ))}
      </div>

      {error && <p className="pb-1 text-center text-[12px] text-red-500">{error}</p>}

      <div className="sticky bottom-0 flex items-center gap-1 glass-strong rounded-full p-1.5 pl-4 shadow-[var(--shadow-glass)]">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          placeholder="Message…"
          enterKeyHint="send"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button type="button" aria-label="Send a photo" onClick={() => fileRef.current?.click()} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">
          <ImageIcon className="h-5 w-5" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void sendImage(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" aria-label="Send a recipe" onClick={() => setPicking(true)} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">
          <Bookmark className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Send" onClick={() => void send()} disabled={!draft.trim() || sending} className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>

      {picking && <RecipePicker title="Send a recipe" saved={saved} history={history} onSelect={sendRecipe} onClose={() => setPicking(false)} />}
    </div>
  )
}

function MessageRow({
  message,
  self,
  onOpenProfile,
  onOpenRecipe,
}: {
  message: GroupMessage
  self: boolean
  onOpenProfile: (user: SocialUser) => void
  onOpenRecipe: (recipe: Recipe) => void
}) {
  return (
    <div className={cn('flex flex-col', self ? 'items-end' : 'items-start')}>
      {!self && (
        <button type="button" onClick={() => onOpenProfile(message.sender)} className="pressable mb-1 flex items-center gap-1.5 text-left">
          <Avatar name={message.sender.username} avatar={message.sender.avatar} size={20} />
          <span className="text-[12px] font-medium text-ink-soft">{message.sender.username}</span>
        </button>
      )}
      {message.type === 'image' ? (
        <img src={message.image} alt="" className="w-52 rounded-2xl object-cover" />
      ) : message.type === 'recipe' && message.recipe ? (
        <button type="button" onClick={() => onOpenRecipe(message.recipe!)} className="pressable max-w-[260px] overflow-hidden rounded-2xl bg-ink text-left text-white">
          {message.recipe.image && <img src={message.recipe.image} alt="" className="h-28 w-full object-cover" />}
          <span className="flex items-center gap-2 px-3 py-2.5">
            <Bookmark className="h-4 w-4 shrink-0" />
            <span className="truncate text-[13px] font-semibold">{message.recipe.title}</span>
          </span>
        </button>
      ) : (
        <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug', self ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-ink/[0.06] text-ink')}>
          {message.text}
        </div>
      )}
      <span className="mt-0.5 px-1 text-[10px] text-ink-faint">{timeAgo(message.createdAt)}</span>
    </div>
  )
}