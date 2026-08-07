import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Preferences, Recipe } from './types'

const HISTORY_KEY = 'foody.history.v1'
const SAVED_KEY = 'foody.saved.v1'
const PREFS_KEY = 'foody.prefs.v1'

const EMPTY_PREFS: Preferences = { likes: [], dislikes: [], lastSpeech: '' }

function readList(key: string): Recipe[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Recipe[]) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: Recipe[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // storage unavailable — ignore
  }
}

function readPrefs(): Preferences {
  if (typeof window === 'undefined') return EMPTY_PREFS
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return EMPTY_PREFS
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      likes: Array.isArray(parsed.likes) ? parsed.likes.filter((v): v is string => typeof v === 'string') : [],
      dislikes: Array.isArray(parsed.dislikes)
        ? parsed.dislikes.filter((v): v is string => typeof v === 'string')
        : [],
      lastSpeech: typeof parsed.lastSpeech === 'string' ? parsed.lastSpeech : '',
    }
  } catch {
    return EMPTY_PREFS
  }
}

function writePrefs(prefs: Preferences) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — ignore
  }
}

/** Simple reactive localStorage store for history + saved recipes. */
export function useFoodyStore() {
  const [history, setHistory] = useState<Recipe[]>(() => readList(HISTORY_KEY))
  const [saved, setSaved] = useState<Recipe[]>(() => readList(SAVED_KEY))
  const [prefs, setPrefs] = useState<Preferences>(() => readPrefs())

  useEffect(() => writeList(HISTORY_KEY, history), [history])
  useEffect(() => writeList(SAVED_KEY, saved), [saved])

  const savedIds = useMemo(() => new Set(saved.map((recipe) => recipe.id)), [saved])

  const addToHistory = useCallback((recipe: Recipe) => {
    setHistory((prev) => [recipe, ...prev.filter((item) => item.id !== recipe.id)].slice(0, 30))
  }, [])

  const toggleSaved = useCallback((recipe: Recipe) => {
    setSaved((prev) =>
      prev.some((item) => item.id === recipe.id)
        ? prev.filter((item) => item.id !== recipe.id)
        : [recipe, ...prev],
    )
  }, [])

  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearHistory = useCallback(() => setHistory([]), [])

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds])

  useEffect(() => writePrefs(prefs), [prefs])

  const setPreferences = useCallback((next: Preferences) => {
    setPrefs(next)
  }, [])

  const removePreference = useCallback((list: 'likes' | 'dislikes', item: string) => {
    setPrefs((prev) => ({ ...prev, [list]: prev[list].filter((entry) => entry !== item) }))
  }, [])

  return {
    history,
    saved,
    prefs,
    isSaved,
    addToHistory,
    toggleSaved,
    removeFromHistory,
    clearHistory,
    setPreferences,
    removePreference,
  }
}

export type FoodyStore = ReturnType<typeof useFoodyStore>