import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { FriendRequestItem, Group, Post, SocialUser } from './types'

/**
 * Social area state: feed, groups, friends and incoming friend requests.
 *
 * Only loads when `active` (a signed-in user is present). Profile pages and
 * group chats fetch on demand inside their own components.
 */
export function useSocial(active = true, options?: { poll?: boolean }) {
  const [feed, setFeed] = useState<Post[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [friends, setFriends] = useState<SocialUser[]>([])
  const [requests, setRequests] = useState<FriendRequestItem[]>([])
  const [loading, setLoading] = useState(active)
  const [error, setError] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    setFeed(await api.socialFeed())
  }, [])

  const loadGroups = useCallback(async () => {
    setGroups(await api.socialGroups())
  }, [])

  const loadFriends = useCallback(async () => {
    setFriends(await api.socialFriends())
  }, [])

  const loadRequests = useCallback(async () => {
    setRequests(await api.socialIncomingRequests())
  }, [])

  const refresh = useCallback(async () => {
    if (!active) return
    setError(null)
    try {
      await Promise.all([loadFeed(), loadGroups(), loadFriends(), loadRequests()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Social')
    } finally {
      setLoading(false)
    }
  }, [active, loadFeed, loadGroups, loadFriends, loadRequests])

  const updateFeed = useCallback((updater: (prev: Post[]) => Post[]) => {
    setFeed(updater)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Keep follows, requests, and feed (posts + like/comment counts) fresh while
  // the Social tab is open. Comments poll inside CommentsSection themselves.
  useEffect(() => {
    if (!active || !options?.poll) return
    const timer = window.setInterval(() => void refresh(), 1_000)
    return () => window.clearInterval(timer)
  }, [active, options?.poll, refresh])

  /** Toggle a like, optimistically. */
  const toggleLike = useCallback(
    async (post: Post) => {
      const liked = !post.liked
      updateFeed((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, liked, likes: p.likes + (liked ? 1 : -1) } : p)),
      )
      try {
        if (liked) await api.socialLike(post.id)
        else await api.socialUnlike(post.id)
      } catch {
        updateFeed((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, liked: !liked, likes: p.likes + (liked ? -1 : 1) } : p)),
        )
      }
    },
    [updateFeed],
  )

  const deletePost = useCallback(
    async (postId: string) => {
      updateFeed((prev) => prev.filter((p) => p.id !== postId))
      try {
        await api.socialDeletePost(postId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete post')
        void refresh()
      }
    },
    [refresh, updateFeed],
  )

  /** Append or update a single post (used after creating a post). */
  const prependPost = useCallback((post: Post) => {
    setFeed((prev) => [post, ...prev.filter((p) => p.id !== post.id)])
  }, [])

  /** Optimistically adjust a post's comment count (used after adding/removing a comment). */
  const bumpComments = useCallback((postId: string, delta = 1) => {
    updateFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: Math.max(0, p.comments + delta) } : p)))
  }, [updateFeed])

  const sendRequest = useCallback(
    async (userId: number) => {
      try {
        await api.socialSendRequest(userId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send request')
        throw err
      }
    },
    [],
  )

  const cancelRequest = useCallback(
    async (requestId: number) => {
      try {
        await api.socialCancelRequest(requestId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not cancel request')
      }
    },
    [],
  )

  const cancelRequestByUser = useCallback(
    async (userId: number) => {
      try {
        await api.socialCancelRequestTo(userId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not cancel request')
      }
    },
    [],
  )

  const acceptRequest = useCallback(
    async (requestId: number) => {
      try {
        await api.socialAcceptRequest(requestId)
        setRequests((prev) => prev.filter((r) => r.id !== requestId))
        await loadFriends()
        await loadFeed()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not accept request')
      }
    },
    [loadFeed, loadFriends],
  )

  const declineRequest = useCallback(
    async (requestId: number) => {
      try {
        await api.socialDeclineRequest(requestId)
        setRequests((prev) => prev.filter((r) => r.id !== requestId))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not decline request')
      }
    },
    [],
  )

  const removeFriend = useCallback(
    async (userId: number) => {
      setFriends((prev) => prev.filter((f) => f.id !== userId))
      try {
        await api.socialRemoveFriend(userId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not remove friend')
        await loadFriends()
      }
    },
    [loadFriends],
  )

  const createGroup = useCallback(
    async (name: string, memberIds: number[]) => {
      const group = await api.socialCreateGroup(name, memberIds)
      setGroups((prev) => [group, ...prev])
      return group
    },
    [],
  )

  /** Optimistically zero a group's unread badge (kept at zero by the server once read). */
  const clearUnread = useCallback((groupId: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g)))
  }, [])

  return {
    feed,
    groups,
    friends,
    requests,
    loading,
    error,
    setError,
    refresh,
    toggleLike,
    deletePost,
    prependPost,
    bumpComments,
    sendRequest,
    cancelRequest,
    cancelRequestByUser,
    acceptRequest,
    declineRequest,
    removeFriend,
    createGroup,
    clearUnread,
  }
}

export type Social = ReturnType<typeof useSocial>