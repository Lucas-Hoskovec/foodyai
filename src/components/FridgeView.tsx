import { useState } from 'react'
import { Check, Pencil, Plus, Refrigerator, Trash2, X } from 'lucide-react'
import type { FridgeItem } from '@/lib/types'
import { FRIDGE_CATEGORIES } from '@/lib/nim'
import { EmptyState } from '@/components/EmptyState'
import { GlassCard } from '@/components/GlassCard'

interface FridgeViewProps {
  items: FridgeItem[]
  onOpenAdd: () => void
  onChange: (next: FridgeItem[]) => void
}

function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

export function FridgeView({ items, onOpenAdd, onChange }: FridgeViewProps) {
  const [editing, setEditing] = useState<FridgeItem | null>(null)
  const groups = FRIDGE_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex min-h-full flex-col pb-10">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">My Fridge</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} inside` : 'Your stocked shelves'}
          </p>
        </div>
        <div className="glass-strong flex h-12 w-12 items-center justify-center rounded-2xl">
          <Refrigerator className="h-6 w-6 text-ink" strokeWidth={1.8} />
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-16">
          <EmptyState
            icon={Refrigerator}
            title="Your fridge is empty"
            description="Tap the + button and tell Foody AI what you've got inside — it will sort everything into categories."
          />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {groups.map((group) => (
            <GlassCard key={group.category} className="overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3.5">
                <h2 className="text-[15px] font-semibold">{group.category}</h2>
                <span className="text-[13px] font-normal text-ink-faint">{group.items.length}</span>
              </div>
              <ul className="mt-1 pb-2">
                {group.items.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">
                        {capitalize(item.name)}
                      </span>
                      {item.amount && (
                        <span className="block text-[12px] text-ink-soft">{item.amount}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => setEditing(item)}
                      className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => onChange(items.filter((entry) => entry !== item))}
                      className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label="Add groceries"
        onClick={onOpenAdd}
        className="pressable absolute right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] bottom-[calc(max(env(safe-area-inset-bottom),14px)+86px)]"
      >
        <Plus className="h-6 w-6" strokeWidth={2.2} />
      </button>

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            onChange(items.map((entry) => (entry === editing ? next : entry)))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: FridgeItem
  onClose: () => void
  onSave: (next: FridgeItem) => void
}) {
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(item.amount)
  const trimmed = name.trim()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Edit item">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6 text-center shadow-[var(--shadow-glass)]">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="pressable absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-[19px] font-bold">Edit item</h2>
        <p className="mx-auto mt-0.5 text-[12px] capitalize text-ink-soft">{item.category}</p>

        <div className="mt-5 flex flex-col gap-3 text-left">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-soft">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. chicken breast"
              className="input"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-soft">Amount</span>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500 g"
              className="input"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="pressable h-11 flex-1 rounded-full bg-ink/[0.06] text-[14px] font-semibold text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() =>
              onSave({
                ...item,
                name: trimmed,
                amount: amount.trim(),
              })
            }
            className="pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-semibold text-white disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
