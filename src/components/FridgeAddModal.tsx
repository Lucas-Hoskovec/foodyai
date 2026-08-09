import { useRef } from 'react'
import { Camera, Mic as MicIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FridgeAddModalProps {
  voiceSupported: boolean
  listening: boolean
  transcript: string
  busy: boolean
  error: string | null
  onMicPress: () => void
  onPhoto: (file: File) => void
  onClose: () => void
}

export function FridgeAddModal({
  voiceSupported,
  listening,
  transcript,
  busy,
  error,
  onMicPress,
  onPhoto,
  onClose,
}: FridgeAddModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Add groceries"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
      />
      <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6 text-center shadow-[var(--shadow-glass)]">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="pressable absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-[19px] font-bold">Add groceries</h2>
        <p className="mx-auto mt-1 max-w-[240px] text-[13px] leading-snug text-ink-soft">
          Speak the groceries and amounts, or snap a photo of your receipt — Foody AI will sort them.
        </p>

        <div className="mt-6 flex items-center justify-center gap-8">
          <ActionButton
            icon={<MicIcon className="h-6 w-6" strokeWidth={2} />}
            label="Speak"
            active={listening}
            disabled={!voiceSupported || busy}
            onClick={onMicPress}
          />
          <ActionButton
            icon={<Camera className="h-6 w-6" strokeWidth={2} />}
            label="Camera"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          />
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onPhoto(file)
          }}
        />

        {listening && (
          <p aria-live="polite" className="mt-4 text-[13px] italic text-ink">
            {transcript ? `“${transcript}”` : 'Listening…'}
          </p>
        )}

        {busy && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-ink-soft">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
            Filing groceries into your fridge…
          </div>
        )}

        {error && !busy && <p className="mt-4 text-[12px] text-red-500">{error}</p>}

        {!voiceSupported && !busy && (
          <p className="mt-4 text-[12px] text-ink-faint">
            Voice isn't supported on this device yet.
          </p>
        )}
      </div>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'pressable relative flex flex-col items-center gap-2 disabled:opacity-40',
      )}
    >
      <span
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
          active ? 'bg-ink text-white' : 'glass-strong text-ink',
        )}
      >
        {active && (
          <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-ink/30 [animation:ripple_1.6s_cubic-bezier(0,0.2,0.8,1)_infinite]" />
        )}
        {icon}
      </span>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
    </button>
  )
}