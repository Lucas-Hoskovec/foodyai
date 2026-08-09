import { useState } from 'react'
import { ArrowLeft, ChefHat, Eye, EyeOff, Loader2, ShieldCheck, X } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { cn } from '@/lib/utils'
import { SECURITY_QUESTIONS } from '@/lib/securityQuestions'
import { api } from '@/lib/api'

type Route =
  | { name: 'login' }
  | { name: 'register-credentials'; username?: never }
  | { name: 'register-security'; username: string; password: string }
  | { name: 'forgot-username' }
  | { name: 'forgot-answer'; username: string; question: string }
  | { name: 'forgot-new'; username: string; answer: string; question: string }

export function AuthScreen({
  onClose,
  onLogin,
  onRegister,
  initial,
}: {
  onClose: () => void
  onLogin: (username: string, password: string) => Promise<unknown>
  onRegister: (username: string, password: string, question: string, answer: string) => Promise<unknown>
  initial?: 'login' | 'register'
}) {
  const [route, setRoute] = useState<Route>(
    initial === 'register' ? { name: 'register-credentials' } : { name: 'login' },
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-surface text-ink no-scrollbar">
      <div className="relative mx-auto flex min-h-full max-w-md flex-col px-5 pb-10 pt-[max(env(safe-area-inset-top),22px)]">
        <div className="flex items-center justify-between">
          {route.name === 'login' ? (
            <span />
          ) : (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setRoute(backRoute(route))}
              className="pressable glass-strong flex h-10 w-10 items-center justify-center rounded-full text-ink-soft"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="pressable glass-strong flex h-10 w-10 items-center justify-center rounded-full text-ink-soft"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="glass-strong flex h-16 w-16 items-center justify-center rounded-3xl">
            <ChefHat className="h-8 w-8 text-ink" strokeWidth={1.5} />
          </div>
          <h1 className="mt-5 text-center text-[30px] font-bold tracking-tight">
            {route.name === 'login' ? 'Foody AI' : route.name.includes('register') ? 'Create account' : 'Reset password'}
          </h1>
          <p className="mt-2 max-w-[280px] text-center text-[15px] leading-relaxed text-ink-soft">
            {subtitle(route)}
          </p>

          <GlassCard strong className="mt-8 w-full max-w-[360px] px-5 py-6">
            {route.name === 'login' && (
              <LoginStep
                error={error}
                busy={busy}
                onResetError={() => setError(null)}
                onForgot={() => {
                  setError(null)
                  setRoute({ name: 'forgot-username' })
                }}
                onCreate={() => {
                  setError(null)
                  setRoute({ name: 'register-credentials' })
                }}
                onSubmit={async (username, password) => {
                  setBusy(true)
                  setError(null)
                  try {
                    await onLogin(username, password)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Something went wrong')
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            )}

            {route.name === 'register-credentials' && (
              <CredentialsStep
                error={error}
                busy={busy}
                onResetError={() => setError(null)}
                onSubmit={(username, password) => {
                  setRoute({ name: 'register-security', username, password })
                }}
                onBack={() => setRoute({ name: 'login' })}
              />
            )}

            {route.name === 'register-security' && (
              <SecurityStep
                error={error}
                busy={busy}
                onResetError={() => setError(null)}
                onSubmit={async (question, answer) => {
                  setBusy(true)
                  setError(null)
                  try {
                    await onRegister(route.username, route.password, question, answer)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Something went wrong')
                  } finally {
                    setBusy(false)
                  }
                }}
                onBack={() => setRoute({ name: 'register-credentials' })}
              />
            )}

            {route.name === 'forgot-username' && (
              <UsernameStep
                error={error}
                busy={busy}
                onResetError={() => setError(null)}
                onSubmit={async (username) => {
                  setBusy(true)
                  setError(null)
                  try {
                    const question = await api.forgot(username)
                    setRoute({ name: 'forgot-answer', username, question })
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Something went wrong')
                  } finally {
                    setBusy(false)
                  }
                }}
                onBack={() => setRoute({ name: 'login' })}
              />
            )}

            {route.name === 'forgot-answer' && (
              <AnswerStep
                question={route.question}
                error={error}
                busy={busy}
                onResetError={() => setError(null)}
                onSubmit={(answer) => {
                  setRoute({ name: 'forgot-new', username: route.username, answer, question: route.question })
                }}
                onBack={() => setRoute({ name: 'forgot-username' })}
              />
            )}

            {route.name === 'forgot-new' && (
              <NewPasswordStep
                error={error}
                busy={busy}
                onResetError={() => setError(null)}
                onSubmit={async (newPassword, confirmPassword) => {
                  if (newPassword.length < 8) {
                    setError('New password must be at least 8 characters')
                    return
                  }
                  if (newPassword !== confirmPassword) {
                    setError('The two passwords do not match')
                    return
                  }
                  setBusy(true)
                  setError(null)
                  try {
                    await api.reset(route.username, route.answer, newPassword)
                    setRoute({ name: 'login' })
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Something went wrong')
                  } finally {
                    setBusy(false)
                  }
                }}
                onBack={() => setRoute({ name: 'forgot-answer', username: route.username, question: route.question })}
              />
            )}
          </GlassCard>

          <p className="mt-6 max-w-[300px] text-center text-[12px] leading-relaxed text-ink-faint">
            Your recipes, saved dishes, and taste profile are stored per account and visible only to you.
          </p>
        </div>
      </div>
    </div>
  )
}

function backRoute(route: Route): Route {
  switch (route.name) {
    case 'login':
      return route
    case 'register-credentials':
    case 'register-security':
      return { name: 'login' }
    case 'forgot-username':
      return { name: 'login' }
    case 'forgot-answer':
      return { name: 'forgot-username' }
    case 'forgot-new':
      return { name: 'forgot-username' }
  }
}

function subtitle(route: Route): string {
  switch (route.name) {
    case 'login':
      return 'Welcome back. Sign in to pick up your recipes and taste profile.'
    case 'register-credentials':
      return 'Create an account so your recipes follow you to any device.'
    case 'register-security':
      return 'Tell us one more thing about you…'
    case 'forgot-username':
      return 'Forgot your password? Enter your username to get started.'
    case 'forgot-answer':
      return 'Answer your security question to continue.'
    case 'forgot-new':
      return 'Set a new password you’ll remember this time.'
  }
}

function LoginStep({
  error,
  busy,
  onResetError,
  onForgot,
  onCreate,
  onSubmit,
}: {
  error: string | null
  busy: boolean
  onResetError: () => void
  onForgot: () => void
  onCreate: () => void
  onSubmit: (username: string, password: string) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  return (
    <>
      <Field label="Username">
        <input
          type="text"
          value={username}
          autoComplete="username"
          onChange={(e) => { setUsername(e.target.value); onResetError() }}
          placeholder="e.g. foodie_anna"
          className="input"
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          show={show}
          placeholder="Your password"
          autoComplete="current-password"
          onChange={(v) => { setPassword(v); onResetError() }}
          onToggle={() => setShow((s) => !s)}
          onEnter={() => void onSubmit(username.trim(), password)}
        />
      </Field>

      <button
        type="button"
        onClick={() => onForgot()}
        className="pressable mt-3 self-start text-[13px] font-medium text-ink/70 hover:text-ink"
      >
        Forgot password?
      </button>

      {error && <ErrorBox message={error} />}

      <SubmitButton
        label="Sign in"
        busy={busy}
        disabled={!username.trim() || !password}
        onClick={() => onSubmit(username.trim(), password)}
      />

      <button
        type="button"
        onClick={onCreate}
        className="pressable mt-4 w-full text-center text-[13px] font-semibold text-ink-soft hover:text-ink"
      >
        Don’t have an account? <span className="text-ink underline">Create one</span>
      </button>
    </>
  )
}

function CredentialsStep({
  error,
  busy,
  onResetError,
  onSubmit,
  onBack,
}: {
  error: string | null
  busy: boolean
  onResetError: () => void
  onSubmit: (username: string, password: string) => void
  onBack: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  return (
    <>
      <Field label="Username">
        <input
          type="text"
          value={username}
          autoComplete="username"
          onChange={(e) => { setUsername(e.target.value); onResetError() }}
          placeholder="e.g. foodie_anna"
          className="input"
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          show={show}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          onChange={(v) => { setPassword(v); onResetError() }}
          onToggle={() => setShow((s) => !s)}
        />
      </Field>
      {error && <ErrorBox message={error} />}
      <SubmitButton
        label="Continue"
        busy={busy}
        disabled={!username.trim() || password.length < 8}
        onClick={() => onSubmit(username.trim(), password)}
      />
      <button type="button" onClick={onBack} className="pressable mt-4 w-full text-center text-[13px] font-semibold text-ink-soft hover:text-ink">
        Back to sign in
      </button>
    </>
  )
}

function SecurityStep({
  error,
  busy,
  onResetError,
  onSubmit,
  onBack,
}: {
  error: string | null
  busy: boolean
  onResetError: () => void
  onSubmit: (question: string, answer: string) => void
  onBack: () => void
}) {
  const [question, setQuestion] = useState(SECURITY_QUESTIONS[0])
  const [answer, setAnswer] = useState('')
  return (
    <>
      <div className="flex items-start gap-2.5 rounded-xl bg-ink/[0.04] px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
        <p className="text-[13px] leading-snug text-ink-soft">
          Tell us one more thing about you. This is how you’ll get back in if you ever forget your password.
        </p>
      </div>
      <Field label="Security question">
        <select
          value={question}
          onChange={(e) => { setQuestion(e.target.value); onResetError() }}
          className="input"
        >
          {SECURITY_QUESTIONS.map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
      </Field>
      <Field label="Your answer">
        <input
          type="text"
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); onResetError() }}
          placeholder="Type your answer"
          className="input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(question, answer.trim())
          }}
        />
      </Field>
      {error && <ErrorBox message={error} />}
      <SubmitButton
        label="Create account"
        busy={busy}
        disabled={!answer.trim()}
        onClick={() => onSubmit(question, answer.trim())}
      />
      <button type="button" onClick={onBack} className="pressable mt-4 w-full text-center text-[13px] font-semibold text-ink-soft hover:text-ink">
        Back
      </button>
    </>
  )
}

function UsernameStep({
  error,
  busy,
  onResetError,
  onSubmit,
  onBack,
}: {
  error: string | null
  busy: boolean
  onResetError: () => void
  onSubmit: (username: string) => void
  onBack: () => void
}) {
  const [username, setUsername] = useState('')
  return (
    <>
      <Field label="Username">
        <input
          type="text"
          value={username}
          autoComplete="username"
          onChange={(e) => { setUsername(e.target.value); onResetError() }}
          placeholder="e.g. foodie_anna"
          className="input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(username.trim())
          }}
        />
      </Field>
      {error && <ErrorBox message={error} />}
      <SubmitButton label="Continue" busy={busy} disabled={!username.trim()} onClick={() => onSubmit(username.trim())} />
      <button type="button" onClick={onBack} className="pressable mt-4 w-full text-center text-[13px] font-semibold text-ink-soft hover:text-ink">
        Back to sign in
      </button>
    </>
  )
}

function AnswerStep({
  question,
  error,
  busy,
  onResetError,
  onSubmit,
  onBack,
}: {
  question: string
  error: string | null
  busy: boolean
  onResetError: () => void
  onSubmit: (answer: string) => void
  onBack: () => void
}) {
  const [answer, setAnswer] = useState('')
  return (
    <>
      <Field label="Security question">
        <input type="text" value={question} readOnly className="input text-ink-soft" />
      </Field>
      <Field label="Your answer">
        <input
          type="text"
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); onResetError() }}
          placeholder="Type your answer"
          className="input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(answer.trim())
          }}
        />
      </Field>
      {error && <ErrorBox message={error} />}
      <SubmitButton label="Continue" busy={busy} disabled={!answer.trim()} onClick={() => onSubmit(answer.trim())} />
      <button type="button" onClick={onBack} className="pressable mt-4 w-full text-center text-[13px] font-semibold text-ink-soft hover:text-ink">
        Back
      </button>
    </>
  )
}

function NewPasswordStep({
  error,
  busy,
  onResetError,
  onSubmit,
  onBack,
}: {
  error: string | null
  busy: boolean
  onResetError: () => void
  onSubmit: (newPassword: string, confirmPassword: string) => void
  onBack: () => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  return (
    <>
      <Field label="New password">
        <PasswordInput
          value={newPassword}
          show={show}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          onChange={(v) => { setNewPassword(v); onResetError() }}
          onToggle={() => setShow((s) => !s)}
        />
      </Field>
      <Field label="Confirm new password">
        <input
          type={show ? 'text' : 'password'}
          value={confirmPassword}
          autoComplete="new-password"
          onChange={(e) => { setConfirmPassword(e.target.value); onResetError() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(newPassword, confirmPassword)
          }}
          placeholder="Re-enter the new password"
          className="input"
        />
      </Field>
      {error && <ErrorBox message={error} />}
      <SubmitButton
        label="Update password"
        busy={busy}
        disabled={!newPassword || !confirmPassword}
        onClick={() => onSubmit(newPassword, confirmPassword)}
      />
      <button type="button" onClick={onBack} className="pressable mt-4 w-full text-center text-[13px] font-semibold text-ink-soft hover:text-ink">
        Back
      </button>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-ink/50">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function PasswordInput({
  value,
  show,
  placeholder,
  autoComplete,
  onChange,
  onToggle,
  onEnter,
}: {
  value: string
  show: boolean
  placeholder: string
  autoComplete: string
  onChange: (value: string) => void
  onToggle: () => void
  onEnter?: () => void
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (onEnter && e.key === 'Enter') onEnter()
        }}
        className={cn('input', 'pr-12')}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="pressable absolute inset-y-0 right-1 flex w-10 items-center justify-center text-ink-faint hover:text-ink"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-medium leading-snug text-red-600">{message}</p>
  )
}

function SubmitButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        'pressable mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white',
        (busy || disabled) && 'opacity-50',
        'bg-ink',
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  )
}