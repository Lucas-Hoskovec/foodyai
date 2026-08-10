import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Heart, Image as ImageIcon, Plus, UserMinus, UserPlus, X } from 'lucide-react'
import { api, type AuthUser } from '@/lib/api'
import type { Post, SocialUser, UserProfile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { FriendsListModal } from './FriendsListModal'

interface SocialProfileProps {
  userId: number
  me: AuthUser | null
  friendIds: Set<number>
  onOpenPost: (post: Post) => void
  onOpenProfile: (user: SocialUser) => void
  onOpenCreatePost: () => void
  onBack: () => void
  onSend: (userId: number) => Promise<void>
  onCancelRequestByUser: (userId: number) => void
  onRemoveFriend: (userId: number) => void
}

type Relationship = 'friends' | 'pending' | 'incoming' | 'none'

export function SocialProfile({
  userId,
  me,
  friendIds,
  onOpenPost,
  onOpenProfile,
  onOpenCreatePost,
  onBack,
  onSend,
  onCancelRequestByUser,
  onRemoveFriend,
}: SocialProfileProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [relationship, setRelationship] = useState<Relationship>('none')
  const [showFriends, setShowFriends] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.socialProfile(userId)
      setProfile(result)
      if (result.user.id !== me?.id) {
        const matches = await api.socialSearchUsers(result.user.username)
        const self = matches.find((u) => u.id === result.user.id)
        setRelationship(self?.status === 'friends' ? 'friends' : self?.status === 'pending' ? 'pending' : self?.status === 'incoming' ? 'incoming' : 'none')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load profile')
    } finally {
      setLoading(false)
    }
  }, [userId, me?.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (profile && friendIds.has(profile.user.id)) setRelationship('friends')
  }, [friendIds, profile])

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center pb-16">
        <span className="h-6 w-6 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 pb-16 text-center">
        <p className="text-[14px] text-ink-soft">{error ?? 'Could not load this profile.'}</p>
        <button type="button" onClick={onBack} className="pressable rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white">
          Back
        </button>
      </div>
    )
  }

  const isSelf = profile.self

  const addFriend = async () => {
    setBusy(true)
    try {
      await onSend(profile.user.id)
      setRelationship('pending')
    } finally {
      setBusy(false)
    }
  }

  const removeFriendLocal = async (userId: number) => {
    await onRemoveFriend(userId)
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            friendCount: Math.max(0, prev.friendCount - 1),
            friends: prev.friends.filter((f) => f.id !== userId),
          }
        : prev,
    )
  }

  const unfollow = () => {
    setRelationship('none')
    void removeFriendLocal(profile.user.id)
  }

  return (
    <div className="flex min-h-full flex-col pb-24">
      <header className="flex items-center gap-2 pt-1">
        <button type="button" aria-label="Back" onClick={onBack} className="pressable flex h-10 w-10 items-center justify-center rounded-full glass-strong text-ink">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {isSelf && (
          <button type="button" onClick={onOpenCreatePost} className="pressable ml-auto glass-strong flex h-10 w-10 items-center justify-center rounded-full text-ink shadow-[var(--shadow-glass)]" aria-label="New post">
            <Plus className="h-5 w-5" strokeWidth={2.2} />
          </button>
        )}
      </header>

      <div className="mt-6 flex flex-col items-center">
        <Avatar name={profile.user.username} avatar={profile.user.avatar} size={86} className="ring-4 ring-white/40" />
        <div className="mt-3 flex min-w-0 items-center gap-3">
          <span className="truncate text-[16px] font-semibold">{profile.user.username}</span>
          {!isSelf && (
            <RelationshipButton
              relationship={relationship}
              busy={busy}
              onAdd={() => void addFriend()}
              onCancel={() => {
                setRelationship('none')
                onCancelRequestByUser(profile.user.id)
              }}
              onUnfollow={unfollow}
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-around">
        <Stat label="Posts" value={profile.postCount} />
        <button type="button" onClick={() => setShowFriends(true)} className="pressable flex flex-col items-center">
          <Stat label="Friends" value={profile.friendCount} />
        </button>
        <Stat label="Likes" value={profile.likesGained} icon={Heart} />
      </div>

      {error && <p className="mt-3 text-[12px] text-red-500">{error}</p>}

      <div className="mt-6 flex min-h-[120px] flex-col">
        <h2 className="px-1 pb-3 text-[13px] font-semibold text-ink-soft">
          {profile.postCount} {profile.postCount === 1 ? 'post' : 'posts'}
        </h2>
        {profile.posts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-10 text-center">
            <ImageIcon className="h-6 w-6 text-ink-faint" />
            <p className="max-w-[220px] text-[13px] leading-snug text-ink-faint">
              {isSelf ? 'No posts yet. Tap + to share your first dish.' : 'Nothing here yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {profile.posts.map((post) => (
              <div key={post.id} className="relative">
                <button
                  type="button"
                  onClick={() => onOpenPost(post)}
                  className="pressable relative aspect-square w-full overflow-hidden rounded-lg bg-ink/5"
                >
                  {post.image ? (
                    <img src={post.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-ink-soft">
                      {post.title}
                    </span>
                  )}
                  {post.recipe && (
                    <span className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white">
                      <Heart className="h-3 w-3 fill-white" />
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showFriends && (
        <FriendsListModal
          title={`${profile.user.username}'s friends`}
          users={profile.friends}
          isOwn={isSelf}
          onOpenProfile={onOpenProfile}
          onRemove={isSelf ? (userId) => void removeFriendLocal(userId) : undefined}
          onClose={() => setShowFriends(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon?: typeof Heart }) {
  return (
    <div className={cn('flex flex-col items-center', !Icon && 'pointer-events-none')}>
      <span className="flex items-center gap-1 text-[18px] font-bold text-ink">
        {Icon && <Icon className="h-4 w-4 fill-red-500 text-red-500" />}
        {value}
      </span>
      <span className="text-[11px] text-ink-soft">{label}</span>
    </div>
  )
}

function RelationshipButton({
  relationship,
  busy,
  onAdd,
  onCancel,
  onUnfollow,
}: {
  relationship: Relationship
  busy: boolean
  onAdd: () => void
  onCancel: () => void
  onUnfollow: () => void
}) {
  if (relationship === 'friends') {
    return (
      <button type="button" onClick={onUnfollow} className="pressable inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3.5 py-2 text-[13px] font-semibold text-ink-soft">
        <UserMinus className="h-4 w-4" />
        Unfollow
      </button>
    )
  }
  if (relationship === 'pending') {
    return (
      <button type="button" disabled={busy} onClick={onCancel} className="pressable inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3.5 py-2 text-[13px] font-semibold text-ink/70 disabled:opacity-40">
        <X className="h-4 w-4" />
        Cancel request
      </button>
    )
  }
  if (relationship === 'incoming') {
    return <span className="text-[13px] text-ink-soft">Sent you a request</span>
  }
  return (
    <button type="button" disabled={busy} onClick={onAdd} className="pressable inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
      <UserPlus className="h-4 w-4" />
      Add friend
    </button>
  )
}