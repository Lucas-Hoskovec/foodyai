/**
 * Free food-image fallbacks for generated recipes (no key required).
 */

const FALLBACK_BASE = 'https://loremflickr.com'

const FALLBACKS = [
  'food,dish',
  'delicious,meal',
  'gourmet,plate',
  'cooking,cuisine',
  'fresh,ingredients',
]

/** Build a keyword-safe loremflickr URL (they accept comma lists, not spaces). */
export function foodImageFallback(query: string, width = 900, height = 675): string {
  const cleaned = query
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3)
    .join(',')
  const subject = cleaned || FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
  return `${FALLBACK_BASE}/${width}/${height}/${subject}`
}

/** Pick a fallback when a meal has no photo (shouldn't normally happen). */
export function randomFoodImage(): string {
  const subject = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]
  return `${FALLBACK_BASE}/900/675/${subject}`
}