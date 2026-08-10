import { useState } from 'react'
import { Bookmark, Check, ChevronRight, Clock, Search } from 'lucide-react'
import type { Recipe } from '@/lib/types'
import { cn } from '@/lib/utils'
import { GlassCard } from './GlassCard'

interface RecipePickerProps {
  title?: string
  saved: Recipe[]
  history: Recipe[]
  onSelect: (recipe: Recipe) => void
  onClose: () => void
}

/** Pick a recipe from Saved or History to attach to a post or send in a group chat. */
export function RecipePicker({ saved, history, onSelect, onClose }: RecipePickerProps) {
  const [section, setSection] = useState<'saved' | 'history'>('saved')
  const list = section === 'saved' ? saved : history

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Choose a recipe">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong relative flex max-h-[82%] w-full max-w-sm flex-col overflow-hidden rounded-3xl shadow-[var(--shadow-glass)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-[18px] font-bold">Choose a recipe</h2>
          <button
            type="button"
            onClick={onClose}
            className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
          >
            <span aria-hidden className="text-[15px] leading-none">×</span>
          </button>
        </div>

        <GlassCard strong className="mx-4 flex items-center gap-1 p-1">
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
              className={cn(
                'pressable flex h-9 flex-1 items-center justify-center gap-1 rounded-full text-[12px] font-semibold',
                section === seg.key ? 'bg-white/90 text-ink shadow-[0_2px_10px_rgba(0,0,0,0.1)]' : 'text-ink-soft',
              )}
            >
              {seg.icon}
              {seg.label}
            </button>
          ))}
        </GlassCard>

        <div className="mt-3 flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Search className="h-5 w-5 text-ink-faint" />
              <p className="max-w-[200px] text-[13px] leading-snug text-ink-faint">
                {section === 'saved' ? 'You have no saved recipes yet.' : 'No recently searched recipes yet.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => onSelect(recipe)}
                  className="pressable flex items-center gap-3 rounded-2xl bg-ink/[0.04] p-2 text-left"
                >
                  {recipe.image ? (
                    <img src={recipe.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink/10 text-[13px] font-semibold text-ink/70">
                      {recipe.title.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{recipe.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="pressable flex h-11 w-full items-center justify-center gap-1.5 rounded-b-3xl bg-ink text-[14px] font-semibold text-white"
        >
          <Check className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}