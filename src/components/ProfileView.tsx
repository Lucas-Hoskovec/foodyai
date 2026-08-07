import { useState } from 'react'
import { ChefHat, ChevronDown, Mic as MicIcon, RotateCcw, Sparkles, X } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { cn } from '@/lib/utils'

interface ProfileViewProps {
  likes: string[]
  dislikes: string[]
  lastSpeech: string
  voiceSupported: boolean
  listening: boolean
  transcript: string
  busy: boolean
  error: string | null
  onMicPress: () => void
  onRetry: () => void
  onRemove: (list: 'likes' | 'dislikes', item: string) => void
}

const CHEF_LINES = [
  (speech: string) =>
    `Well said: “${speech}” — the chef inside my processor mimicked a standing ovation with two circuits.`,
  (speech: string) => `“${speech}” — noted, archived, and now the fridge is doing a little judging of its own.`,
  (speech: string) => `Copy that on “${speech}”. My garlic just leaned in, fully invested.`,
  (speech: string) => `So you said “${speech}”… I've added it to your permanent taste dossier, which is laminated.`,
  (speech: string) => `Heard you loud and clear: “${speech}”. My appetite is already on its way.`,
  (speech: string) => `Fair enough — “${speech}” — even my seasoning respects your confidence.`,
]

const CHEF_EMPTY_LINES = [
  () => 'No taste report yet, but I am fully prepared to pass judgment.',
  () => 'No intel on your taste buds yet — which is suspicious. Tap the mic.',
  () => 'Your taste profile remains an unsolved mystery. The chef would love a clue.',
  () => 'Nothing to snark about yet. Give me a hint and awaken the appetite in me.',
]

function pickChefLine(lastSpeech: string): string {
  const bank = lastSpeech.trim() ? CHEF_LINES : CHEF_EMPTY_LINES
  const index = Math.floor(Math.random() * bank.length)
  return bank[index](lastSpeech)
}

function capitalizeAll(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

export function ProfileView({
  likes,
  dislikes,
  lastSpeech,
  voiceSupported,
  listening,
  transcript,
  busy,
  error,
  onMicPress,
  onRetry,
  onRemove,
}: ProfileViewProps) {
  const overview = useState(() => pickChefLine(lastSpeech))[0]
  return (
    <div className="flex min-h-full flex-col pb-6">
      <header className="flex items-center gap-3 pt-2">
        <div className="glass-strong flex h-12 w-12 items-center justify-center rounded-2xl">
          <Sparkles className="h-6 w-6 text-ink" />
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold leading-tight">My FoodyAI</h1>
          <p className="text-[13px] text-ink-soft">Your personal taste profile</p>
        </div>
      </header>

      <GlassCard className="mt-5 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
          <p className="text-[14px] leading-snug text-ink">{overview}</p>
        </div>
      </GlassCard>

      <Accordion
        title="Things I like"
        items={likes}
        emptyText="Nothing here yet. Tap the mic and say something like “I love pasta and garlic bread”."
        defaultOpen
        onRemove={(item) => onRemove('likes', item)}
      />

      <Accordion
        title="Things I don't like"
        items={dislikes}
        emptyText="Nothing here yet. Tap the mic and say something like “I really don't like mushrooms.”"
        onRemove={(item) => onRemove('dislikes', item)}
      />

      <div className="flex-1" />

      <div className="mt-2 flex flex-col items-center">
        {transcript && listening && (
          <div aria-live="polite" className="mb-2 max-w-[280px] text-center text-[13px] italic text-ink-soft">
            “{transcript}”
          </div>
        )}

        {busy && (
          <div className="mb-2 flex items-center gap-1.5 text-[13px] text-ink-soft">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
            Updating your taste profile…
          </div>
        )}

        {error && !busy && (
          <div className="mb-2 flex items-center gap-2 px-4 py-2">
            <p className="max-w-[240px] text-[12px] text-ink-soft">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white"
              aria-label="Retry"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}

        {voiceSupported ? (
          <button
            type="button"
            aria-label={listening ? 'Stop speaking' : 'Speak to update your taste profile'}
            aria-pressed={listening}
            onClick={onMicPress}
            className={cn(
              'pressable relative flex h-16 w-16 items-center justify-center rounded-full transition-colors',
              listening || busy ? 'bg-ink text-white' : 'glass-strong text-ink',
            )}
          >
            {listening && (
              <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-ink/30 [animation:ripple_1.6s_cubic-bezier(0,0.2,0.8,1)_infinite]" />
            )}
            <MicIcon className="h-6 w-6" strokeWidth={2} />
          </button>
        ) : (
          <p className="text-center text-[13px] text-ink-faint">
            Voice isn’t supported here — prefer classifiers prefer your typed requests handled on the Home tab.
          </p>
        )}

        <p className="mt-3 max-w-[260px] text-center text-[13px] leading-snug text-ink-faint">
          {listening
            ? 'Listening… tell FoodyAI what to add or remove.'
            : 'Tap the mic and talk about what you like — or what you don’t.'}
        </p>
      </div>
    </div>
  )
}

function Accordion({
  title,
  items,
  emptyText,
  defaultOpen,
  onRemove,
}: {
  title: string
  items: string[]
  emptyText: string
  defaultOpen?: boolean
  onRemove: (item: string) => void
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <GlassCard className="mt-4 overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="pressable flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[15px] font-semibold">
          {title} <span className="ml-1 text-[13px] font-normal text-ink-faint">{items.length}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-ink-soft transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {items.length ? (
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1.5 text-[13px] text-ink"
                >
                  {capitalizeAll(item)}
                  <button
                    type="button"
                    aria-label={`Remove ${item}`}
                    onClick={() => onRemove(item)}
                    className="pressable flex h-4 w-4 items-center justify-center rounded-full text-ink-faint hover:text-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] leading-snug text-ink-faint">{emptyText}</p>
          )}
        </div>
      )}
    </GlassCard>
  )
}