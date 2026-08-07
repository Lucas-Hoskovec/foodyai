import { Mic as MicIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MicPhase = 'idle' | 'listening' | 'thinking'

interface MicProps {
  phase: MicPhase
  disabled?: boolean
  onClick: () => void
  label?: string
}

export function Mic({ phase, disabled, onClick, label = 'Tap to talk' }: MicProps) {
  const listening = phase === 'listening'
  const thinking = phase === 'thinking'

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {listening && (
          <>
            <span className="pointer-events-none absolute h-28 w-28 rounded-full border-2 border-black/15 [animation:ripple_2.2s_cubic-bezier(0,0.2,0.8,1)_infinite]" />
            <span className="pointer-events-none absolute h-28 w-28 rounded-full border-2 border-black/10 [animation:ripple_2.2s_cubic-bezier(0,0.2,0.8,1)_0.7s_infinite]" />
          </>
        )}
        {thinking && (
          <span className="pointer-events-none absolute h-24 w-24 rounded-full bg-black/5 [animation:breathe_1.4s_ease-in-out_infinite]" />
        )}

        {listening && (
          <div className="pointer-events-none absolute -bottom-1 mb-0 flex h-6 items-center gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-4 w-[3px] rounded-full bg-ink/30 [animation:waveform_0.9s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          aria-label={label}
          aria-pressed={listening}
          onClick={onClick}
          disabled={disabled || thinking}
          className={cn(
            'glass-strong pressable relative z-10 flex h-24 w-24 items-center justify-center rounded-full',
            thinking && 'opacity-70',
          )}
        >
          {thinking ? (
            <span className="h-5 w-5 rounded-full border-2 border-ink/20 border-t-ink/70 [animation:spin_0.9s_linear_infinite]" />
          ) : (
            <MicIcon className={cn('h-9 w-9 text-ink transition-colors', listening && 'text-ink/70')} strokeWidth={1.8} />
          )}
        </button>
      </div>
      <span className="text-[13px] font-medium tracking-wide text-ink-soft">
        {thinking ? 'Thinking' : listening ? 'Listening…' : label}
      </span>
    </div>
  )
}