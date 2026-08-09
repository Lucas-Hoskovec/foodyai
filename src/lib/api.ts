import type { FridgeItem, Preferences, Recipe } from './types'
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

  /** Upload a recipe photo; resolves to the resulting URL path. */
  async uploadRecipeImage(id: string, file: File): Promise<string> {
    const compressed = await compressImageFile(file, { maxEdge: 1080 })
    const form = new FormData()
    form.append('image', compressed, compressed.name)
    const body = (await request(`/api/recipes/${encodeURIComponent(id)}/image`, {
      method: 'POST',
      body: form,
    })) as { image?: string }
    if (typeof body.image !== 'string') throw new Error('Upload failed')
    return body.image
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
}