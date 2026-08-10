import type {
  Comment,
  FridgeItem,
  FriendRequestItem,
  Group,
  GroupMessage,
  Post,
  Preferences,
  Recipe,
  SocialUser,
  UserProfile,
} from './types'
import { compressImageFile } from './image'

export interface DataPayload {
  history: Recipe[]
  saved: Recipe[]
  prefs: Preferences
  fridge: FridgeItem[]
  fridgeMode: boolean
}

export interface AuthUser {
  id: number
  username: string
  avatar: string | null
}

/** Thrown when a request returns 401 (signed out / session expired). */
export class AuthError extends Error {
  constructor(message = 'Not signed in') {
    super(message)
    this.name = 'AuthError'
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<any> {
  const res = await fetch(path, { credentials: 'include', ...init })
  const body = (await parseJson(res)) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`
    if (res.status === 401) throw new AuthError(message)
    throw new Error(message)
  }
  return body
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const api = {
  // ---- Auth ----

  /** Returns the signed-in account, or null. */
  async me(): Promise<AuthUser | null> {
    const body = (await request('/api/auth/me')) as { user?: AuthUser | null }
    return body.user ?? null
  },

  async register(username: string, password: string, securityQuestion: string, securityAnswer: string): Promise<AuthUser> {
    const body = (await request('/api/auth/register', jsonInit('POST', { username, password, security_question: securityQuestion, security_answer: securityAnswer }))) as {
      user?: AuthUser
    }
    if (!body.user) throw new Error('Registration failed')
    return body.user
  },

  async login(username: string, password: string): Promise<AuthUser> {
    const body = (await request('/api/auth/login', jsonInit('POST', { username, password }))) as {
      user?: AuthUser
    }
    if (!body.user) throw new Error('Login failed')
    return body.user
  },

  async logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST' })
  },

  /** Password recovery step 1: fetch the account's security question. */
  async forgot(username: string): Promise<string> {
    const body = (await request('/api/auth/forgot', jsonInit('POST', { username }))) as { question?: string }
    if (typeof body.question !== 'string') throw new Error('No security question found')
    return body.question
  },

  /** Password recovery step 2: verify the answer and set a new password. */
  async reset(username: string, answer: string, newPassword: string): Promise<void> {
    await request('/api/auth/reset', jsonInit('POST', { username, answer, newPassword }))
  },

  /** Update account settings (username and/or password). Returns the refreshed account. */
  async updateProfile(input: { username?: string; currentPassword?: string; newPassword?: string }): Promise<AuthUser> {
    const body = (await request('/api/auth/profile', jsonInit('PUT', input))) as { user?: AuthUser }
    if (!body.user) throw new Error('Profile update failed')
    return body.user
  },

  /** Upload a profile picture; resolves to the resulting URL path. */
  async uploadAvatar(file: File): Promise<string> {
    const compressed = await compressImageFile(file, { maxEdge: 384 })
    const form = new FormData()
    form.append('image', compressed, compressed.name)
    const body = (await request('/api/auth/avatar', { method: 'POST', body: form })) as { avatar?: string }
    if (typeof body.avatar !== 'string') throw new Error('Upload failed')
    return body.avatar
  },

  /** Permanently delete the account and all of its data. */
  async deleteAccount(currentPassword: string): Promise<void> {
    await request('/api/auth/account', jsonInit('DELETE', { currentPassword }))
  },

  /** Full boot payload: history + saved recipes + preferences. */
  fetchData(): Promise<DataPayload> {
    return request('/api/data') as Promise<DataPayload>
  },

  /** Upsert a recipe into history. */
  addRecipe(recipe: Recipe): Promise<DataPayload> {
    return request('/api/recipes', jsonInit('POST', recipe)) as Promise<DataPayload>
  },

  /** Remove a single recipe from history. */
  deleteRecipe(id: string): Promise<unknown> {
    return request(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  /** Clear history but keep bookmarked recipes. */
  clearHistory(): Promise<unknown> {
    return request('/api/recipes', { method: 'DELETE' })
  },

  /** Toggle a recipe's bookmarked state. */
  setSaved(id: string, saved: boolean): Promise<{ saved: Recipe[] }> {
    return request(
      `/api/recipes/${encodeURIComponent(id)}/saved`,
      jsonInit('PUT', { saved }),
    ) as Promise<{ saved: Recipe[] }>
  },

  /** Save taste preferences. */
  savePrefs(prefs: Preferences): Promise<{ prefs: Preferences }> {
    return request('/api/prefs', jsonInit('PUT', prefs)) as Promise<{ prefs: Preferences }>
  },

  /** Save the full fridge inventory. */
  saveFridge(items: FridgeItem[]): Promise<{ fridge: FridgeItem[]; fridgeMode: boolean }> {
    return request('/api/fridge', jsonInit('PUT', { items })) as Promise<{
      fridge: FridgeItem[]
      fridgeMode: boolean
    }>
  },

  /** Toggle whether recipes should be built around the fridge contents. */
  saveFridgeMode(useFridge: boolean): Promise<{ fridge: FridgeItem[]; fridgeMode: boolean }> {
    return request('/api/fridge', jsonInit('PUT', { useFridge })) as Promise<{
      fridge: FridgeItem[]
      fridgeMode: boolean
    }>
  },

  // ---- Social ----

  /** Search users by username; results include our friend status. */
  async socialSearchUsers(q: string): Promise<Array<SocialUser & { status?: string }>> {
    const body = (await request(`/api/social/users?q=${encodeURIComponent(q)}`)) as { users?: Array<SocialUser & { status?: string }> }
    return body.users ?? []
  },

  /** Send a friend request. */
  async socialSendRequest(toUserId: number): Promise<void> {
    await request('/api/social/friend-requests', jsonInit('POST', { toUserId }))
  },

  /** Cancel an outgoing friend request. */
  async socialCancelRequest(requestId: number): Promise<void> {
    await request(`/api/social/friend-requests/${requestId}`, { method: 'DELETE' })
  },

  /** Cancel an outgoing friend request to a user. */
  async socialCancelRequestTo(userId: number): Promise<void> {
    await request(`/api/social/friend-requests/to/${userId}`, { method: 'DELETE' })
  },

  /** Incoming friend requests. */
  async socialIncomingRequests(): Promise<FriendRequestItem[]> {
    const body = (await request('/api/social/friend-requests')) as { requests?: FriendRequestItem[] }
    return body.requests ?? []
  },

  /** Accept an incoming friend request. */
  async socialAcceptRequest(requestId: number): Promise<void> {
    await request(`/api/social/friend-requests/${requestId}/accept`, { method: 'POST' })
  },

  /** Decline an incoming friend request. */
  async socialDeclineRequest(requestId: number): Promise<void> {
    await request(`/api/social/friend-requests/${requestId}/decline`, { method: 'POST' })
  },

  /** Remove a friendship. */
  async socialRemoveFriend(userId: number): Promise<void> {
    await request(`/api/social/friends/${userId}`, { method: 'DELETE' })
  },

  /** My accepted friends. */
  async socialFriends(): Promise<SocialUser[]> {
    const body = (await request('/api/social/friends')) as { friends?: SocialUser[] }
    return body.friends ?? []
  },

  /** A user's profile summary + their posts. */
  async socialProfile(userId: number): Promise<UserProfile> {
    const body = (await request(`/api/social/profile/${userId}`)) as { profile?: UserProfile }
    if (!body.profile) throw new Error('Profile not found')
    return body.profile
  },

  /** Feed: posts from my friends + my own. */
  async socialFeed(): Promise<Post[]> {
    const body = (await request('/api/social/feed')) as { posts?: Post[] }
    return body.posts ?? []
  },

  /** Create a post. */
  async socialCreatePost(input: { recipeId?: string; recipe?: Recipe; title: string; description: string; image: string }): Promise<Post> {
    const body = (await request('/api/social/posts', jsonInit('POST', input))) as { post?: Post }
    if (!body.post) throw new Error('Could not create post')
    return body.post
  },

  /** Upload an image to attach to a post. */
  async socialUploadImage(file: File): Promise<string> {
    const compressed = await compressImageFile(file, { maxEdge: 1280 })
    const form = new FormData()
    form.append('image', compressed, compressed.name)
    const body = (await request('/api/social/posts/image', { method: 'POST', body: form })) as { image?: string }
    if (typeof body.image !== 'string') throw new Error('Upload failed')
    return body.image
  },

  /** Like a post. */
  async socialLike(postId: string): Promise<void> {
    await request(`/api/social/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' })
  },

  /** Unlike a post. */
  async socialUnlike(postId: string): Promise<void> {
    await request(`/api/social/posts/${encodeURIComponent(postId)}/like`, { method: 'DELETE' })
  },

  /** Delete one of my posts. */
  async socialDeletePost(postId: string): Promise<void> {
    await request(`/api/social/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' })
  },

  /** Comments on a post, oldest first. */
  async socialComments(postId: string): Promise<Comment[]> {
    const body = (await request(`/api/social/posts/${encodeURIComponent(postId)}/comments`)) as { comments?: Comment[] }
    return body.comments ?? []
  },

  /** Add a comment to a post. */
  async socialComment(postId: string, text: string): Promise<Comment> {
    const body = (await request(
      `/api/social/posts/${encodeURIComponent(postId)}/comments`,
      jsonInit('POST', { text }),
    )) as { comment?: Comment }
    if (!body.comment) throw new Error('Could not add comment')
    return body.comment
  },

  /** Delete one of my comments (or a comment on my post). */
  async socialDeleteComment(postId: string, commentId: string): Promise<void> {
    await request(`/api/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
  },

  /** Create a group. memberIds must be my friends. */
  async socialCreateGroup(name: string, memberIds: number[]): Promise<Group> {
    const body = (await request('/api/social/groups', jsonInit('POST', { name, memberIds }))) as { group?: Group }
    if (!body.group) throw new Error('Could not create group')
    return body.group
  },

  /** My groups. */
  async socialGroups(): Promise<Group[]> {
    const body = (await request('/api/social/groups')) as { groups?: Group[] }
    return body.groups ?? []
  },

  /** Group detail + members. */
  async socialGroup(id: string): Promise<Group> {
    const body = (await request(`/api/social/groups/${encodeURIComponent(id)}`)) as { group?: Group }
    if (!body.group) throw new Error('Group not found')
    return body.group
  },

  /** Message history for a group. */
  async socialMessages(groupId: string): Promise<GroupMessage[]> {
    const body = (await request(`/api/social/groups/${encodeURIComponent(groupId)}/messages`)) as { messages?: GroupMessage[] }
    return body.messages ?? []
  },

  /** Send a text or recipe message. */
  async socialSendMessage(groupId: string, input: { type: 'text' | 'recipe'; text?: string; recipe?: Recipe; replyTo?: string | null }): Promise<GroupMessage> {
    const body = (await request(
      `/api/social/groups/${encodeURIComponent(groupId)}/messages`,
      jsonInit('POST', { type: input.type, text: input.text, recipe: input.recipe, replyTo: input.replyTo ?? null }),
    )) as { message?: GroupMessage }
    if (!body.message) throw new Error('Could not send message')
    return body.message
  },

  /** Send an image message. */
  async socialSendImage(groupId: string, file: File): Promise<GroupMessage> {
    const compressed = await compressImageFile(file, { maxEdge: 1280 })
    const form = new FormData()
    form.append('image', compressed, compressed.name)
    const body = (await request(`/api/social/groups/${encodeURIComponent(groupId)}/messages/image`, {
      method: 'POST',
      body: form,
    })) as { message?: GroupMessage }
    if (!body.message) throw new Error('Could not send image')
    return body.message
  },

  /** Mark a message (and everything earlier) as read. */
  async socialMarkMessageRead(groupId: string, messageId: string): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/read`, { method: 'POST' })
  },

  /** Edit one of my own text messages. */
  async socialEditMessage(groupId: string, messageId: string, text: string): Promise<GroupMessage> {
    const body = (await request(
      `/api/social/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`,
      jsonInit('PATCH', { text }),
    )) as { message?: GroupMessage }
    if (!body.message) throw new Error('Could not edit message')
    return body.message
  },

  /** Soft-delete a message for everyone (sender or admin). */
  async socialDeleteMessage(groupId: string, messageId: string): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' })
  },

  /** Members currently typing in the group (excluding nobody; client filters itself). */
  async socialTyping(groupId: string): Promise<SocialUser[]> {
    const body = (await request(`/api/social/groups/${encodeURIComponent(groupId)}/typing`)) as { typing?: SocialUser[] }
    return body.typing ?? []
  },

  /** Publish (or clear) my typing heartbeat. */
  async socialSendTyping(groupId: string, typing: boolean): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/typing`, jsonInit('POST', { typing }))
  },

  /** Admin: rename the group and/or set its avatar. */
  async socialRenameGroup(groupId: string, input: { name?: string; avatar?: string | null }): Promise<Group> {
    const body = (await request(
      `/api/social/groups/${encodeURIComponent(groupId)}`,
      jsonInit('PATCH', input),
    )) as { group?: Group }
    if (!body.group) throw new Error('Could not update group')
    return body.group
  },

  /** Admin: upload a group avatar. */
  async socialUploadGroupAvatar(groupId: string, file: File): Promise<Group> {
    const compressed = await compressImageFile(file, { maxEdge: 384 })
    const form = new FormData()
    form.append('image', compressed, compressed.name)
    const body = (await request(`/api/social/groups/${encodeURIComponent(groupId)}/avatar`, { method: 'POST', body: form })) as { group?: Group }
    if (!body.group) throw new Error('Could not update group avatar')
    return body.group
  },

  /** Owner: transfer ownership to another group admin. */
  async socialTransferOwner(groupId: string, userId: number): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/owner`, jsonInit('POST', { userId }))
  },

  /** Owner: permanently delete the group and its messages. */
  async socialDeleteGroup(groupId: string): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
  },

  /** Leave a group (owners must delete or transfer instead). */
  async socialLeaveGroup(groupId: string): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/leave`, { method: 'POST' })
  },

  /** Admin: add a member. */
  async socialAddMember(groupId: string, userId: number): Promise<Group> {
    const body = (await request(
      `/api/social/groups/${encodeURIComponent(groupId)}/members`,
      jsonInit('POST', { userId }),
    )) as { group?: Group }
    if (!body.group) throw new Error('Could not add member')
    return body.group
  },

  /** Admin: remove a member. */
  async socialRemoveMember(groupId: string, userId: number): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/members/${userId}`, { method: 'DELETE' })
  },

  /** Admin: promote a member to admin. */
  async socialPromoteAdmin(groupId: string, userId: number): Promise<void> {
    await request(`/api/social/groups/${encodeURIComponent(groupId)}/admins`, jsonInit('POST', { userId }))
  },
}