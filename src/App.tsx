import { useCallback, useRef, useState } from 'react'
import { Clock, Mic as MicIcon, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react'
import type { Phase, Recipe, Tab } from '@/lib/types'
import { useVoice } from '@/lib/voice'
import { parseIntent, generateRecipe, updatePreferences } from '@/lib/nim'
import { foodImageFallback } from '@/lib/images'
import { useFoodyStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/TabBar'
import { GlassCard } from '@/components/GlassCard'
import { RecipePage } from '@/components/RecipePage'
import { EmptyState } from '@/components/EmptyState'
import { RecipeListItem } from '@/components/RecipeListItem'
import { ProfileView } from '@/components/ProfileView'

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
  const store = useFoodyStore()

  const [phase, setPhase] = useState<Phase>('idle')
  const [tab, setTab] = useState<Tab>('home')
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [examples] = useState<string[]>(() => pickExamples())
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [returnTab, setReturnTab] = useState<Tab>('home')
  const [error, setError] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileQuery, setProfileQuery] = useState('')

  const busyRef = useRef(false)
  const profileBusyRef = useRef(false)
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => {})
  const profileSubmitRef = useRef<(raw: string) => Promise<void>>(async () => {})
  const voice = useVoice({
    onFinal: (transcript) => {
      if (tabRef.current === 'me') void profileSubmitRef.current(transcript)
      else void submitRef.current(transcript)
    },
  })
  const tabRef = useRef(tab)
  tabRef.current = tab

  const runFlow = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed || busyRef.current) return
      busyRef.current = true
      setPhase('thinking')
      setError(null)
      setQuery(trimmed)

      try {
        const intent = await parseIntent(trimmed, store.prefs)
        const result = await generateRecipe(intent, store.prefs)
        result.image = result.image || foodImageFallback(intent.searchTerm)

        if (!result.steps.length || !result.ingredients.length) {
          throw new Error('That dish came back incomplete. Try rephrasing it.')
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
        />
      ) : (
        <main className="relative z-10 mx-auto flex h-full max-w-md flex-col px-5 pb-32 pt-[max(env(safe-area-inset-top),22px)]">
          <header className="flex items-center justify-between">
            <span className="text-lg font-bold tracking-tight">Foody</span>
            <span className="glass-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-soft">
              <Sparkles className="h-3.5 w-3.5" />
              {voice.supported ? 'Voice ready' : 'Type to ask'}
            </span>
          </header>

          <div className="mt-6 flex-1 overflow-y-auto no-scrollbar">
            {tab === 'home' && (
              <HomeView
                phase={phase}
                voiceSupported={voice.supported}
                listening={phase === 'listening'}
                text={text}
                displayTranscript={voice.transcript || text}
                error={error}
                query={query}
                examples={examples}
                onTextChange={setText}
                onSubmit={submitTyped}
                onMicPress={onMicPress}
                onRetry={() => void runFlow(query)}
              />
            )}

            {tab === 'me' && (
              <ProfileView
                likes={store.prefs.likes}
                dislikes={store.prefs.dislikes}
                lastSpeech={store.prefs.lastSpeech}
                voiceSupported={voice.supported}
                listening={voice.isListening}
                transcript={voice.transcript}
                busy={profileBusy}
                error={profileError}
                onMicPress={onProfileMicPress}
                onRetry={() => void runProfileUpdate(profileQuery)}
                onRemove={(list, item) => store.removePreference(list, item)}
              />
            )}

            {tab === 'history' && (
              <ListTab
                variant="history"
                recipes={store.history}
                isSaved={store.isSaved}
                onOpen={openRecipe}
                onToggleSaved={(r) => store.toggleSaved(r)}
                onClear={store.clearHistory}
              />
            )}

            {tab === 'saved' && (
              <ListTab
                variant="saved"
                recipes={store.saved}
                isSaved={store.isSaved}
                onOpen={openRecipe}
                onToggleSaved={(r) => store.toggleSaved(r)}
                onClear={() => {}}
              />
            )}
          </div>
        </main>
      )}

      <TabBar active={tab} onSelect={(t) => setTab(t)} hidden={phase === 'recipe'} />
    </div>
  )
}

/** Reusable list view for History / Saved tabs. */
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
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[20px] font-bold">{variant === 'history' ? 'Recent dishes' : 'Saved recipes'}</h2>
        {variant === 'history' && (
          <button
            type="button"
            onClick={onClear}
            className="pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
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
  onTextChange: (v: string) => void
  onSubmit: () => void
  onMicPress: () => void
  onRetry: () => void
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
            Say it out loud, or type it. Foody turns your words into a recipe.
          </p>
        </div>
      )}

      {thinking ? (
        <ThinkingView query={props.query} />
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

function ThinkingView({ query }: { query: string }) {
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
        Researching the best recipes to cure your hunger
      </div>
    </div>
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