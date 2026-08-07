import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FridgeItem, Preferences, Recipe } from './types'
import { api } from './api'

const EMPTY_PREFS: Preferences = { likes: [], dislikes: [], lastSpeech: '' }
const HISTORY_LIMIT = 30

/**
 * Backend-backed store for history + saved recipes + preferences.
 *
 * When `active` is false (guest / not signed in), all state is kept in memory
 * for the session only — no API calls are made and nothing is persisted.
 */
export function useFoodyStore(active = true) {
  const [history, setHistory] = useState<Recipe[]>([])
  const [saved, setSaved] = useState<Recipe[]>([])
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS)
  const [fridge, setFridgeState] = useState<FridgeItem[]>([])
  const [fridgeMode, setFridgeModeState] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setLoading(false)
      return
    }
    let alive = true
    api
      .fetchData()
      .then((data) => {
        if (!alive) return
        if (Array.isArray(data.history)) setHistory(data.history)
        if (Array.isArray(data.saved)) setSaved(data.saved)
        if (data.prefs) setPrefs(data.prefs)
        if (Array.isArray(data.fridge)) setFridgeState(data.fridge)
        if (typeof data.fridgeMode === 'boolean') setFridgeModeState(data.fridgeMode)
      })
      .catch(async () => {
        if (!alive) return
        setError('Could not load your data')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [active])

  const savedIds = useMemo(() => new Set(saved.map((recipe) => recipe.id)), [saved])

  const addToHistory = useCallback((recipe: Recipe) => {
    setHistory((prev) => [recipe, ...prev.filter((item) => item.id !== recipe.id)].slice(0, HISTORY_LIMIT))
    if (!active) return
    void api.addRecipe(recipe).then((data) => {
      if (Array.isArray(data.history)) setHistory(data.history)
      if (Array.isArray(data.saved)) setSaved(data.saved)
    })
  }, [active])

  const toggleSaved = useCallback((recipe: Recipe) => {
    const currentlySaved = savedIds.has(recipe.id)
    setSaved((prev) =>
      currentlySaved
        ? prev.filter((item) => item.id !== recipe.id)
        : [recipe, ...prev.filter((item) => item.id !== recipe.id)],
    )
    if (!active) return
    void api.setSaved(recipe.id, !currentlySaved).then((data) => {
      if (Array.isArray(data.saved)) setSaved(data.saved)
    })
  }, [savedIds, active])

  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id))
    if (!active) return
    void api.deleteRecipe(id)
  }, [active])

  const updateRecipeImage = useCallback((id: string, image: string) => {
    setHistory((prev) => prev.map((item) => (item.id === id ? { ...item, image } : item)))
    setSaved((prev) => prev.map((item) => (item.id === id ? { ...item, image } : item)))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    if (!active) return
    void api.clearHistory()
  }, [active])

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds])

  const setPreferences = useCallback((next: Preferences) => {
    setPrefs(next)
    if (!active) return
    void api.savePrefs(next)
  }, [active])

  const removePreference = useCallback((list: 'likes' | 'dislikes', item: string) => {
    setPrefs((prev) => {
      const next = { ...prev, [list]: prev[list].filter((entry) => entry !== item) }
      if (active) void api.savePrefs(next)
      return next
    })
  }, [active])

  const setFridge = useCallback((next: FridgeItem[]) => {
    setFridgeState(next)
    if (!active) return
    void api.saveFridge(next).then((data) => {
      if (Array.isArray(data.fridge)) setFridgeState(data.fridge)
      if (typeof data.fridgeMode === 'boolean') setFridgeModeState(data.fridgeMode)
    })
  }, [active])

  const setFridgeMode = useCallback((on: boolean) => {
    setFridgeModeState(on)
    if (!active) return
    void api.saveFridgeMode(on).then((data) => {
      if (typeof data.fridgeMode === 'boolean') setFridgeModeState(data.fridgeMode)
    })
  }, [active])

  return {
    history,
    saved,
    prefs,
    fridge,
    fridgeMode,
    loading,
    error,
    isSaved,
    addToHistory,
    toggleSaved,
    removeFromHistory,
    clearHistory,
    updateRecipeImage,
    setPreferences,
    removePreference,
    setFridge,
    setFridgeMode,
  }
}

export type FoodyStore = ReturnType<typeof useFoodyStore>