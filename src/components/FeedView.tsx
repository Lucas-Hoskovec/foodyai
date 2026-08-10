import { Image as ImageIcon } from 'lucide-react'
import type { AuthUser } from '@/lib/api'
import type { Post, Recipe, SocialUser } from '@/lib/types'
import { EmptyState } from './EmptyState'
import { PostCard } from './PostCard'

interface FeedViewProps {
  posts: Post[]
  me: AuthUser | null
  onOpenProfile: (user: SocialUser) => void
  onOpenRecipe: (recipe: Recipe) => void
  onOpenPost: (post: Post) => void
  onToggleLike: (post: Post) => void
  onDelete: (post: Post) => void
  onCommentAdded?: (postId: string) => void
  onCommentDeleted?: (postId: string) => void
}

/** Instagram-style feed: posts from friends + your own. */
export function FeedView({ posts, me, onOpenProfile, onOpenRecipe, onOpenPost, onToggleLike, onDelete, onCommentAdded, onCommentDeleted }: FeedViewProps) {
  if (posts.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center pb-16">
        <EmptyState
          icon={ImageIcon}
          title="Nothing here yet"
          description="Posts from you and your friends will show up here. Search for people to follow."
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4 pb-10">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          isSelf={post.user.id === me?.id}
          me={me}
          onOpenProfile={onOpenProfile}
          onOpenRecipe={onOpenRecipe}
          onOpenComments={() => onOpenPost(post)}
          onToggleLike={() => onToggleLike(post)}
          onDelete={() => onDelete(post)}
          showComments
          onCommentAdded={() => onCommentAdded?.(post.id)}
          onCommentDeleted={() => onCommentDeleted?.(post.id)}
        />
      ))}
    </div>
  )
}