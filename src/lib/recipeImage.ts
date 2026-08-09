export interface RecipeImageResult {
  image: string
  credit: string
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'with', 'in', 'of', 'at', 'to', 'from', 'on',
  'style', 'styled', 'easy', 'simple', 'homemade', 'home-style', 'best',
  'quick', 'slow', 'perfect', 'delicious', 'tasty', 'classic', 'authentic',
])

/**
 * Words that describe HOW a dish is served rather than WHAT it is. A candidate
 * may miss these tokens and still be the right dish (e.g. "Spaghetti carbonara"
 * is the page "Carbonara"), but it must never miss a real ingredient or a
 * defining word like "beef" in "beef stew".
 */
const SERVING_WORDS = new Set([
  'spaghetti', 'linguine', 'tagliatelle', 'fettuccine', 'penne', 'macaroni',
  'fusilli', 'rigatoni', 'orzo', 'pasta', 'noodles', 'rice', 'bun', 'roll',
  'bread', 'toast', 'tortilla', 'pita', 'wrap', 'bowl', 'pot', 'pan',
  'skillet', 'tray', 'oven', 'baked', 'roast', 'roasted', 'grilled', 'fried',
])

/** Filler words that appear in dish titles but add no meaning (e.g. "alla"). */
const FILLER_WORDS = new Set([
  'alla', 'al', 'con', 'e', 'di', 'del', 'della', 'de', 'du', 'des',
  'with', 'and', 'in', 'of', 'on',
])

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

/** Normalize a phrase into canonical singular significant tokens for matching. */
function significantTokens(phrase: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const token of phrase
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)) {
    if (STOP_WORDS.has(token)) continue
    const canonical = naiveSingular(token)
    if (canonical.length > 1 && !seen.has(canonical)) {
      seen.add(canonical)
      tokens.push(canonical)
    }
  }
  return tokens
}

/** Naively pluralize-aware match helper ("pancakes" ~ "pancake"). */
function naiveSingular(word: string): string {
  if (word.length <= 4 || !word.endsWith('s')) return word
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`
  return word.slice(0, -1)
}

/** Remove a leading "File:" prefix and extension from a Commons file title. */
function fileNameToken(title: string): string[] {
  const base = title.replace(/^File:/i, '').replace(/\.[a-z0-9]{2,5}$/i, '')
  return significantTokens(base)
}

/** How strongly a candidate's token set matches the dish's significant tokens. */
function matchScore(needle: Set<string>, candidate: string): number | null {
  const cTokens = significantTokens(candidate)
  if (!cTokens.length) return null
  const haystack = new Set(cTokens)
  let hits = 0
  const missing: string[] = []
  for (const token of needle) {
    if (haystack.has(token)) hits++
    else missing.push(token)
  }
  if (hits === 0) return null
  const recall = hits / needle.size
  const precision = hits / cTokens.length

  // Any word the candidate introduces that isn't in the dish and isn't a
  // serving/filler word means it's a different subject ("Banana Pancake Trail").
  const extras = cTokens.filter((t) => !needle.has(t) && !SERVING_WORDS.has(t) && !FILLER_WORDS.has(t))

  // Perfect coverage (after canonicalization) is trusted when nothing extra
  // names a different thing.
  if (recall >= 1 && extras.length === 0 && precision >= 0.5) return recall * precision

  // Partial coverage is only allowed when every missing token describes how the
  // dish is served ("spaghetti carbonara" -> page "Carbonara"), never a defining
  // word ("beef stew" -> page "Stew" is NOT beef stew).
  const droppable = missing.length > 0 && missing.every((t) => SERVING_WORDS.has(t))
  if (droppable && recall >= 0.5 && precision >= 0.5) return (recall + precision) / 2
  return null
}

/** Expanded object URL (from the original file, not the page thumbnail) for an article. */
async function articleLeadImage(title: string, needle: Set<string>): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'pageimages',
    piprop: 'original|thumbnail',
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`${WIKIPEDIA_API}?${params}`)
  if (res.ok) {
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string }; original?: { source?: string } }> }
    }
    for (const page of Object.values(data.query?.pages ?? {})) {
      const original = page.original?.source
      if (original && /\.(jpe?g|png|webp)(\?|$)/i.test(original)) return original
      if (page.thumbnail?.source) return page.thumbnail.source
    }
  }

  // Some articles have no lead-image marker. List the page's image files and pick
  // the photo whose filename names the dish (e.g. "Chicken curry" -> "Chicken curries.jpg").
  const listParams = new URLSearchParams({
    action: 'query',
    generator: 'images',
    titles: title,
    gimlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url',
    format: 'json',
    origin: '*',
  })
  const listRes = await fetch(`${WIKIPEDIA_API}?${listParams}`)
  if (!listRes.ok) return null
  const data = (await listRes.json()) as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ url?: string }> }> }
  }
  const photos = Object.values(data.query?.pages ?? {})
    .map((page) => ({ title: page.title ?? '', url: page.imageinfo?.[0]?.url ?? '' }))
    .filter((p) => p.url && /\.(jpe?g|png|webp)(\?|$)/i.test(p.url))
    .sort((a, b) => scoreFilename(b, needle) - scoreFilename(a, needle))
  return photos[0]?.url ?? null
}

/** Prefer file names that actually mention the dish. */
function scoreFilename(photo: { title: string }, needle: Set<string>): number {
  const tokens = fileNameToken(photo.title)
  if (!tokens.length) return 0
  let hits = 0
  for (const token of needle) if (tokens.includes(token)) hits++
  return hits / needle.size
}

/** Try to find an exact Wikipedia article for the dish, then its lead photo. */
async function wikipediaImage(query: string, needle: Set<string>): Promise<RecipeImageResult | null> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '8',
    srnamespace: '0',
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`${WIKIPEDIA_API}?${params}`)
  if (!res.ok) return null
  const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } }
  const matches = (data.query?.search ?? [])
    .filter((entry) => !/^list of/i.test(entry.title) && !/\(disambiguation\)/i.test(entry.title))
    .map((entry) => ({ title: entry.title, score: matchScore(needle, entry.title) }))
    .filter((entry): entry is { title: string; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
  if (!matches.length) return null

  const bestTitle = matches[0].title
  const image = await articleLeadImage(bestTitle, needle)
  if (!image) return null
  return { image, credit: `Wikipedia: ${bestTitle}` }
}

/** Fall back to Wikimedia Commons photo search with strict filename verification. */
async function commonsImage(query: string, needle: Set<string>): Promise<RecipeImageResult | null> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url',
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`${COMMONS_API}?${params}`)
  if (!res.ok) return null
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; index?: number; imageinfo?: Array<{ url?: string }> }
      >
    }
  }
  const pages = Object.values(data.query?.pages ?? {})
    .filter((page) => page.title && page.imageinfo?.length)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  for (const page of pages) {
    const tokens = fileNameToken(page.title ?? '')
    if (!tokens.length) continue
    let hits = 0
    for (const token of needle) if (tokens.includes(token)) hits++
    const recall = hits / needle.size
    const precision = hits / tokens.length
    const strong = hits > 0 && recall >= 1
    const acceptable = hits > 0 && needle.size > 1 && recall >= 0.5 && precision >= 0.5
    if (!strong && !acceptable) continue
    const url = page.imageinfo?.[0]?.url
    if (!url || !/\.(jpe?g|png|webp)(\?|$)/i.test(url)) continue
    return { image: url, credit: 'Wikimedia Commons' }
  }
  return null
}

// Tiny in-memory cache so re-opened/saved recipes don't re-hit the wikis.
const cache = new Map<string, RecipeImageResult | null>()
const CACHE_MAX = 100

export async function findRecipeImage(input: {
  title: string
  searchTerm?: string
}): Promise<RecipeImageResult | null> {
  const title = input.title.trim()
  if (!title) return null

  const needle = new Set(significantTokens(title))
  const query = needle.size >= 2 ? [...needle].join(' ') : title
  const cacheKey = query.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const fallback = input.searchTerm?.trim() || title
  const result =
    (await wikipediaImage(query, needle)) ?? (await commonsImage(query, needle)) ??
    (fallback !== title ? await commonsImage(fallback, needle) : null)

  cache.set(cacheKey, result)
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return result
}