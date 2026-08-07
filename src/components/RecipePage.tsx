import { useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Bookmark, Camera, ChefHat, Clock, ListChecks, Utensils, Users } from 'lucide-react'
import type { Recipe } from '@/lib/types'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { GlassCard } from './GlassCard'
import { TagChip } from './TagChip'

type Section = 'ingredients' | 'steps'

interface RecipePageProps {
  recipe: Recipe
  isSaved: boolean
  onBack: () => void
  onToggleSave: () => void
  onImageUploaded: (recipe: Recipe) => void
}

function HeroFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(120%_120%_at_20%_0%,#f2f0ee_0%,#e6e4e3_60%,#dcdbdc_100%)]">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/70 shadow-[var(--shadow-glass)]">
        <ChefHat className="h-10 w-10 text-ink/50" strokeWidth={1.5} />
      </div>
      <span className="px-8 text-center text-base font-semibold text-ink/70">{title}</span>
    </div>
  )
}

export function RecipePage({ recipe, isSaved, onBack, onToggleSave, onImageUploaded }: RecipePageProps) {
  const [section, setSection] = useState<Section>('ingredients')
  const [badImage, setBadImage] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const image = await api.uploadRecipeImage(recipe.id, file)
      setBadImage(false)
      onImageUploaded({ ...recipe, image })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const meta: Array<{ icon: ReactNode; label: string }> = []
  if (recipe.time) meta.push({ icon: <Clock className="h-4 w-4" />, label: recipe.time })
  if (recipe.servings) meta.push({ icon: <Users className="h-4 w-4" />, label: `${recipe.servings} servings` })
  if (recipe.area) meta.push({ icon: <Utensils className="h-4 w-4" />, label: recipe.area })
  if (recipe.category) meta.push({ icon: <ChefHat className="h-4 w-4" />, label: recipe.category })

  const showImage = recipe.image && !badImage

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-32">
      {/* Hero */}
      <div className="relative h-[440px] min-h-[320px] w-full overflow-hidden rounded-b-[2.5rem]">
        <div className="absolute inset-0">
          {showImage ? (
            <img
              src={recipe.image}
              alt={`${recipe.title} — ${recipe.imageCredit ?? 'recipe photo'}`}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setBadImage(true)}
            />
          ) : (
            <HeroFallback title={recipe.title} />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-black/10" />

        {/* Top controls */}
        <div className="absolute inset-x-0 top-0 z-10 p-4 pt-[max(env(safe-area-inset-top),16px)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="glass-strong pressable flex h-11 w-11 items-center justify-center rounded-full text-ink"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {isSaved && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    aria-label="Upload photo"
                    className="glass-strong pressable flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-ink"
                  >
                    <Camera className="h-4 w-4" />
                    {uploading ? 'Adding…' : recipe.image ? 'Change photo' : 'Add photo'}
                  </button>
                  {uploadError && (
                    <span className="glass-strong max-w-[200px] rounded-full px-3 py-1.5 text-[11px] font-medium text-red-500">
                      {uploadError}
                    </span>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={onToggleSave}
                aria-pressed={isSaved}
                aria-label={isSaved ? 'Remove from saved' : 'Save recipe'}
                className="glass-strong pressable flex h-11 w-11 items-center justify-center rounded-full text-ink"
              >
                <Bookmark className="h-5 w-5" strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 -mt-8 px-4">
        <GlassCard strong className="px-5 pb-6 pt-6">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
            {recipe.title}
          </h1>

          {meta.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {meta.map((m, i) => (
                <span
                  key={i}
                  className="glass-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink/75"
                >
                  {m.icon}
                  {m.label}
                </span>
              ))}
            </div>
          )}

          {recipe.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recipe.tags.map((tag) => (
                <TagChip key={tag} label={tag} />
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard strong className="mt-5 flex items-center gap-1 p-1">
          {(
            [
              { key: 'ingredients', label: 'Ingredients', icon: <ListChecks className="h-4 w-4" /> },
              { key: 'steps', label: 'Steps', icon: <Utensils className="h-4 w-4" /> },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSection(tab.key)}
              className={cn(
                'pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors',
                section === tab.key
                  ? 'bg-white/90 text-ink shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
                  : 'text-ink-soft',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </GlassCard>

        <div className="mt-5">
          {section === 'ingredients' && (
            <GlassCard className="px-5 py-2">
              <ul className="divide-y divide-black/5">
                {recipe.ingredients.map((ingredient, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-[15px] text-ink">{ingredient.name}</span>
                    {ingredient.measure && (
                      <span className="shrink-0 text-sm font-medium text-ink-soft">
                        {ingredient.measure}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {section === 'steps' && (
            <ol className="space-y-3">
              {recipe.steps.map((step, i) => (
                <GlassCard key={i} className="flex items-start gap-4 px-5 py-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-[13px] font-bold text-ink/70">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-[15px] leading-relaxed text-ink">{step}</p>
                </GlassCard>
              ))}
            </ol>
          )}

          {recipe.tips.length > 0 && (
            <GlassCard className="mt-4 px-5 py-4">
              <h3 className="mb-2 text-sm font-semibold text-ink/60">Pro tips</h3>
              <ul className="space-y-3">
                {recipe.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-ink">
                    <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-ink/40" strokeWidth={1.8} />
                    {tip}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  )
}