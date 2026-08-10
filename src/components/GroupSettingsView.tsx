import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Crown, LogOut, Pencil, ShieldCheck, Trash2, UserMinus, UserPlus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Group, SocialUser } from '@/lib/types'
import { Avatar } from './Avatar'
import { GlassCard } from './GlassCard'

interface GroupSettingsViewProps {
  groupId: string
  meId: number
  friends: SocialUser[]
  onBack: () => void
  onExit: () => void
  onOpenProfile: (user: SocialUser) => void
}

export function GroupSettingsView({ groupId, meId, friends, onBack, onExit, onOpenProfile }: GroupSettingsViewProps) {
  const [group, setGroup] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addingMember, setAddingMember] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferTarget, setTransferTarget] = useState<SocialUser | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)

  const loadGroup = useCallback(async () => {
    try {
      setGroup(await api.socialGroup(groupId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load group')
    }
  }, [groupId])

  useEffect(() => {
    void loadGroup()
  }, [loadGroup])

  const addMember = async (user: SocialUser) => {
    try {
      const updated = await api.socialAddMember(groupId, user.id)
      setGroup(updated)
      setAddingMember(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member')
    }
  }

  const removeMember = async (user: SocialUser) => {
    try {
      await api.socialRemoveMember(groupId, user.id)
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member')
    }
  }

  const promote = async (user: SocialUser) => {
    try {
      await api.socialPromoteAdmin(groupId, user.id)
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not promote member')
    }
  }

  const startEdit = () => {
    if (!group) return
    setEditName(group.name)
    setPendingAvatar(null)
    setRemoveAvatar(false)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setPendingAvatar(null)
    setRemoveAvatar(false)
  }

  const saveEdit = async () => {
    if (!group) return
    const next = { ...group }
    try {
      if (pendingAvatar) {
        const uploaded = await api.socialUploadGroupAvatar(groupId, pendingAvatar)
        next.avatar = uploaded.avatar
      } else if (removeAvatar) {
        const cleared = await api.socialRenameGroup(groupId, { avatar: null })
        next.avatar = null
        next.name = cleared.name
      }
      const name = editName.trim()
      if (name && name !== group.name) {
        const renamed = await api.socialRenameGroup(groupId, { name })
        next.name = renamed.name
      }
      setGroup(next)
      setEditing(false)
      setPendingAvatar(null)
      setRemoveAvatar(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save group changes')
    }
  }

  const transfer = async () => {
    if (!transferTarget) return
    try {
      await api.socialTransferOwner(groupId, transferTarget.id)
      setTransferTarget(null)
      setTransferOpen(false)
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not transfer ownership')
    }
  }

  const leave = async () => {
    try {
      await api.socialLeaveGroup(groupId)
      onExit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave group')
    }
  }

  const deleteTheGroup = async () => {
    try {
      await api.socialDeleteGroup(groupId)
      onExit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete group')
    }
  }

  const memberIds = useMemo(() => new Set(group?.members?.map((m) => m.user.id) ?? []), [group])
  const memberNames = useMemo(() => new Map(group?.members?.map((m) => [m.user.id, m.user.username]) ?? []), [group])
  const addableFriends = useMemo(() => friends.filter((f) => !memberIds.has(f.id)), [friends, memberIds])
  const adminMembers = group?.members?.filter((m) => m.isAdmin && m.user.id !== meId) ?? []

  return (
    <div className="flex min-h-full flex-col pb-2">
      {error && <p className="pb-1 pt-2 text-center text-[12px] text-red-500">{error}</p>}

      <div className="mt-2 space-y-3 pb-4">
        {group && (
          <GlassCard strong className="overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-3">
              <button type="button" aria-label="Back" onClick={onBack} className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar name={group.name} avatar={editing && pendingAvatar ? undefined : group.avatar} size={52} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold">{group.name}</h2>
                <p className="text-[12px] text-ink-soft">Owned by {memberNames.get(group.ownerId) ?? '…'}</p>
              </div>
              {group.isAdmin && (
                <button
                  type="button"
                  aria-label="Edit group"
                  onClick={startEdit}
                  className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>

          {group.isAdmin && editing && (
            <div className="mt-3 flex flex-col gap-3 px-4 pb-4">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
                autoFocus
                className="input h-9 w-full"
                placeholder="Group name"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="pressable flex h-9 items-center gap-2 rounded-xl bg-ink/[0.04] px-3 text-[13px] font-medium text-ink"
                >
                  <Pencil className="h-4 w-4 text-ink-soft" />
                  {group.avatar && !removeAvatar && !pendingAvatar ? 'Change photo' : pendingAvatar ? 'Pick another photo' : 'Add a photo'}
                </button>
                {(group.avatar && !pendingAvatar && !removeAvatar) && (
                  <button
                    type="button"
                    onClick={() => setRemoveAvatar(true)}
                    className="pressable flex h-9 items-center gap-2 rounded-xl bg-ink/[0.04] px-3 text-[13px] font-medium text-ink"
                  >
                    <X className="h-4 w-4 text-ink-soft" />
                    Remove photo
                  </button>
                )}
                {(pendingAvatar || removeAvatar) && (
                  <button
                    type="button"
                    onClick={() => { setPendingAvatar(null); setRemoveAvatar(false) }}
                    className="pressable flex h-9 items-center gap-2 rounded-xl bg-ink/[0.04] px-3 text-[13px] font-medium text-ink-soft"
                  >
                    <X className="h-4 w-4" />
                    Undo
                  </button>
                )}
              </div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => { setPendingAvatar(e.target.files?.[0] ?? null); setRemoveAvatar(false); e.target.value = '' }} />
              <div className="flex gap-2">
                <button type="button" onClick={() => void saveEdit()} className="pressable flex h-10 flex-1 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
                  Save changes
                </button>
                <button type="button" onClick={cancelEdit} className="pressable flex h-10 flex-1 items-center justify-center rounded-full bg-ink/[0.06] text-[13px] font-semibold text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {group && (
        <GlassCard strong className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <h3 className="text-[13px] font-semibold">Members</h3>
            {group.isAdmin && addableFriends.length > 0 && (
              <button type="button" onClick={() => setAddingMember((prev) => !prev)} className="pressable inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </button>
            )}
          </div>

          <div className="px-3 py-2">
            {addingMember && (
              <div className="mb-2 flex flex-col gap-1 rounded-2xl bg-ink/[0.04] p-2">
                {addableFriends.map((f) => (
                  <button key={f.id} type="button" onClick={() => void addMember(f)} className="pressable flex items-center gap-2 rounded-xl px-2 py-1.5 text-left">
                    <Avatar name={f.username} avatar={f.avatar} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.username}</span>
                    <UserPlus className="h-4 w-4 text-ink-faint" />
                  </button>
                ))}
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {[...(group.members ?? [])].sort((a, b) => (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0)).map(({ user, isAdmin }) => (
                <li key={user.id} className="flex items-center gap-2 px-1 py-1.5">
                  <button type="button" onClick={() => onOpenProfile(user)} className="pressable flex min-w-0 flex-1 items-center gap-2 text-left">
                    <Avatar name={user.username} avatar={user.avatar} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{user.username}</span>
                    {isAdmin && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}
                  </button>
                  {group.isAdmin && !isAdmin && (
                    <button type="button" aria-label={`Make ${user.username} admin`} onClick={() => void promote(user)} className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft">
                      <Crown className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {group.isAdmin && !isAdmin && (
                    <button type="button" aria-label={`Remove ${user.username}`} onClick={() => void removeMember(user)} className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft hover:text-red-500">
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>
      )}

      {group && (
        <div className="flex flex-col gap-2 px-1 pb-4">
          {group.ownerId === meId ? (
            <>
              {transferTarget ? (
                <div className="flex items-center gap-2 px-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">Transfer ownership to <b>{transferTarget.username}</b>?</span>
                  <button type="button" onClick={() => void transfer()} className="pressable rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">Transfer</button>
                  <button type="button" onClick={() => setTransferTarget(null)} className="pressable rounded-full bg-ink/[0.06] px-3 py-1.5 text-[12px] font-semibold text-ink-soft">Cancel</button>
                </div>
              ) : !deleteConfirm ? (
                <button type="button" onClick={() => setTransferOpen((prev) => !prev)} className="pressable flex h-9 items-center gap-2 rounded-xl bg-ink/[0.04] px-3 text-[13px] font-medium text-ink">
                  <ShieldCheck className="h-4 w-4 text-ink-soft" />
                  Transfer ownership
                </button>
              ) : null}
              {transferOpen && transferTarget === null && (
                <div className="flex flex-col gap-1 rounded-xl bg-ink/[0.04] p-2">
                  {adminMembers.length === 0 && <p className="px-2 py-1 text-[12px] text-ink-faint">Promote another admin first.</p>}
                  {adminMembers.map((m) => (
                    <button key={m.user.id} type="button" onClick={() => setTransferTarget(m.user)} className="pressable flex items-center gap-2 rounded-lg px-2 py-1.5 text-left">
                      <Avatar name={m.user.username} avatar={m.user.avatar} size={26} />
                      <span className="truncate text-[13px] font-medium">{m.user.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {deleteConfirm ? (
                <div className="flex items-center gap-2 px-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">Delete the group for everyone?</span>
                  <button type="button" onClick={() => void deleteTheGroup()} className="pressable rounded-full bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white">Delete</button>
                  <button type="button" onClick={() => setDeleteConfirm(false)} className="pressable rounded-full bg-ink/[0.06] px-3 py-1.5 text-[12px] font-semibold text-ink-soft">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setDeleteConfirm(true)} className="pressable flex h-9 items-center gap-2 rounded-xl bg-red-500/10 px-3 text-[13px] font-medium text-red-500">
                  <Trash2 className="h-4 w-4" />
                  Delete group
                </button>
              )}
            </>
          ) : leaveConfirm ? (
            <div className="flex items-center gap-2 px-2">
              <span className="min-w-0 flex-1 truncate text-[13px]">Leave this group?</span>
              <button type="button" onClick={() => void leave()} className="pressable rounded-full bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white">Leave</button>
              <button type="button" onClick={() => setLeaveConfirm(false)} className="pressable rounded-full bg-ink/[0.06] px-3 py-1.5 text-[12px] font-semibold text-ink-soft">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setLeaveConfirm(true)} className="pressable flex h-9 items-center gap-2 rounded-xl bg-red-500/10 px-3 text-[13px] font-medium text-red-500">
              <LogOut className="h-4 w-4" />
              Leave group
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  )
}