import { useState } from 'react'
import { ChefHat, Keyboard, Mic as MicIcon, RotateCcw, Send } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { cn } from '@/lib/utils'

interface TasteSetupModalProps {
  voiceSupported: boolean
  listening: boolean
  transcript: string
  busy: boolean
  error: string | null
  onMicPress: () => void
  onSubmitText: (raw: string) => void
  onRetry: () => void
  onDone: () => void
  onSkip: () => void
}

export function TasteSetupModal({
  voiceSupported,
  listening,
  transcript,
  busy,
  error,
  onMicPress,
  onSubmitText,
  onRetry,
  onDone,
  onSkip,
}: TasteSetupModalProps) {
  const [showText, setShowText] = useState(!voiceSupported)
  const [typed, setTyped] = useState('')

  const submitTyped = () => {
    if (!typed.trim() || busy) return
    onSubmitText(typed)
    setTyped('')
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your taste profile"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <GlassCard strong className="relative w-full max-w-sm rounded-3xl p-6 text-center shadow-[var(--shadow-glass)]">
        <div className="glass-strong mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
          <ChefHat className="h-7 w-7 text-ink" strokeWidth={1.5} />
        </div>

        <h2 className="mt-4 text-[20px] font-bold tracking-tight">Set up your taste profile</h2>
        <p className="mx-auto mt-2 max-w-[270px] text-[13px] leading-relaxed text-ink-soft">
          Foody AI cooks better when it knows what you like. Tap the mic and talk, or switch to typing. Try
          “I love pasta” or “I really don’t like mushrooms.”
        </p>

        <div className="mt-6 flex items-center justify-center gap-8">
          <button
            type="button"
            aria-label={listening ? 'Stop speaking' : 'Speak to set up your taste profile'}
            aria-pressed={listening}
            disabled={!voiceSupported || busy}
            onClick={onMicPress}
            className="pressable relative flex flex-col items-center gap-2 disabled:opacity-40"
          >
            <span
              className={cn(
                'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
                listening || busy ? 'bg-ink text-white' : 'glass-strong text-ink',
              )}
            >
              {listening && (
                <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-ink/30 [animation:ripple_1.6s_cubic-bezier(0,0.2,0.8,1)_infinite]" />
              )}
              <MicIcon className="h-6 w-6" strokeWidth={2} />
            </span>
            <span className="text-[13px] font-medium text-ink-soft">Speak</span>
          </button>

          <button
            type="button"
            aria-label={showText ? 'Switch to speaking' : 'Type instead'}
            onClick={() => setShowText((prev) => !prev)}
            className="pressable flex flex-col items-center gap-2"
          >
            <span
              className={cn(
                'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
                showText ? 'bg-ink text-white' : 'glass-strong text-ink',
              )}
            >
              <Keyboard className="h-6 w-6" strokeWidth={2} />
            </span>
            <span className="text-[13px] font-medium text-ink-soft">Type</span>
          </button>
        </div>

        {showText && (
          <GlassCard strong className="mt-5 p-1.5">
            <div className="flex items-center gap-1 pl-3 pr-1">
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTyped()
                }}
                placeholder="e.g. I love pasta but not mushrooms"
                enterKeyHint="send"
                className="h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                type="button"
                aria-label="Send"
                onClick={submitTyped}
                className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </GlassCard>
        )}

        {listening && (
          <p aria-live="polite" className="mt-4 text-[13px] italic text-ink">
            {transcript ? `“${transcript}”` : 'Listening… tell Foody AI what you like.'}
          </p>
        )}

        {busy && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-ink-soft">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
            Updating your taste profile…
          </div>
        )}

        {error && !busy && (
          <div className="mt-4 flex items-center justify-center gap-2">
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

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onDone}
            className="pressable inline-flex w-full items-center justify-center rounded-full bg-ink px-4 py-3 text-[15px] font-semibold text-white"
          >
            Done
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="pressable text-[13px] font-medium text-ink-faint"
          >
            Skip for now
          </button>
        </div>

        <p className="mx-auto mt-5 max-w-[280px] text-[12px] leading-relaxed text-ink-faint">
          You can update this anytime: tap your profile picture in the top-right and choose About me.
        </p>
      </GlassCard>
    </div>
  )
}