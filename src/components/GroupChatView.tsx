import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import {
  ArrowLeft, Bookmark, Check, CheckCheck, Copy, Image as ImageIcon, Pencil, Repeat, Reply, Send, Settings2,
  Smile, Trash2, Users, X,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Group, GroupMessage, GroupMessageReply, Recipe, SocialUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { EmptyState } from './EmptyState'
import { RecipePicker } from './RecipePicker'

interface GroupChatViewProps {
  groupId: string
  meId: number
  saved: Recipe[]
  history: Recipe[]
  onBack: () => void
  onOpenSettings: () => void
  onOpenRecipe: (recipe: Recipe) => void
  onOpenProfile: (user: SocialUser) => void
}

const EMOJI = ['😀','😂','😍','🥰','😎','🤔','😭','🥺','😅','😊','🔥','❤️','💯','👍','👏','🙏','🎉','🤝','🍕','🍔','🌮','🍣','🥗','🍰','☕','🍺','🥂','🍎','🥑','🍋','🧀','🥐','🎂','🍿','🥡','💬','📷','✨','🎯','👋']

/** 450ms press (or right-click) on a message. */
function useHold(action: () => void) {
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const cancel = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null } }
  return {
    onContextMenu: (ev: MouseEvent) => { ev.preventDefault(); cancel(); action() },
    onPointerDown: (ev: PointerEvent) => {
      if (ev.pointerType === 'mouse' && ev.button === 2) return
      cancel()
      timer.current = window.setTimeout(() => { timer.current = null; action() }, 450)
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  }
}

function dayLabel(dayTs: number) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((startOfToday - dayTs) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Date(dayTs).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function replyPreview(reply: GroupMessageReply) {
  if (reply.deletedAt) return 'This message was deleted'
  if (reply.type === 'image') return 'Photo'
  if (reply.type === 'recipe') return reply.recipe?.title ?? 'Recipe'
  return reply.text
}

export function GroupChatView({
  groupId,
  meId,
  saved,
  history,
  onBack,
  onOpenSettings,
  onOpenRecipe,
  onOpenProfile,
}: GroupChatViewProps) {
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typing, setTyping] = useState<SocialUser[]>([])

  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null)
  const [editing, setEditing] = useState<GroupMessage | null>(null)
  const [actionTarget, setActionTarget] = useState<GroupMessage | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<GroupMessage | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const lastReadAtRef = useRef(0)
  const typingSentRef = useRef(false)
  const lastHeartbeatRef = useRef(0)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages')
    }
  }, [groupId])

  const loadTyping = useCallback(async () => {
    try {
      const list = await api.socialTyping(groupId)
      setTyping(list.filter((u) => u.id !== meId))
    } catch {
      /* non-fatal */
    }
  }, [groupId, meId])

  const flushTyping = useCallback(
    (on: boolean) => {
      typingSentRef.current = on
      void api.socialSendTyping(groupId, on).catch(() => {})
    },
    [groupId],
  )

  useEffect(() => {
    void loadGroup()
    void loadMessages()
    const poll = window.setInterval(() => {
      void loadMessages()
      void loadTyping()
    }, 1000)
    return () => {
      window.clearInterval(poll)
      if (typingSentRef.current) {
        typingSentRef.current = false
        void api.socialSendTyping(groupId, false).catch(() => {})
      }
    }
  }, [groupId, loadGroup, loadMessages, loadTyping])

  // Typing heartbeat while composing (throttled), cleared when the draft empties.
  useEffect(() => {
    const has = draft.trim().length > 0
    if (has) {
      if (Date.now() - lastHeartbeatRef.current > 2500) {
        lastHeartbeatRef.current = Date.now()
        flushTyping(true)
      }
    } else if (typingSentRef.current) {
      flushTyping(false)
    }
  }, [draft, flushTyping])

  // Auto-scroll only when already near the bottom (no yanking while reading history).
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    if (nearBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages.length])

  // Mark read up to the newest visible message when we're at the bottom.
  useEffect(() => {
    if (!messages.length) return
    const last = messages[messages.length - 1]
    if (lastReadAtRef.current >= last.createdAt) return
    if (!nearBottomRef.current) return
    lastReadAtRef.current = last.createdAt
    void api.socialMarkMessageRead(groupId, last.id).catch(() => {})
  }, [messages, groupId])

  const send = async () => {
    const text = draft.trim()
    if (sending || !text) return
    setSending(true)
    try {
      if (editing) {
        const msg = await api.socialEditMessage(groupId, editing.id, text)
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
        setEditing(null)
        setDraft('')
      } else {
        const msg = await api.socialSendMessage(groupId, { type: 'text', text, replyTo: replyTo?.id ?? null })
        setMessages((prev) => [...prev, msg])
        setReplyTo(null)
        setDraft('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const startEditing = (message: GroupMessage) => {
    setActionTarget(null)
    setEditing(message)
    setDraft(message.text)
  }

  const cancelEditing = () => {
    setEditing(null)
    setDraft('')
  }

  const sendImage = async (file: File | undefined) => {
    if (!file) return
    setSending(true)
    try {
      const msg = await api.socialSendImage(groupId, file)
      setMessages((prev) => [...prev, msg])
      setReplyTo(null)
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
      const msg = await api.socialSendMessage(groupId, { type: 'recipe', recipe, replyTo: replyTo?.id ?? null })
      setMessages((prev) => [...prev, msg])
      setReplyTo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send recipe')
    } finally {
      setSending(false)
    }
  }

  const resendRecipe = async (message: GroupMessage) => {
    if (message.type !== 'recipe' || !message.recipe) return
    setActionTarget(null)
    try {
      const msg = await api.socialSendMessage(groupId, { type: 'recipe', recipe: message.recipe })
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not re-send recipe')
    }
  }

  const copyMessage = async (message: GroupMessage) => {
    const value = message.type === 'text' ? message.text : message.type === 'recipe' ? message.recipe?.title ?? '' : ''
    setActionTarget(null)
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard unavailable */
    }
  }

  const memberNames = useMemo(() => new Map(group?.members?.map((m) => [m.user.id, m.user.username]) ?? []), [group])
  const othersTotal = Math.max(0, (group?.members?.length ?? 0) - 1)

  type Run = { day: number; messages: GroupMessage[] }
  const runs = useMemo(() => {
    const out: Run[] = []
    for (const m of messages) {
      const d = new Date(m.createdAt)
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const last = out[out.length - 1]
      if (last && last.day === day && last.messages[last.messages.length - 1].sender.id === m.sender.id) {
        last.messages.push(m)
      } else {
        out.push({ day, messages: [m] })
      }
    }
    return out
  }, [messages])

  const sheet = actionTarget
  const sheetEntry = sheet ? { canEdit: sheet.type === 'text' && sheet.sender.id === meId, canDelete: Boolean(group?.isAdmin) || sheet.sender.id === meId } : null
  const readNames = sheet ? (sheet.readBy ?? []).filter((id) => id !== meId).map((id) => memberNames.get(id)).filter((n): n is string => Boolean(n)) : []

  return (
    <div className="flex min-h-full flex-col pb-2">
      <header className="sticky top-0 z-10 flex items-center gap-2 rounded-[var(--radius-glass)] glass-strong px-2 py-1.5 shadow-[var(--shadow-glass)]">
        <button type="button" aria-label="Back" onClick={onBack} className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={onOpenSettings} className="pressable flex min-w-0 flex-1 items-center gap-2 text-left">
          <Avatar name={group?.name} avatar={group?.avatar} size={38} />
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-bold">{group?.name ?? 'Group'}</span>
            <span className="block truncate text-[12px] text-ink-soft">
              {typing.length > 0
                ? `${typing.map((u) => u.username).join(', ')} typing…`
                : group ? `${group.members?.length ?? 0} members · ${group.isAdmin ? 'you are an admin' : 'member'}` : '…'}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Manage group"
          onClick={onOpenSettings}
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="mt-4 flex-1 space-y-3 overflow-y-auto no-scrollbar pb-4">
        {!group && <div className="flex justify-center py-10"><span className="h-5 w-5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" /></div>}
        {group && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10">
            <EmptyState icon={Users} title="Say hello" description="Share photos, recipes, and chat with your group." />
          </div>
        )}
        {runs.map((run, i) => {
          const showSep = i === 0 || run.day !== runs[i - 1].day
          return (
            <Fragment key={`${run.day}-${run.messages[0].id}`}>
              {showSep && (
                <div className="flex justify-center py-1">
                  <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-[11px] font-semibold text-ink-soft">{dayLabel(run.day)}</span>
                </div>
              )}
              {run.messages.map((m, j) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  self={m.sender.id === meId}
                  first={j === 0}
                  last={j === run.messages.length - 1}
                  others={othersTotal}
                  readByOthers={(m.readBy ?? []).filter((id) => id !== meId).length}
                  onHold={() => setActionTarget(m)}
                  onOpenProfile={onOpenProfile}
                  onOpenRecipe={onOpenRecipe}
                />
              ))}
            </Fragment>
          )
        })}
      </div>

      {error && <p className="pb-1 text-center text-[12px] text-red-500">{error}</p>}

      <div className="sticky bottom-0 rounded-full glass-strong p-1.5 shadow-[var(--shadow-glass)]">
        {(replyTo || editing) && (
          <div className="flex items-center gap-2 pb-1.5 pl-3">
            {replyTo && (
              <>
                <Reply className="h-4 w-4 shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1 rounded-xl bg-ink/[0.06] px-2.5 py-1.5">
                  <p className="truncate text-[11px] font-semibold text-ink-soft">Replying to {replyTo.sender.username}</p>
                  <p className="truncate text-[12px] text-ink">{replyPreview(replyTo)}</p>
                </div>
              </>
            )}
            {editing && (
              <>
                <Pencil className="h-4 w-4 shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1 rounded-xl bg-ink/[0.06] px-2.5 py-1.5">
                  <p className="text-[11px] font-semibold text-ink-soft">Editing message</p>
                  <p className="truncate text-[12px] text-ink">{editing.text}</p>
                </div>
              </>
            )}
            <button type="button" aria-label={editing ? 'Cancel editing' : 'Cancel reply'} onClick={() => (editing ? cancelEditing() : setReplyTo(null))} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-ink-soft">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 pl-4">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
            placeholder="Message…"
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="relative">
            <button type="button" aria-label="Insert emoji" aria-pressed={emojiOpen} onClick={() => setEmojiOpen((prev) => !prev)} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">
              <Smile className="h-5 w-5" />
            </button>
            {emojiOpen && (
              <div className="absolute bottom-12 right-0 z-20 w-64 rounded-2xl glass-strong p-3 shadow-[var(--shadow-glass)]">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { setDraft((d) => d + e); setEmojiOpen(false) }}
                      className="pressable flex h-7 w-7 items-center justify-center rounded-lg text-[18px]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" aria-label="Send a photo" onClick={() => fileRef.current?.click()} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">
            <ImageIcon className="h-5 w-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void sendImage(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" aria-label="Send a recipe" onClick={() => { setEmojiOpen(false); setPicking(true) }} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">
            <Bookmark className="h-5 w-5" />
          </button>
          <button type="button" aria-label={editing ? 'Save' : 'Send'} onClick={() => void send()} disabled={!draft.trim() || sending} className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {picking && <RecipePicker title="Send a recipe" saved={saved} history={history} onSelect={sendRecipe} onClose={() => setPicking(false)} />}

      {sheet && group && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button type="button" aria-label="Close" onClick={() => setActionTarget(null)} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="glass-strong relative z-10 w-full max-w-sm rounded-t-3xl p-3 pb-[max(18px,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="truncate text-[13px] font-semibold">{sheet.sender.username}</span>
              <span className="text-[11px] text-ink-faint">{timeLabel(sheet.createdAt)}</span>
            </div>
            <div className="flex flex-col gap-1">
              {!sheet.deletedAt && (
                <SheetButton icon={<Reply className="h-4 w-4" />} label="Reply" onClick={() => { setReplyTo(sheet); setActionTarget(null); setEmojiOpen(false) }} />
              )}
              {(sheet.type === 'text' || sheet.type === 'recipe') && (
                <SheetButton icon={<Copy className="h-4 w-4" />} label={sheet.type === 'recipe' ? 'Copy recipe title' : 'Copy'} onClick={() => void copyMessage(sheet)} />
              )}
              {sheet.type === 'recipe' && !sheet.deletedAt && (
                <SheetButton icon={<Repeat className="h-4 w-4" />} label="Re-send recipe" onClick={() => void resendRecipe(sheet)} />
              )}
              {sheetEntry?.canEdit && (
                <SheetButton icon={<Pencil className="h-4 w-4" />} label="Edit" onClick={() => startEditing(sheet)} />
              )}
              {sheet.sender.id === meId && readNames.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[12px] font-semibold text-ink-soft">Read by {readNames.length} of {othersTotal}</p>
                  <p className="mt-0.5 text-[12px] text-ink">{readNames.join(', ')}</p>
                </div>
              )}
              {sheetEntry?.canDelete && (
                <SheetButton icon={<Trash2 className="h-4 w-4" />} label="Delete for everyone" danger onClick={() => { setConfirmDelete(sheet); setActionTarget(null) }} />
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setConfirmDelete(null)} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="glass-strong relative z-10 w-full max-w-xs rounded-3xl p-4 shadow-[var(--shadow-glass)]">
            <h3 className="text-[15px] font-bold">Delete message?</h3>
            <p className="mt-1 text-[13px] text-ink-soft">This will remove it for everyone in the group.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="pressable h-10 flex-1 rounded-full bg-ink/[0.06] text-[13px] font-semibold text-ink">Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDelete
                  setConfirmDelete(null)
                  try {
                    await api.socialDeleteMessage(groupId, target.id)
                    await loadMessages()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not delete message')
                  }
                }}
                className="pressable h-10 flex-1 rounded-full bg-red-500 text-[13px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SheetButton({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('pressable flex h-11 items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium', danger ? 'text-red-500' : 'text-ink')}>
      <span className={cn(danger ? 'text-red-400' : 'text-ink-soft')}>{icon}</span>
      {label}
    </button>
  )
}

function MessageRow({
  message,
  self,
  first,
  last,
  others,
  readByOthers,
  onHold,
  onOpenProfile,
  onOpenRecipe,
}: {
  message: GroupMessage
  self: boolean
  first: boolean
  last: boolean
  others: number
  readByOthers: number
  onHold: () => void
  onOpenProfile: (user: SocialUser) => void
  onOpenRecipe: (recipe: Recipe) => void
}) {
  const hold = useHold(onHold)

  if (message.deletedAt) {
    return (
      <div className={cn('flex', self ? 'justify-end' : 'justify-start')}>
        <div className="flex items-center gap-1.5 rounded-xl bg-ink/[0.045] px-3 py-2 text-[12px] italic text-ink-faint">
          <Trash2 className="h-3.5 w-3.5" />
          This message was deleted
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', self ? 'items-end' : 'items-start')} {...hold}>
      {!self && first && (
        <button type="button" onClick={() => onOpenProfile(message.sender)} className="pressable mb-1 flex items-center gap-1.5 text-left">
          <Avatar name={message.sender.username} avatar={message.sender.avatar} size={20} />
          <span className="text-[12px] font-medium text-ink-soft">{message.sender.username}</span>
        </button>
      )}
      <div className={cn('flex max-w-[75%] flex-col', self ? 'items-end' : 'items-start')}>
        {message.replyTo && (
          <div className={cn('mb-1 max-w-[260px] rounded-lg px-2 py-1', self ? 'bg-white/15' : 'bg-black/[0.06]')}>
            <span className={cn('block text-[11px] font-semibold', self ? 'text-white/90' : 'text-ink-soft')}>{message.replyTo.sender.username}</span>
            <span className={cn('block truncate text-[12px]', self ? 'text-white/80' : 'text-ink-soft')}>{replyPreview(message.replyTo)}</span>
          </div>
        )}
        {message.type === 'image' ? (
          <img src={message.image} alt="" className="max-h-64 w-52 rounded-2xl object-cover" />
        ) : message.type === 'recipe' && message.recipe ? (
          <button type="button" onClick={() => onOpenRecipe(message.recipe!)} className="pressable max-w-[260px] overflow-hidden rounded-2xl bg-ink text-left text-white">
            {message.recipe.image && <img src={message.recipe.image} alt="" className="h-28 w-full object-cover" />}
            <span className="flex items-center gap-2 px-3 py-2.5">
              <Bookmark className="h-4 w-4 shrink-0" />
              <span className="truncate text-[13px] font-semibold">{message.recipe.title}</span>
            </span>
          </button>
        ) : (
          <div className={cn('rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug', self ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-ink/[0.06] text-ink')}>
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          </div>
        )}
      </div>
      {last && (
        <div className={cn('mt-0.5 flex items-center gap-1 px-1 text-[10px] text-ink-faint', self && 'flex-row-reverse')}>
          <span>{timeLabel(message.createdAt)}</span>
          {message.editedAt && <span>· edited</span>}
          {self && (
            <>
              {others > 0 && readByOthers >= others ? (
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
              ) : readByOthers > 0 ? (
                <CheckCheck className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {readByOthers > 0 && <span>Seen by {readByOthers} of {others}</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}