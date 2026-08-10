import { useRef, useState } from 'react'
import { Camera, ImagePlus, RotateCcw, Send, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Post, Recipe } from '@/lib/types'
import { cn } from '@/lib/utils'
import { RecipePicker } from './RecipePicker'

interface CreatePostModalProps {
  saved: Recipe[]
  history: Recipe[]
  onCreated: (post: Post) => void
  onClose: () => void
}

export function CreatePostModal({ saved, history, onCreated, onClose }: CreatePostModalProps) {
  const [picking, setPicking] = useState(false)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickRecipe = (r: Recipe) => {
    setRecipe(r)
    setImage((prev) => prev || r.image)
    setPicking(false)
  }

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const path = await api.socialUploadImage(file)
      setImage(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const post = await api.socialCreatePost({
        recipeId: recipe?.id,
        recipe: recipe ?? undefined,
        title: title.trim(),
        description: description.trim(),
        image,
      })
      onCreated(post)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create post">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong relative w-full max-w-sm overflow-hidden rounded-3xl shadow-[var(--shadow-glass)]">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-[18px] font-bold">New post</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3 px-5 pb-6">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="pressable flex w-full items-center gap-3 rounded-2xl bg-ink/[0.05] p-2 text-left"
          >
            {image ? (
              <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink/10">
                <ImagePlus className="h-6 w-6 text-ink/50" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">
                {recipe ? recipe.title : 'Choose a saved recipe'}
              </span>
              <span className="block text-[12px] text-ink-soft">Picture + recipe from saved or history</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="pressable inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-ink/70"
            >
              <Camera className="h-3.5 w-3.5" />
              {image && image !== recipe?.image ? 'Change photo' : 'Add photo'}
            </button>
            {recipe && image !== recipe.image && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setImage(recipe.image)}
                className="pressable inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-ink/70"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Use recipe photo
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void uploadPhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={120}
            className="input"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your dish…"
            maxLength={500}
            rows={3}
            className="input resize-none"
          />

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <button
            type="button"
            disabled={!title.trim() || busy}
            onClick={() => void publish()}
            className={cn(
              'pressable flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-semibold text-white disabled:opacity-40',
            )}
          >
            {busy ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white [animation:spin_0.8s_linear_infinite]" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {picking && <RecipePicker saved={saved} history={history} onSelect={pickRecipe} onClose={() => setPicking(false)} />}
    </div>
  )
}