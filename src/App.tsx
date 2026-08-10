import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Clock, LogIn, Mic as MicIcon, RotateCcw, Send, Sparkles, Trash2, Users } from 'lucide-react'
import type { FridgeItem, Phase, Recipe, Tab } from '@/lib/types'
import { useVoice } from '@/lib/voice'
import { parseIntent, generateRecipe, updatePreferences, updateFridge } from '@/lib/nim'
import { useFoodyStore } from '@/lib/store'
import { useSocial } from '@/lib/useSocial'
import { findRecipeImage } from '@/lib/recipeImage'
import { useAuth, type Auth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/TabBar'
import { GlassCard } from '@/components/GlassCard'
import { RecipePage } from '@/components/RecipePage'
import { EmptyState } from '@/components/EmptyState'
import { RecipeListItem } from '@/components/RecipeListItem'
import { ProfileView } from '@/components/ProfileView'
import { AuthScreen } from '@/components/AuthScreen'
import { ProfileMenu } from '@/components/ProfileMenu'
import { ProfileSettings } from '@/components/ProfileSettings'
import { FridgeView } from '@/components/FridgeView'
import { FridgeAddModal } from '@/components/FridgeAddModal'
import { FridgePhotoScanner } from '@/components/FridgePhotoScanner'
import { TasteSetupModal } from '@/components/TasteSetupModal'
import { SocialView } from '@/components/SocialView'
import { Switch } from '@/components/Switch'

const EXAMPLE_POOL = [
  'Spicy chicken',
  'Pasta in 20 min',
  'Veggie soup',
  'Chicken + lemon',
  'Creamy garlic pasta',
  'Cheeseburger cravings',
  'Spicy shrimp tacos',
  'Cozy tomato soup',
  'Egg fried rice',
  'Loaded sweet potato',
  'Crispy tofu stir-fry',
  'Pepperoni pizza',
  'Banana pancakes',
  'Lemon drizzle cake',
  'Garlic butter steak',
  'Butternut squash curry',
]

/** Pick a random subset of example chips for the home screen. */
function pickExamples(count = 4): string[] {
  const pool = [...EXAMPLE_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

function BackgroundGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,#ffd9c4_0%,rgba(255,217,196,0)_70%)] [animation:drift_18s_ease-in-out_infinite]" />
      <div className="absolute right-[-12%] top-[25%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_center,#cfe6ff_0%,rgba(207,230,255,0)_70%)] [animation:drift_22s_ease-in-out_infinite_reverse]" />
      <div className="absolute bottom-[-15%] left-[10%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,#f6e0c9_0%,rgba(246,224,201,0)_70%)] [animation:drift_20s_ease-in-out_2s_infinite]" />
    </div>
  )
}

function App() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface">
        <span className="h-8 w-8 rounded-full border-2 border-ink/20 border-t-ink/70 [animation:spin_0.8s_linear_infinite]" />
      </div>
    )
  }

  // Guests (not signed in) still get the full app with ephemeral session data.
  return <AppShell key={auth.user?.id ?? 'guest'} auth={auth} />
}

function AppShell({ auth }: { auth: Auth }) {
  const user = auth.user
  const justRegistered = Boolean(auth.justRegistered)
  const [tab, setTab] = useState<Tab>(justRegistered ? 'me' : 'home')
  const store = useFoodyStore(Boolean(user))
  const social = useSocial(Boolean(user), { poll: tab === 'social' })

  const [phase, setPhase] = useState<Phase>('idle')
  const [setupOpen, setSetupOpen] = useState(justRegistered)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [examples] = useState<string[]>(() => pickExamples())
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [returnTab, setReturnTab] = useState<Tab>('home')
  const [error, setError] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileQuery, setProfileQuery] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authInitial, setAuthInitial] = useState<'login' | 'register'>('login')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fridgeOpen, setFridgeOpen] = useState(false)
  const [fridgeBusy, setFridgeBusy] = useState(false)
  const [fridgeError, setFridgeError] = useState<string | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const busyRef = useRef(false)
  const profileBusyRef = useRef(false)
  const fridgeBusyRef = useRef(false)
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => {})
  const profileSubmitRef = useRef<(raw: string) => Promise<void>>(async () => {})
  const fridgeSubmitRef = useRef<(raw: string) => Promise<void>>(async () => {})
  const voice = useVoice({
    onFinal: (transcript) => {
      if (tabRef.current === 'me') void profileSubmitRef.current(transcript)
      else if (tabRef.current === 'fridge') void fridgeSubmitRef.current(transcript)
      else void submitRef.current(transcript)
    },
  })
  const tabRef = useRef(tab)
  tabRef.current = tab

  // Keep the "Researching recipes…" timer running across tab switches until the recipe lands.
  useEffect(() => {
    if (phase !== 'thinking') return
    const ticker = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(ticker)
  }, [phase])

  const runFlow = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed || busyRef.current) return
      busyRef.current = true
      setPhase('thinking')
      setElapsed(0)
      setError(null)
      setQuery(trimmed)

      try {
        const intent = await parseIntent(
          trimmed,
          store.prefs,
          store.fridgeMode && store.fridge.length > 0 ? store.fridge : undefined,
        )
        const imagePromise = findRecipeImage({ title: intent.dish, searchTerm: intent.searchTerm })
        const result = await generateRecipe(
          intent,
          store.prefs,
          store.fridgeMode && store.fridge.length > 0 ? store.fridge : undefined,
        )

        if (!result.steps.length || !result.ingredients.length) {
          throw new Error('That dish came back incomplete. Try rephrasing it.')
        }
        let image = await imagePromise
        if (!image && result.title.trim() !== intent.dish.trim()) {
          image = await findRecipeImage({ title: result.title, searchTerm: intent.searchTerm })
        }
        if (image) {
          result.image = image.image
          result.imageCredit = image.credit
        }
        result.query = trimmed
        store.addToHistory(result)
        setRecipe(result)
        setReturnTab('home')
        setTab('home')
        setPhase('recipe')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setPhase('idle')
      } finally {
        busyRef.current = false
      }
    },
    [store],
  )

  submitRef.current = runFlow

  const runProfileUpdate = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed || profileBusyRef.current) return
      profileBusyRef.current = true
      setProfileBusy(true)
      setProfileError(null)
      setProfileQuery(trimmed)
      try {
        const updated = await updatePreferences(trimmed, store.prefs)
        store.setPreferences({ ...updated, lastSpeech: trimmed })
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : 'Could not update your taste profile')
      } finally {
        profileBusyRef.current = false
        setProfileBusy(false)
      }
    },
    [store],
  )

  profileSubmitRef.current = runProfileUpdate

  const runFridgeUpdate = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed || fridgeBusyRef.current) return
      fridgeBusyRef.current = true
      setFridgeBusy(true)
      setFridgeError(null)
      try {
        const updated = await updateFridge(trimmed, store.fridge)
        store.setFridge(updated)
        setFridgeOpen(false)
      } catch (err) {
        setFridgeError(err instanceof Error ? err.message : 'Could not update your fridge')
      } finally {
        fridgeBusyRef.current = false
        setFridgeBusy(false)
      }
    },
    [store],
  )

  fridgeSubmitRef.current = runFridgeUpdate

  const onFridgeMicPress = useCallback(() => {
    if (fridgeBusy || !voice.supported) return
    if (voice.isListening) {
      voice.stop()
      return
    }
    setFridgeError(null)
    voice.start()
  }, [fridgeBusy, voice])

  const closeFridge = useCallback(() => {
    if (voice.isListening) voice.stop()
    setFridgeOpen(false)
    setFridgeError(null)
  }, [voice])

  const openPhotoScanner = useCallback((file: File) => {
    if (voice.isListening) voice.stop()
    setFridgeOpen(false)
    setFridgeError(null)
    setScanFile(file)
    setScanOpen(true)
  }, [voice])

  const saveScannedItems = useCallback(
    (scanned: FridgeItem[]) => {
      const existing = store.fridge
      const byName = new Map(existing.map((item) => [item.name.toLowerCase(), item]))
      for (const item of scanned) {
        byName.set(item.name.toLowerCase(), item)
      }
      store.setFridge([...byName.values()].slice(0, 60))
      setScanOpen(false)
      setScanFile(null)
    },
    [store],
  )

  const closeScan = useCallback(() => {
    setScanOpen(false)
    setScanFile(null)
  }, [])

  const closeSetup = useCallback(() => {
    if (voice.isListening) voice.stop()
    setSetupOpen(false)
  }, [voice])

  const onProfileMicPress = useCallback(() => {
    if (phase === 'thinking' || !voice.supported) return
    if (voice.isListening) {
      voice.stop()
      return
    }
    setProfileError(null)
    voice.start()
  }, [phase, voice])

  const onMicPress = useCallback(() => {
    if (phase === 'thinking' || !voice.supported) return
    if (phase === 'listening') {
      voice.stop()
      return
    }
    setError(null)
    setText('')
    setPhase('listening')
    voice.start()
  }, [phase, voice])

  const openRecipe = useCallback(
    (r: Recipe) => {
      setRecipe(r)
      setReturnTab(tab)
      setPhase('recipe')
    },
    [tab],
  )

  const closeRecipe = useCallback(() => {
    setPhase('idle')
    setTab(returnTab)
    setRecipe(null)
  }, [returnTab])

  const submitTyped = useCallback(() => {
    if (text.trim()) void runFlow(text)
  }, [text, runFlow])

  return (
    <div className="relative h-full overflow-hidden bg-surface text-ink">
      <BackgroundGlow />

      {phase === 'recipe' && recipe ? (
        <RecipePage
          recipe={recipe}
          isSaved={store.isSaved(recipe.id)}
          onBack={closeRecipe}
          onToggleSave={() => store.toggleSaved(recipe)}
          onImageUploaded={(updated) => {
            store.updateRecipeImage(updated.id, updated.image)
            setRecipe(updated)
          }}
        />
      ) : (
        <main className="relative z-10 mx-auto flex h-full max-w-md flex-col px-5 pb-32 pt-[max(env(safe-area-inset-top),22px)]">
          {tab !== 'social' && (
            <header className="flex items-center justify-between">
              <span className="text-lg font-bold tracking-tight">Foody AI</span>
              <ProfileMenu
                user={user}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenProfile={() => setTab('me')}
                onOpenAuth={(mode = 'login') => {
                  setAuthInitial(mode)
                  setAuthOpen(true)
                }}
                onLogout={() => void auth.logout()}
              />
            </header>
          )}

          <div className={cn('flex-1 overflow-y-auto no-scrollbar', tab === 'social' ? 'mt-2' : 'mt-6')}>
            {tab === 'home' && (
              <>
                {!user && <GuestBanner onSignIn={() => setAuthOpen(true)} />}
                <HomeView
                  phase={phase}
                  voiceSupported={voice.supported}
                  listening={phase === 'listening'}
                  text={text}
                  displayTranscript={voice.transcript || text}
                  error={error}
                  query={query}
                  examples={examples}
                  fridgeMode={store.fridgeMode}
                  onToggleFridgeMode={store.setFridgeMode}
                  onTextChange={setText}
                  onSubmit={submitTyped}
                  onMicPress={onMicPress}
                  onRetry={() => void runFlow(query)}
                  elapsed={elapsed}
                />
              </>
            )}

            {tab === 'me' && (
              <ProfileView
                username={user?.username ?? 'Guest'}
                avatar={user?.avatar ?? null}
                likes={store.prefs.likes}
                dislikes={store.prefs.dislikes}
                lastSpeech={store.prefs.lastSpeech}
                voiceSupported={voice.supported}
                listening={voice.isListening}
                transcript={voice.transcript}
                busy={profileBusy}
                error={profileError}
                onMicPress={onProfileMicPress}
                onSubmitText={(raw) => void runProfileUpdate(raw)}
                onRetry={() => void runProfileUpdate(profileQuery)}
                onRemove={(list, item) => store.removePreference(list, item)}
              />
            )}

{tab === 'fridge' && (
              <FridgeView
                items={store.fridge}
                onOpenAdd={() => {
                  setFridgeOpen(true)
                  setFridgeError(null)
                }}
                onChange={store.setFridge}
              />
            )}

            {tab === 'social' &&
              (user ? (
                <SocialView
                  me={user}
                  saved={store.saved}
                  history={store.history}
                  social={social}
                  onOpenRecipe={openRecipe}
                />
              ) : (
                <div className="flex min-h-full flex-col items-center justify-center pb-16">
                  <SocialGuestBanner onSignIn={() => setAuthOpen(true)} />
                </div>
              ))}

            {tab === 'saved' && (
              <MyRecipesView
                history={store.history}
                saved={store.saved}
                isSaved={store.isSaved}
                onOpen={openRecipe}
                onToggleSaved={(r) => store.toggleSaved(r)}
                onClear={store.clearHistory}
              />
            )}
          </div>
        </main>
      )}

      <TabBar active={tab} onSelect={(t) => setTab(t)} hidden={phase === 'recipe' || authOpen || settingsOpen || fridgeOpen || scanOpen || setupOpen} />

      {fridgeOpen && (
        <FridgeAddModal
          voiceSupported={voice.supported}
          listening={voice.isListening}
          transcript={voice.transcript}
          busy={fridgeBusy}
          error={fridgeError}
          onMicPress={onFridgeMicPress}
          onPhoto={openPhotoScanner}
          onClose={closeFridge}
        />
      )}

      {scanOpen && scanFile && (
        <FridgePhotoScanner file={scanFile} onClose={closeScan} onSave={saveScannedItems} />
      )}

      {setupOpen && (
        <TasteSetupModal
          voiceSupported={voice.supported}
          listening={voice.isListening}
          transcript={voice.transcript}
          busy={profileBusy}
          error={profileError}
          onMicPress={onProfileMicPress}
          onSubmitText={(raw) => void runProfileUpdate(raw)}
          onRetry={() => void runProfileUpdate(profileQuery)}
          onDone={closeSetup}
          onSkip={closeSetup}
        />
      )}

      {authOpen && (
        <AuthScreen
          initial={authInitial}
          onClose={() => setAuthOpen(false)}
          onLogin={async (u, p) => auth.login(u, p)}
          onRegister={async (u, p, q, a) => auth.register(u, p, q, a)}
        />
      )}

      {settingsOpen && user && (
        <ProfileSettings
          username={user.username}
          avatar={user.avatar}
          onClose={() => setSettingsOpen(false)}
          onUpdateProfile={auth.updateProfile}
          onUpdateAvatar={auth.updateAvatar}
          onDeleteAccount={auth.deleteAccount}
          onAccountDeleted={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

/** "My Recipes" screen: a History/Saved segmented bar over the shared list view. */
function MyRecipesView({
  history,
  saved,
  isSaved,
  onOpen,
  onToggleSaved,
  onClear,
}: {
  history: Recipe[]
  saved: Recipe[]
  isSaved: (id: string) => boolean
  onOpen: (r: Recipe) => void
  onToggleSaved: (r: Recipe) => void
  onClear: () => void
}) {
  const [section, setSection] = useState<'history' | 'saved'>('saved')

  return (
    <>
      <div className="-mb-1">
        <h2 className="text-[24px] font-bold tracking-tight">My Recipes</h2>
      </div>
      <GlassCard strong className="mt-4 flex items-center gap-1 p-1">
        {(
          [
            { key: 'saved', label: 'Saved', icon: <Bookmark className="h-4 w-4" /> },
            { key: 'history', label: 'History', icon: <Clock className="h-4 w-4" /> },
          ] as const
        ).map((seg) => (
          <button
            key={seg.key}
            type="button"
            onClick={() => setSection(seg.key)}
            aria-current={section === seg.key ? 'page' : undefined}
            className={cn(
              'pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors',
              section === seg.key
                ? 'bg-white/90 text-ink shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
                : 'text-ink-soft',
            )}
          >
            {seg.icon}
            {seg.label}
          </button>
        ))}
      </GlassCard>
      <div className="mt-5">
        {section === 'history' ? (
          <ListTab
            variant="history"
            recipes={history}
            isSaved={isSaved}
            onOpen={onOpen}
            onToggleSaved={onToggleSaved}
            onClear={onClear}
          />
        ) : (
          <ListTab
            variant="saved"
            recipes={saved}
            isSaved={isSaved}
            onOpen={onOpen}
            onToggleSaved={onToggleSaved}
            onClear={() => {}}
          />
        )}
      </div>
    </>
  )
}

/** Reusable list view for History / Saved sections. */
function ListTab({
  variant,
  recipes,
  isSaved,
  onOpen,
  onToggleSaved,
  onClear,
}: {
  variant: 'history' | 'saved'
  recipes: Recipe[]
  isSaved: (id: string) => boolean
  onOpen: (r: Recipe) => void
  onToggleSaved: (r: Recipe) => void
  onClear: () => void
}) {
  if (recipes.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center pb-12">
        <EmptyState
          icon={variant === 'history' ? Clock : Sparkles}
          title={variant === 'history' ? 'No history yet' : 'Nothing saved yet'}
          description={
            variant === 'history'
              ? 'Every recipe you ask for will show up here.'
              : 'Bookmark a recipe you loved and it will live here.'
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {variant === 'history' && (
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={onClear}
            className="pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear history
          </button>
        </div>
      )}
      {recipes.map((r) => (
        <RecipeListItem
          key={r.id}
          recipe={r}
          isSaved={isSaved(r.id)}
          onOpen={() => onOpen(r)}
          onToggleSaved={() => onToggleSaved(r)}
        />
      ))}
    </div>
  )
}

function HomeView(props: {
  phase: Phase
  voiceSupported: boolean
  listening: boolean
  text: string
  displayTranscript: string
  error: string | null
  query: string
  examples: string[]
  fridgeMode: boolean
  onToggleFridgeMode: (on: boolean) => void
  onTextChange: (v: string) => void
  onSubmit: () => void
  onMicPress: () => void
  onRetry: () => void
  elapsed: number
}) {
  const { phase, text } = props
  const thinking = phase === 'thinking'

  return (
    <div className="flex min-h-full flex-col pb-8">
      {!thinking && (
        <div className="pt-6 text-center">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">
            What are you <span className="italic text-ink/40">craving</span>?
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-ink-soft">
            Say it out loud, or type it. Foody AI turns your words into a recipe.
          </p>
        </div>
      )}

      {thinking ? (
        <ThinkingView query={props.query} elapsed={props.elapsed} />
      ) : (
        <>
          <GlassCard className="mt-8 p-1">
            <div className="flex items-center gap-1 pl-4 pr-1">
              {props.listening ? (
                <div
                  aria-live="polite"
                  className="flex h-12 flex-1 items-center gap-1 overflow-hidden text-[15px] text-ink"
                >
                  {props.displayTranscript ? (
                    <span className="whitespace-pre-wrap break-words">
                      {props.displayTranscript}
                      <span className="typing-caret" />
                    </span>
                  ) : (
                    <span className="text-ink-faint">Listening…</span>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={text}
                  onChange={(e) => props.onTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') props.onSubmit()
                  }}
                  placeholder="e.g. creamy tuscan chicken"
                  enterKeyHint="send"
                  className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              )}
                {props.voiceSupported && (
                  <button
                    type="button"
                    aria-label={props.listening ? 'Stop speaking' : 'Talk'}
                    aria-pressed={props.listening}
                    onClick={props.onMicPress}
                    className={cn(
                      'pressable relative flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                      props.listening
                        ? 'bg-ink text-white'
                        : 'bg-ink/5 text-ink-soft hover:bg-ink/10',
                    )}
                  >
                    {props.listening && (
                      <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-ink/30 [animation:ripple_1.6s_cubic-bezier(0,0.2,0.8,1)_infinite]" />
                    )}
                    <MicIcon className="h-5 w-5" strokeWidth={2} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Ask"
                  onClick={props.onSubmit}
                  className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between pl-4 pr-3 py-2.5">
                <p className="text-[11px] font-semibold text-ink/70">Cook with my fridge's ingredients</p>
                <Switch on={props.fridgeMode} onChange={props.onToggleFridgeMode} label="Use fridge ingredients" />
              </div>

          </GlassCard>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {props.examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => props.onTextChange(ex)}
                className="glass-badge pressable rounded-full px-3.5 py-2 text-[13px] font-medium text-ink/80"
              >
                {ex}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1" />

      {!thinking && (
        <div className="flex flex-col items-center pt-6">
          {props.error && <ErrorCard message={props.error} onRetry={props.onRetry} />}
        </div>
      )}
    </div>
  )
}

function ThinkingView({ query, elapsed }: { query: string; elapsed: number }) {
  return (
    <div className="flex flex-col items-center pt-10 text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-ink/5 [animation:breathe_1.4s_ease-in-out_infinite]" />
        <div className="glass-strong relative flex h-24 w-24 items-center justify-center rounded-full">
          <span className="h-6 w-6 rounded-full border-2 border-ink/20 border-t-ink/70 [animation:spin_0.8s_linear_infinite]" />
        </div>
      </div>
      <p className="mt-6 text-[17px] font-semibold">Finding your plate…</p>
      {query && <p className="mt-1.5 max-w-[260px] text-[14px] text-ink-soft">“{query}”</p>}
      <div className="mt-5 flex items-center gap-1.5 text-[13px] text-ink-faint">
        <Sparkles className="h-3.5 w-3.5" />
        {elapsed > 0 ? `Researching recipes… ${elapsed}s` : 'Researching the best recipes to cure your hunger'}
      </div>
    </div>
  )
}

function SocialGuestBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <GlassCard className="flex max-w-[320px] flex-col items-center gap-3 px-6 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/70">
        <Users className="h-6 w-6 text-ink/40" strokeWidth={1.6} />
      </div>
      <div>
        <h3 className="text-[16px] font-semibold">Social is for accounts</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Follow friends, share your dishes, and chat in groups. Sign in to get started.
        </p>
      </div>
      <button
        type="button"
        onClick={onSignIn}
        className="pressable inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </button>
    </GlassCard>
  )
}

function GuestBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <GlassCard className="mb-4 flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[13px] font-semibold leading-snug">You’re not signed in</p>
        <p className="text-[12px] leading-snug text-ink-soft">You can explore, but nothing will be saved.</p>
      </div>
      <button
        type="button"
        onClick={onSignIn}
        className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white"
      >
        Sign in
      </button>
    </GlassCard>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <GlassCard className="flex items-center gap-3 px-4 py-3">
      <p className="flex-1 text-left text-[13px] leading-snug text-ink-soft">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="pressable inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </button>
    </GlassCard>
  )
}

export default App