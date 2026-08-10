import { useMemo, useState } from 'react'
import { MessageCircle, Plus, Search, Users } from 'lucide-react'
import type { AuthUser } from '@/lib/api'
import type { Group, Post, Recipe, SocialUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { CreateGroupModal } from './CreateGroupModal'
import { CreatePostModal } from './CreatePostModal'
import { FeedView } from './FeedView'
import { GroupChatView } from './GroupChatView'
import { GroupSettingsView } from './GroupSettingsView'
import { GroupsView } from './GroupsView'
import { PostDetailView } from './PostDetailView'
import { SearchUsersModal } from './SearchUsersModal'
import { SocialProfile } from './SocialProfile'
import type { Social } from '@/lib/useSocial'

interface SocialViewProps {
  me: AuthUser | null
  saved: Recipe[]
  history: Recipe[]
  social: Social
  onOpenRecipe: (recipe: Recipe) => void
}

type View = { name: 'root' } | { name: 'profile'; userId: number } | { name: 'group'; group: Group } | { name: 'groupSettings'; group: Group } | { name: 'post'; post: Post; from: View }

export function SocialView({ me, saved, history, social, onOpenRecipe }: SocialViewProps) {
  const [view, setView] = useState<View>({ name: 'root' })
  const [section, setSection] = useState<'feed' | 'groups'>('feed')
  const [searchOpen, setSearchOpen] = useState(false)
  const [createPostOpen, setCreatePostOpen] = useState(false)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)

  const friendIds = useMemo(() => new Set(social.friends.map((f) => f.id)), [social.friends])

  const openProfile = (user: SocialUser) => setView({ name: 'profile', userId: user.id })
  const openOwnProfile = () => me && setView({ name: 'profile', userId: me.id })
  const openPost = (post: Post) => setView({ name: 'post', post, from: view })

  if (view.name === 'post' && me) {
    return (
      <PostDetailView
        post={view.post}
        me={me}
        onBack={() => setView(view.from)}
        onOpenProfile={openProfile}
        onOpenRecipe={onOpenRecipe}
        onToggleLike={social.toggleLike}
        onDelete={(post) => {
          void social.deletePost(post.id)
          setView(view.from)
        }}
        onCommentAdded={() => social.bumpComments(view.post.id)}
        onCommentDeleted={() => social.bumpComments(view.post.id, -1)}
      />
    )
  }

  if (view.name === 'profile') {
    return (
      <>
        <SocialProfile
          key={view.userId}
          userId={view.userId}
          me={me}
          friendIds={friendIds}
          onOpenPost={openPost}
          onOpenProfile={openProfile}
          onOpenCreatePost={() => setCreatePostOpen(true)}
          onBack={() => setView({ name: 'root' })}
          onSend={social.sendRequest}
          onCancelRequestByUser={social.cancelRequestByUser}
          onRemoveFriend={social.removeFriend}
        />
        {createPostOpen && (
          <CreatePostModal
            saved={saved}
            history={history}
            onCreated={(post) => {
              social.prependPost(post)
              setCreatePostOpen(false)
            }}
            onClose={() => setCreatePostOpen(false)}
          />
        )}
      </>
    )
  }

  if (view.name === 'group' && me) {
    return (
      <>
        <GroupChatView
          groupId={view.group.id}
          meId={me.id}
          saved={saved}
          history={history}
          onBack={() => setView({ name: 'root' })}
          onOpenSettings={() => setView({ name: 'groupSettings', group: view.group })}
          onOpenRecipe={onOpenRecipe}
          onOpenProfile={openProfile}
        />
        {createPostOpen && (
          <CreatePostModal saved={saved} history={history} onCreated={(post) => { social.prependPost(post); setCreatePostOpen(false) }} onClose={() => setCreatePostOpen(false)} />
        )}
      </>
    )
  }

  if (view.name === 'groupSettings' && me) {
    return (
      <GroupSettingsView
        groupId={view.group.id}
        meId={me.id}
        friends={social.friends}
        onBack={() => setView({ name: 'group', group: view.group })}
        onExit={() => setView({ name: 'root' })}
        onOpenProfile={openProfile}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col pb-10">
      <header className="flex items-center justify-between pt-1">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-tight">Social</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">Cooking is better together</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Find people"
            onClick={() => setSearchOpen(true)}
            className="pressable relative flex h-12 w-12 items-center justify-center rounded-full glass-strong text-ink"
          >
            <Search className="h-5 w-5" strokeWidth={1.8} />
            {social.requests.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {social.requests.length}
              </span>
            )}
          </button>
          <button type="button" onClick={openOwnProfile} aria-label="Your profile" className="pressable flex h-12 w-12 items-center justify-center overflow-hidden rounded-full glass-strong">
            <Avatar name={me?.username} avatar={me?.avatar} size={48} />
          </button>
        </div>
      </header>

      <GlassSegmented className="mt-5 flex items-center gap-1 p-1">
        <SegmentedButton icon={<Users className="h-4 w-4" />} label="Feed" active={section === 'feed'} onClick={() => setSection('feed')} />
        <SegmentedButton icon={<MessageCircle className="h-4 w-4" />} label="Groups" active={section === 'groups'} onClick={() => setSection('groups')} />
      </GlassSegmented>

      <div className="mt-5 flex-1">
        {section === 'feed' ? (
          me ? (
            <FeedView
              posts={social.feed}
              me={me}
              onOpenProfile={openProfile}
              onOpenRecipe={onOpenRecipe}
              onOpenPost={openPost}
              onToggleLike={social.toggleLike}
              onDelete={(post) => void social.deletePost(post.id)}
              onCommentAdded={(postId) => social.bumpComments(postId)}
              onCommentDeleted={(postId) => social.bumpComments(postId, -1)}
            />
          ) : null
        ) : (
          <GroupsView groups={social.groups} onOpenGroup={(group) => { social.clearUnread(group.id); setView({ name: 'group', group }) }} />
        )}
      </div>

      {section === 'feed' && me && (
        <button
          type="button"
          aria-label="New post"
          onClick={() => setCreatePostOpen(true)}
          className="pressable absolute right-5 z-20 bottom-[calc(max(env(safe-area-inset-bottom),14px)+86px)] glass-strong flex h-14 w-14 items-center justify-center rounded-full text-ink shadow-[var(--shadow-glass)]"
        >
          <Plus className="h-6 w-6" strokeWidth={2.2} />
        </button>
      )}

      {section === 'groups' && (
        <button
          type="button"
          aria-label="New group"
          onClick={() => setCreateGroupOpen(true)}
          className="pressable absolute right-5 z-20 bottom-[calc(max(env(safe-area-inset-bottom),14px)+86px)] glass-strong flex h-14 w-14 items-center justify-center rounded-full text-ink shadow-[var(--shadow-glass)]"
        >
          <Plus className="h-6 w-6" strokeWidth={2.2} />
        </button>
      )}

      {searchOpen && (
        <SearchUsersModal
          me={me}
          friendIds={friendIds}
          requests={social.requests}
          onAccept={social.acceptRequest}
          onDecline={social.declineRequest}
          onSend={social.sendRequest}
          onCancelRequest={social.cancelRequestByUser}
          onOpenProfile={openProfile}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {createPostOpen && (
        <CreatePostModal
          saved={saved}
          history={history}
          onCreated={(post) => {
            social.prependPost(post)
            setCreatePostOpen(false)
          }}
          onClose={() => setCreatePostOpen(false)}
        />
      )}

      {createGroupOpen && (
        <CreateGroupModal
          friends={social.friends}
          onCreate={async (name, ids) => {
            await social.createGroup(name, ids)
          }}
          onClose={() => setCreateGroupOpen(false)}
        />
      )}
    </div>
  )
}

function GlassSegmented({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('glass-strong rounded-full shadow-[var(--shadow-glass)]', className)}>{children}</div>
}

function SegmentedButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors',
        active ? 'bg-white/90 text-ink shadow-[0_2px_10px_rgba(0,0,0,0.1)]' : 'text-ink-soft',
      )}
    >
      {icon}
      {label}
    </button>
  )
}