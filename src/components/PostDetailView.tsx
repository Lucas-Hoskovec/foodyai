import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { AuthUser } from '@/lib/api'
import type { Post, Recipe, SocialUser } from '@/lib/types'
import { PostCard } from './PostCard'

interface PostDetailViewProps {
  post: Post
  me: AuthUser | null
  onBack: () => void
  onOpenProfile: (user: SocialUser) => void
  onOpenRecipe: (recipe: Recipe) => void
  onToggleLike: (post: Post) => void
  onDelete: (post: Post) => void
  onCommentAdded?: () => void
  onCommentDeleted?: () => void
}

/** Single post (opened from a profile grid or feed) laid out exactly like the feed. */
export function PostDetailView({ post, me, onBack, onOpenProfile, onOpenRecipe, onToggleLike, onDelete, onCommentAdded, onCommentDeleted }: PostDetailViewProps) {
  const [current, setCurrent] = useState(post)

  const bump = (delta: number, notify?: () => void) => {
    setCurrent((prev) => ({ ...prev, comments: Math.max(0, prev.comments + delta) }))
    notify?.()
  }

  return (
    <div className="flex min-h-full flex-col pb-10">
      <header className="flex items-center pt-1">
        <button type="button" aria-label="Back" onClick={onBack} className="pressable flex h-10 w-10 items-center justify-center rounded-full glass-strong text-ink">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </header>

      <div className="mt-5">
        <PostCard
          post={current}
          isSelf={current.user.id === me?.id}
          me={me}
          onOpenProfile={onOpenProfile}
          onOpenRecipe={onOpenRecipe}
          onToggleLike={() => {
            const liked = !current.liked
            setCurrent({ ...current, liked, likes: current.likes + (liked ? 1 : -1) })
            onToggleLike(current)
          }}
          onDelete={() => onDelete(current)}
          showComments
          onCommentAdded={() => bump(1, onCommentAdded)}
          onCommentDeleted={() => bump(-1, onCommentDeleted)}
        />
      </div>
    </div>
  )
}