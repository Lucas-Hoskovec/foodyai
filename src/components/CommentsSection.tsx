import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, MessageCircle, Send, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { AuthUser } from '@/lib/api'
import type { Comment } from '@/lib/types'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'

interface CommentsSectionProps {
  postId: string
  me: AuthUser | null
  onOpenProfile: (user: { id: number; username: string; avatar: string | null }) => void
  onCommentAdded?: () => void
  onCommentDeleted?: () => void
  /** Show only the top comment with a "show more" expander (e.g. inside feed cards). */
  preview?: boolean
}

/** Comment list for a post plus a small composer. */
export function CommentsSection({ postId, me, onOpenProfile, onCommentAdded, onCommentDeleted, preview = false }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      setComments(await api.socialComments(postId))
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load comments')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    void load()
  }, [load])

  // Re-fetch comments every 10s so new ones appear live, without flickering.
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 1_000)
    return () => window.clearInterval(timer)
  }, [load])

  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    try {
      const comment = await api.socialComment(postId, body)
      setComments((prev) => [...prev, comment])
      setText('')
      onCommentAdded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post comment')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (comment: Comment) => {
    setComments((prev) => prev.filter((c) => c.id !== comment.id))
    try {
      await api.socialDeleteComment(postId, comment.id)
      onCommentDeleted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete comment')
      void load()
    }
  }

  /** Only the signed-in account can delete its own comments. */
  const canDelete = (comment: Comment) => {
    if (!me) return false
    return Number(comment.user.id) === Number(me.id)
  }

  const visible = (() => {
    if (expanded || comments.length === 0) return comments
    const top = comments[comments.length - 1]
    if (!me) return [top]
    const lastMine = [...comments].reverse().find((c) => c.user.id === me.id)
    if (!lastMine || lastMine.id === top.id) return [top]
    return [top, lastMine]
  })()

  return (
    <div className={cn(preview ? 'mt-3' : 'mt-4')}>
      <div className="flex items-center gap-2 px-1">
        <MessageCircle className="h-4 w-4 text-ink-soft" />
        <h3 className="text-[14px] font-semibold">
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </h3>
      </div>

      {me && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/60 p-2 pl-1">
          <div className="shrink-0 pl-1">
            <Avatar name={me.username} avatar={me.avatar} size={34} />
          </div>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
            placeholder="Add a comment…"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            aria-label="Post comment"
            disabled={!text.trim() || busy}
            onClick={() => void send()}
            className={cn(
              'pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <span className="h-5 w-5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
        </div>
      ) : comments.length === 0 ? (
        <p className="px-1 pt-4 text-[13px] text-ink-faint">{me ? 'Be the first to comment.' : 'No comments yet.'}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-3">
            {visible.map((comment) => (
              <li key={comment.id} className="flex items-start gap-2.5 px-1">
                <button type="button" onClick={() => onOpenProfile(comment.user)} className="pressable shrink-0">
                  <Avatar name={comment.user.username} avatar={comment.user.avatar} size={34} />
                </button>
                <div className="min-w-0 flex-1 rounded-2xl bg-ink/[0.05] px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <button type="button" onClick={() => onOpenProfile(comment.user)} className="pressable max-w-[55%] truncate text-[13px] font-semibold text-ink">
                      {comment.user.username}
                    </button>
                    <span className="shrink-0 text-[11px] text-ink-faint">{timeAgo(comment.createdAt)}</span>
                    {canDelete(comment) && (
                      <button
                        type="button"
                        aria-label="Delete comment"
                        onClick={() => void remove(comment)}
                        className="pressable ml-auto flex h-7 w-7 shrink-0 -mr-1 items-center justify-center rounded-full bg-red-500/15 text-red-500 hover:bg-red-500 hover:text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">{comment.text}</p>
                </div>
              </li>
            ))}
          </ul>

          {preview && comments.length > visible.length && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="pressable mt-2 flex items-center gap-1.5 px-2 text-[13px] font-semibold text-ink-soft"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show {comments.length - visible.length} more {comments.length - visible.length === 1 ? 'comment' : 'comments'}
                </>
              )}
            </button>
          )}
        </>
      )}

      {error && <p className="mt-2 px-1 text-[12px] text-red-500">{error}</p>}
    </div>
  )
}