import { useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, Loader2, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { cn } from '@/lib/utils'

interface ProfileSettingsProps {
  username: string
  avatar: string | null
  onClose: () => void
  onUpdateProfile: (input: { username?: string; currentPassword?: string; newPassword?: string }) => Promise<{ username: string; avatar: string | null }>
  onUpdateAvatar: (file: File) => Promise<string>
  onDeleteAccount: (currentPassword: string) => Promise<void>
  onAccountDeleted: () => void
}

export function ProfileSettings({ username, avatar, onClose, onUpdateProfile, onUpdateAvatar, onDeleteAccount, onAccountDeleted }: ProfileSettingsProps) {
  const [name, setName] = useState(username)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleAvatarFile = async (file: File | undefined | null) => {
    if (!file) return
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      await onUpdateAvatar(file)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setAvatarBusy(false)
    }
  }

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === username || busy) return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      await onUpdateProfile({ username: trimmed })
      setName(trimmed)
      setSaved('Username updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update username')
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    if (busy) return
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
      await onUpdateProfile({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-surface text-ink no-scrollbar">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-32 pt-[max(env(safe-area-inset-top),22px)]">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="pressable glass-strong flex h-10 w-10 items-center justify-center rounded-full text-ink-soft"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[22px] font-bold tracking-tight">Account settings</h1>
        </header>

        <GlassCard className="mt-6 px-5 py-5">
          <div className="flex items-center gap-4">
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-20 w-20 rounded-3xl object-cover" />
            ) : (
              <div className="glass-strong flex h-20 w-20 items-center justify-center rounded-3xl text-[28px] font-semibold">
                {username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-[15px] font-semibold">Profile picture</p>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">Pick a photo so Foody AI knows who’s cooking.</p>
            </div>
          </div>

          {avatarError && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-600">{avatarError}</p>
          )}

          <button
            type="button"
            disabled={avatarBusy}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'pressable mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white',
              'bg-ink',
              avatarBusy && 'opacity-50',
            )}
          >
            {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {avatarBusy ? 'Uploading…' : avatar ? 'Change photo' : 'Add a photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleAvatarFile(e.target.files?.[0])}
          />
        </GlassCard>

        <GlassCard className="mt-4 px-5 py-5">
          <p className="text-[15px] font-semibold">Username</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-3 h-12 w-full rounded-xl border border-black/5 bg-black/[0.03] px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink/20"
          />
          <button
            type="button"
            disabled={busy || !name.trim() || name.trim() === username}
            onClick={() => void saveName()}
            className={cn(
              'pressable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white',
              'bg-ink',
              (busy || !name.trim() || name.trim() === username) && 'opacity-50',
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {busy ? 'Saving…' : 'Save username'}
          </button>
          {saved && (
            <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2.5 text-[13px] font-medium text-green-600">
              <Check className="h-4 w-4" /> {saved}
            </p>
          )}
        </GlassCard>

        <GlassCard className="mt-4 px-5 py-5">
          <p className="text-[15px] font-semibold">Change password</p>

          <label className="mt-3 block">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink/50">Current password</span>
            <input
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-black/5 bg-black/[0.03] px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink/20"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink/50">New password</span>
            <input
              type="password"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1.5 h-12 w-full rounded-xl border border-black/5 bg-black/[0.03] px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink/20"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink/50">Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter the new password"
              className="mt-1.5 h-12 w-full rounded-xl border border-black/5 bg-black/[0.03] px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink/20"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-medium leading-snug text-red-600">{error}</p>
          )}

          <button
            type="button"
            disabled={busy || !currentPassword || !newPassword || !confirmPassword}
            onClick={() => void savePassword()}
            className={cn(
              'pressable mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white',
              'bg-ink',
              (busy || !currentPassword || !newPassword || !confirmPassword) && 'opacity-50',
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Update password
          </button>
        </GlassCard>

        <GlassCard className="mt-6 border-red-200 px-5 py-5">
          <p className="text-[15px] font-semibold text-red-600">Delete account</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">
            Permanently removes your account, saved recipes, history and preferences. This cannot be undone.
          </p>

          {!deleteArmed ? (
            <button
              type="button"
              onClick={() => {
                setDeleteArmed(true)
                setDeleteError(null)
              }}
              className="pressable mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-[14px] font-semibold text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </button>
          ) : (
            <div className="mt-4">
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-ink/50">Enter your password</span>
                <input
                  type="password"
                  value={deletePassword}
                  autoComplete="current-password"
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl border border-black/5 bg-black/[0.03] px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-red-300"
                />
              </label>

              {deleteError && (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-medium leading-snug text-red-600">{deleteError}</p>
              )}

              <button
                type="button"
                disabled={deleteBusy || !deletePassword}
                onClick={() => void (async () => {
                  setDeleteBusy(true)
                  setDeleteError(null)
                  try {
                    await onDeleteAccount(deletePassword)
                    onAccountDeleted()
                  } catch (err) {
                    setDeleteError(err instanceof Error ? err.message : 'Could not delete account')
                    setDeleteBusy(false)
                  }
                })()}
                className={cn(
                  'pressable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-[14px] font-semibold text-white',
                  (deleteBusy || !deletePassword) && 'opacity-50',
                )}
              >
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleteBusy ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteArmed(false)}
                className="mt-2 h-11 w-full rounded-xl text-[14px] font-semibold text-ink-soft"
              >
                Cancel
              </button>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}