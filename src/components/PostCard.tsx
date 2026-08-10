import { Bookmark, Heart, MessageCircle, Trash2 } from 'lucide-react'
import type { AuthUser } from '@/lib/api'
import type { Post, Recipe, SocialUser } from '@/lib/types'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { CommentsSection } from './CommentsSection'
import { GlassCard } from './GlassCard'

interface PostCardProps {
  post: Post
  isSelf: boolean
  me: AuthUser | null
  onOpenProfile: (user: SocialUser) => void
  onOpenRecipe: (recipe: Recipe) => void
  onToggleLike: () => void
  onDelete: () => void
  onOpenComments?: () => void
  /** Render an inline "top comment + show more" block (used in the feed). */
  showComments?: boolean
  onCommentAdded?: () => void
  onCommentDeleted?: () => void
}

export function PostCard({ post, isSelf, me, onOpenProfile, onOpenRecipe, onToggleLike, onDelete, onOpenComments, showComments = false, onCommentAdded, onCommentDeleted }: PostCardProps) {
  return (
    <GlassCard strong className="overflow-hidden">
      {/* Author row (tappable → profile) */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <button type="button" onClick={() => onOpenProfile(post.user)} className="pressable flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar name={post.user.username} avatar={post.user.avatar} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">{post.user.username}</span>
            <span className="block text-[11px] text-ink-faint">{timeAgo(post.createdAt)}</span>
          </span>
        </button>
        {isSelf && (
          <button
            type="button"
            aria-label="Delete post"
            onClick={onDelete}
            className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink/70 hover:bg-red-500/15 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {post.image && <img src={post.image} alt="" className="h-56 w-full object-cover" />}

      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={post.liked ? 'Unlike' : 'Like'}
            aria-pressed={post.liked}
            onClick={onToggleLike}
            className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.05] text-ink"
          >
            <Heart className={cn('h-[18px] w-[18px]', post.liked && 'fill-red-500 text-red-500')} />
          </button>
          <span className="text-[13px] text-ink-soft">
            {post.likes} {post.likes === 1 ? 'like' : 'likes'}
          </span>
          <button
            type="button"
            aria-label="View comments"
            onClick={onOpenComments}
            className="pressable flex h-9 items-center gap-1 rounded-full px-2 text-[13px] text-ink-soft"
          >
            <MessageCircle className="h-[15px] w-[15px]" />
            {post.comments}
          </button>
        </div>
        {post.title && <h3 className="text-[15px] font-semibold">{post.title}</h3>}
        {post.description && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">{post.description}</p>}

        {post.recipe && (
          <button
            type="button"
            onClick={() => onOpenRecipe(post.recipe!)}
            className="pressable mt-1 flex items-center gap-3 overflow-hidden rounded-2xl border border-ink/10 bg-white/60 p-2 text-left"
          >
            {post.recipe.image && (
              <img src={post.recipe.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{post.recipe.title}</span>
              <span className="block text-[11px] text-ink-soft">Open the recipe in Foody AI</span>
            </span>
            <Bookmark className="h-4 w-4 shrink-0 text-ink-faint" />
          </button>
        )}
      </div>

      {showComments && (
        <div className="border-t border-ink/[0.06] px-4 pb-4 pt-1">
          <CommentsSection
            postId={post.id}
            me={me}
            onOpenProfile={onOpenProfile}
            onCommentAdded={onCommentAdded}
            onCommentDeleted={onCommentDeleted}
            preview
          />
        </div>
      )}
    </GlassCard>
  )
}