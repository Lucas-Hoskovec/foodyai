import { useCallback, useEffect, useState } from 'react'
import { api, AuthError, type AuthUser } from './api'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

/** Session state for the current device. */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [justRegistered, setJustRegistered] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .me()
      .then((current) => {
        if (!alive) return
        setUser(current)
        setStatus(current ? 'signedIn' : 'signedOut')
      })
      .catch(() => {
        if (!alive) return
        setUser(null)
        setStatus('signedOut')
      })
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const next = await api.login(username, password)
    setUser(next)
    setStatus('signedIn')
    setJustRegistered(false)
    return next
  }, [])

  const register = useCallback(async (username: string, password: string, securityQuestion: string, securityAnswer: string) => {
    const next = await api.register(username, password, securityQuestion, securityAnswer)
    setUser(next)
    setStatus('signedIn')
    setJustRegistered(true)
    return next
  }, [])

  const updateProfile = useCallback(async (input: { username?: string; currentPassword?: string; newPassword?: string }) => {
    const next = await api.updateProfile(input)
    setUser(next)
    return next
  }, [])

  const updateAvatar = useCallback(async (file: File) => {
    const avatar = await api.uploadAvatar(file)
    setUser((prev) => (prev ? { ...prev, avatar } : prev))
    return avatar
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch (error) {
      if (!(error instanceof AuthError)) throw error
    }
    setUser(null)
    setStatus('signedOut')
    setJustRegistered(false)
  }, [])

  /** Delete the account server-side, then sign out on this device. */
  const deleteAccount = useCallback(async (currentPassword: string) => {
    await api.deleteAccount(currentPassword)
    setUser(null)
    setStatus('signedOut')
    setJustRegistered(false)
  }, [])

  return { status, user, login, register, logout, deleteAccount, updateProfile, updateAvatar, justRegistered }
}

export type Auth = ReturnType<typeof useAuth>