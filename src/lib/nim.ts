import type { Intent, Preferences, Recipe } from './types'
import { nowId, sleep } from './utils'

const BASE_URL = import.meta.env.VITE_NIM_BASE_URL ?? '/api/nim'
export const NIM_MODEL =
  import.meta.env.VITE_NIM_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b'

/** Very conservative pacing so we stay well under the free-tier ~40 req/min cap. */
const MIN_INTERVAL_MS = 1600

const limiter = (() => {
  let tail: Promise<unknown> = Promise.resolve()
  let lastCall = 0
  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      const run = tail.then(async () => {
        const wait = lastCall + MIN_INTERVAL_MS - Date.now()
        if (wait > 0) await sleep(wait)
        lastCall = Date.now()
        return fn()
      })
      tail = run.catch(() => undefined)
      return run
    },
  }
})()

function extractJson(text: string): string {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '')
  let depth = 0
  let inString = false
  let start = -1
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        return cleaned.slice(start, i + 1)
      }
    }
  }
  throw new Error('No balanced JSON object in model response')
}

async function chatCompletion(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  temperature: number,
  maxTokens = 1500,
  jsonObject = false,
): Promise<string> {
  let attempt = 0
  const maxAttempts = 4
  while (true) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_NIM_API_KEY ?? 'n/a'}`,
        },
        body: JSON.stringify({
          model: NIM_MODEL,
          temperature,
          max_tokens: maxTokens,
          messages,
          ...(jsonObject ? { response_format: { type: 'json_object' } } : {}),
        }),
      })

      if (res.status === 429 && attempt < maxAttempts) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt
        attempt += 1
        await sleep(retryAfter * 1000)
        continue
      }

      if (!res.ok) {
        throw new Error(`NIM request failed (${res.status})`)
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Empty model response')
      return content
    } catch (err) {
      if (attempt < maxAttempts) {
        attempt += 1
        await sleep(2 ** attempt * 1000)
        continue
      }
      throw err
    }
  }
}

const PARSE_SYSTEM = `You are Foody, an intent parser inside a voice cooking app.
Convert the user's spoken craving into ONE dish and search details. Be specific but concise.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "dish": "the single best matching dish name, e.g. 'Creamy Tuscan Chicken'",
  "cuisine": "short cuisine or null",
  "dietary": ["dietary notes like vegetarian, vegan, dairy-free, gluten-free, keto"],
  "time": "short prep time if mentioned, e.g. '30 min', otherwise null",
  "keywords": ["3 to 5 ingredient or flavor keywords for photo/recipe search"],
  "searchTerm": "a short 2-4 word search phrase for a recipe database, e.g. 'tuscan chicken'"
}

Rules:
- If they describe ingredients ("chicken and lemon"), pick a classic dish using them.
- If they describe a craving ("something spicy"), pick a popular dish that satisfies it.
- searchTerm must be simple English words, no quotes.
- dietary must be an array (empty if none).
- Do ALL of your thinking silently. Reply with ONLY the JSON object — start with { and end with }. No markdown, no labels, no explanation.`

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').slice(0, 6)
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Parse a raw craving into a structured intent. */
export async function parseIntent(transcript: string, prefs?: Preferences): Promise<Intent> {
  const taste = prefs?.likes.length || prefs?.dislikes.length ? tasteBlock(prefs) : ''
  const content = await limiter.schedule(() =>
    chatCompletion(
      [
        { role: 'system', content: PARSE_SYSTEM + taste },
        { role: 'user', content: transcript },
      ],
      0.2,
      1800,
    ),
  )

  const raw = JSON.parse(extractJson(content)) as {
    dish?: unknown
    cuisine?: unknown
    dietary?: unknown
    time?: unknown
    keywords?: unknown
    searchTerm?: unknown
  }

  const dish = safeString(raw.dish)
  if (!dish) throw new Error('Could not parse intent')

  const keywords = safeArray(raw.keywords)
  const searchTerm =
    safeString(raw.searchTerm) ??
    keywords.slice(0, 3).join(' ') ??
    dish.split(' ').slice(0, 3).join(' ')

  return {
    dish,
    cuisine: safeString(raw.cuisine),
    dietary: safeArray(raw.dietary),
    time: safeString(raw.time),
    keywords,
    searchTerm,
  }
}

/** Build a taste-profile hint block for the model (used by parse + generate). */
function tasteBlock(prefs: Preferences): string {
  const likes = prefs.likes.length ? prefs.likes.join(', ') : '(none specified)'
  const dislikes = prefs.dislikes.length ? prefs.dislikes.join(', ') : '(none specified)'
  return `

Personal taste profile (treat as guidance):
- Likes (favor dishes built around these): ${likes}
- Dislikes (steer clear of these): ${dislikes}`
}

const RECIPE_SYSTEM = `You are Foody, an elite chef writing a genuinely cookable, delicious recipe from scratch.

Think about flavor first, then technique, then structure:
- Choose the cooking method that fits the dish (sear, braise, roast, simmer, steam, stir-fry...).
- Engineer flavor balance: fat (protein, butter, cream, olive oil), acid (lemon, vinegar, wine), salt/umami (stock, soy, parmesan, miso, fish sauce), and heat (chili, pepper) suited to the cuisine.
- Every ingredient must serve a purpose and carry a precise quantity (grams, ml, cups, cloves, "1 large", "a pinch").
- Steps must be ordered by real kitchen workflow (prep -> cook -> finish), one action each, and together fully cook the dish. Include technique cues: heat level, color/doneness, time.
- Steps and ingredients must match perfectly: no ingredient appears in a step without being listed, and none is stranded unused.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "title": "dish name",
  "time": "total time e.g. '45 min'",
  "servings": "e.g. '4'",
  "ingredients": [{"name": "ingredient", "measure": "amount with unit"}],
  "steps": ["step 1", "step 2", "...between 6 and 10 numbered steps"],
  "tips": ["2 to 4 short pro tips"]
}
Rules:
- 8-14 ingredients, 6-10 steps, complete enough to actually cook from.
- Metric measurements where natural. tags lowercase, 1-3 words each.
- Do ALL thinking silently. Reply with ONLY the JSON object starting with { and ending with }. No reasoning, no prose, no explanation.`

type RecipeRaw = {
  title?: unknown
  time?: unknown
  servings?: unknown
  tags?: unknown
  ingredients?: unknown
  steps?: unknown
  tips?: unknown
}

function buildRecipe(raw: RecipeRaw, intent: Intent & { dish: string }): Recipe {
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .map((item: unknown) => {
          const entry = item as { name?: unknown; measure?: unknown }
          return {
            name: safeString(entry.name) ?? '',
            measure: safeString(entry.measure) ?? '',
          }
        })
        .filter((entry) => entry.name)
    : []

  const steps = safeArray(raw.steps)

  if (!ingredients.length || steps.length === 0) {
    throw new Error('Model returned an incomplete recipe')
  }

  return {
    id: `nim-${nowId()}`,
    title: safeString(raw.title) ?? intent.dish,
    image: '',
    source: 'nim',
    tags: safeArray(raw.tags),
    ingredients,
    steps,
    tips: safeArray(raw.tips),
    time: safeString(raw.time),
    servings: safeString(raw.servings),
    query: intent.searchTerm,
    createdAt: Date.now(),
  }
}

function intentPrompt(intent: Intent, prefs?: Preferences): string {
  return [
    `Dish: ${intent.dish}`,
    intent.cuisine ? `Cuisine: ${intent.cuisine}` : null,
    intent.dietary.length ? `Dietary: ${intent.dietary.join(', ')}` : null,
    intent.time ? `Budget time: ${intent.time}` : null,
    intent.keywords.length ? `Flavor keywords: ${intent.keywords.join(', ')}` : null,
    prefs?.likes.length ? `User likes: ${prefs.likes.join(', ')}` : null,
    prefs?.dislikes.length ? `User DISLIKES (never use these as ingredients): ${prefs.dislikes.join(', ')}` : null,
    prefs?.likes.length || prefs?.dislikes.length
      ? 'Taste rule: build the recipe around what the user likes, and never include an ingredient from the dislikes list.'
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Write a full structured recipe in a single pass (fast). */
export async function generateRecipe(intent: Intent, prefs?: Preferences): Promise<Recipe> {
  const prompt = intentPrompt(intent, prefs)

  const content = await limiter.schedule(() =>
    chatCompletion(
      [
        { role: 'system', content: RECIPE_SYSTEM },
        { role: 'user', content: prompt },
      ],
      0.4,
      20000,
      true,
    ),
  )

  return buildRecipe(JSON.parse(extractJson(content)), intent)
}

/** Full pipeline: intent -> recipe. */
export function parseTranscript(transcript: string) {
  return parseIntent(transcript)
}

const PREFS_SYSTEM = `You are Foody, a personal taste assistant for a cooking app.
A user is telling you, out loud or in text, what they like and dislike to eat.
You are given their CURRENT stored lists and their new spoken statement.

Merge the statement into the lists:
- Liked foods/flavors go into "likes".
- Disliked foods/flavors go into "dislikes".
- If they reveal they changed their mind, move the item to the right list (e.g. "I used to hate mushrooms but now I love them").
- Ignore anything that is not a food preference.
- De-duplicate, keep phrasing short (1-3 words, lowercase), keep the most specific wording.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "likes": ["full, merged list of things they like"],
  "dislikes": ["full, merged list of things they dislike"]
}
Both arrays must contain the ENTIRE updated list (existing items plus any changes), not just the new ones.`

/** Update the user's food-preferences from a spoken/text update. */
export async function updatePreferences(transcript: string, current: Preferences): Promise<Preferences> {
  const content = await limiter.schedule(() =>
    chatCompletion(
      [
        { role: 'system', content: PREFS_SYSTEM },
        {
          role: 'user',
          content: `Current likes: ${current.likes.join(', ') || '(none)'}\nCurrent dislikes: ${
            current.dislikes.join(', ') || '(none)'
          }\n\nWhat the user said: ${transcript}`,
        },
      ],
      0.2,
    ),
  )

  const raw = JSON.parse(extractJson(content)) as { likes?: unknown; dislikes?: unknown }
  const dedupe = (list: string[]) =>
    Array.from(new Set(list.map((item) => item.toLowerCase().trim()).filter(Boolean)))
  const likes = dedupe(safeArray(raw.likes)).slice(0, 50)
  const dislikes = dedupe(safeArray(raw.dislikes)).slice(0, 50)

  return { likes, dislikes, lastSpeech: transcript }
}

export { limiter }
