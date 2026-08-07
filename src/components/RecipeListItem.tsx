import { Bookmark, ChefHat, Clock } from 'lucide-react'
import type { Recipe } from '@/lib/types'
import { GlassCard } from './GlassCard'

interface RecipeListItemProps {
  recipe: Recipe
  isSaved: boolean
  onOpen: () => void
  onToggleSaved: () => void
}

export function RecipeListItem({ recipe, isSaved, onOpen, onToggleSaved }: RecipeListItemProps) {
  return (
    <GlassCard className="overflow-hidden">
      <button type="button" onClick={onOpen} className="pressable block w-full text-left">
        <div className="flex items-center gap-4 p-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-ink/5">
            {recipe.image ? (
              <img
                src={recipe.image}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ChefHat className="h-6 w-6 text-ink/40" strokeWidth={1.6} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[15px] font-semibold text-ink">{recipe.title}</h4>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
              {recipe.time && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {recipe.time}
                </span>
              )}
              {recipe.area && <span>{recipe.area}</span>}
              <span className="capitalize">{recipe.source}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSaved()
            }}
            aria-pressed={isSaved}
            aria-label={isSaved ? 'Remove from saved' : 'Save recipe'}
            className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/60"
          >
            <Bookmark
              className="h-4.5 w-4.5 text-ink/70"
              strokeWidth={2}
              fill={isSaved ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </button>
    </GlassCard>
  )
}