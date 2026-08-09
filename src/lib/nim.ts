import type { FridgeItem, Intent, Preferences, Recipe } from './types'
import { nowId, sleep } from './utils'

const BASE_URL = import.meta.env.VITE_NIM_BASE_URL ?? '/api/nim'
export const NIM_MODEL =
  import.meta.env.VITE_NIM_MODEL ?? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

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
  options?: { instruct?: boolean },
): Promise<string> {
  let attempt = 0
  const maxAttempts = 4
  while (true) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: NIM_MODEL,
          temperature,
          max_tokens: maxTokens,
          messages,
          ...(jsonObject ? { response_format: { type: 'json_object' } } : {}),
          ...(options?.instruct
            ? { top_k: 1, chat_template_kwargs: { enable_thinking: false } }
            : {}),
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

const PARSE_SYSTEM = `You are Foody AI, an intent parser inside a voice cooking app.
Convert the user's spoken craving into ONE dish and search details. Be specific but concise.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "dish": "the single best matching dish name, e.g. 'Creamy Tuscan Chicken'",
  "cuisine": "short cuisine or null",
  "dietary": ["dietary notes like vegetarian, vegan, dairy-free, gluten-free, keto"],
  "time": "short prep time if mentioned, e.g. '30 min', otherwise null",
  "keywords": ["3 to 5 ingredient or flavor keywords for photo/recipe search"],
  "searchTerm": "a short 2-4 word search phrase for a recipe database, e.g. 'tuscan chicken'",
  "imageKeywords": ["3 to 4 short, highly-visual, photo-search-friendly terms for finding a photo of this exact dish, e.g. 'grilled salmon','roasted asparagus','lemon butter']"
}

Rules:
- If they describe ingredients ("chicken and lemon"), pick a classic dish using them.
- If they describe a craving ("something spicy"), pick a popular dish that satisfies it.
- searchTerm must be simple English words, no quotes.
- imageKeywords must be short specific photo terms (about the plated dish + ingredients), NOT generic words like "food", "recipe", "delicious".
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
export async function parseIntent(
  transcript: string,
  prefs?: Preferences,
  fridge?: FridgeItem[],
): Promise<Intent> {
  const taste = prefs?.likes.length || prefs?.dislikes.length ? tasteBlock(prefs) : ''
  const fridgeBlock = fridge?.length
    ? `\n\nIMPORTANT — fridge cooking is ON. The user's available ingredients are:
${fridge.map((item) => `- ${item.amount ? `${item.amount} ` : ''}${item.name}`).join('\n')}

Choose the dish based on THESE ingredients first: pick the best dish that can be made almost entirely from what's on the list (thinking of the amounts, e.g. you can't fry a whole chicken with 200 g of it). Weigh the user's spoken craving second. If they name a dish that can't be made from the list, pick the best realistic alternative that CAN.`
    : ''
  const content = await limiter.schedule(() =>
    chatCompletion(
      [
        { role: 'system', content: PARSE_SYSTEM + taste },
        { role: 'user', content: transcript + fridgeBlock },
      ],
      0.2,
      1024,
      false,
      { instruct: true },
    ),
  )

  const raw = JSON.parse(extractJson(content)) as {
    dish?: unknown
    cuisine?: unknown
    dietary?: unknown
    time?: unknown
    keywords?: unknown
    searchTerm?: unknown
    imageKeywords?: unknown
  }

  const dish = safeString(raw.dish)
  if (!dish) throw new Error('Could not parse intent')

  const keywords = safeArray(raw.keywords)
  const imageKeywords = safeArray(raw.imageKeywords).slice(0, 4)
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
    imageKeywords,
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

const RECIPE_SYSTEM = `You are Foody AI, an elite chef writing a genuinely cookable, delicious recipe from scratch.

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

function intentPrompt(intent: Intent, prefs?: Preferences, fridge?: FridgeItem[]): string {
  const fridgeBlock = fridge?.length
    ? `Fridge stock — this is ALL the user has, so the recipe MUST be built entirely from these ingredients and nothing else:\n${fridge
        .map((item) => `- ${item.amount ? `${item.amount} ` : ''}${item.name}`)
        .join('\n')}`
    : null
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
    fridgeBlock
      ? `${fridgeBlock}\nStrict fridge rule: choose only the ingredients from the fridge list that actually fit the dish, and use ONLY those — do NOT use every fridge item. Every ingredient in the recipe MUST come from the fridge list above (or water/salt/black pepper). Do not add any ingredient that is not in the fridge and not salt/water/pepper.`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Write a full structured recipe in a single pass (fast). */
export async function generateRecipe(
  intent: Intent,
  prefs?: Preferences,
  fridge?: FridgeItem[],
): Promise<Recipe> {
  const prompt = intentPrompt(intent, prefs, fridge)

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

const PREFS_SYSTEM = `You are Foody AI, a personal taste assistant for a cooking app.
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
      1024,
      false,
      { instruct: true },
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

// ---- Fridge inventory ----

/** Canonical categories the model may assign a fridge item to. */
export const FRIDGE_CATEGORIES = [
  'Vegetables',
  'Fruit',
  'Meat',
  'Dairy & Eggs',
  'Seafood',
  'Grains & Bread',
  'Herbs & Spices',
  'Condiments & Sauces',
  'Beverages',
  'Frozen',
  'Snacks',
  'Other',
]

const FRIDGE_SYSTEM = `You are Foody AI, managing the user's home fridge inventory in a cooking app.
A user tells you, out loud or in text, what groceries they have in their fridge/pantry right now.
You are given their CURRENT stored fridge items and their new spoken statement.

Update the inventory:
- Add any new grocery items they mention, with a short, human-friendly amount (e.g. "1", "500 g", "half a carton", "a pinch").
- If they mention an amount for an item you already have, update that item's amount.
- If they say they used up / finished / ate / ran out of something ("I finished the milk", "no more eggs"), REMOVE that item.
- Ignore anything that is not a food item (instructions, small talk, recipe requests).
- Assign every item to exactly one category from this allowed list: ${FRIDGE_CATEGORIES.join(', ')}.
- De-duplicate by name; keep names short and singular (e.g. "chicken breast", "cheddar cheese").

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "items": [
    {"name": "item name", "amount": "short amount", "category": "one allowed category"},
    "..."
  ]
}
The items array must contain the ENTIRE updated fridge (existing items plus any changes), not just the new ones.`

const FRIDGE_MAX_ITEMS = 60

/** Update the user's fridge inventory from a spoken/text statement. */
export async function updateFridge(transcript: string, current: FridgeItem[]): Promise<FridgeItem[]> {
  const content = await limiter.schedule(() => {
    const lines = current.length
      ? current.map((item) => `${item.amount ? `${item.amount} ` : ''}${item.name}`).join('; ')
      : '(empty)'
    return chatCompletion(
      [
        { role: 'system', content: FRIDGE_SYSTEM },
        {
          role: 'user',
          content: `Current fridge: ${lines}\n\nWhat the user said: ${transcript}`,
        },
      ],
      0.2,
      1500,
      true,
      { instruct: true },
    )
  })

  const raw = JSON.parse(extractJson(content)) as { items?: unknown }
  const rawItems = Array.isArray(raw.items) ? raw.items : []
  const seen = new Set<string>()
  const items: FridgeItem[] = []

  for (const entry of rawItems) {
    const item = entry as { name?: unknown; amount?: unknown; category?: unknown }
    const name = safeString(item.name)?.toLowerCase()
    if (!name) continue
    const key = name.split(' ').slice(0, 4).join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    const category = safeString(item.category)
    items.push({
      name,
      amount: safeString(item.amount) ?? '',
      category: category && FRIDGE_CATEGORIES.includes(category as (typeof FRIDGE_CATEGORIES)[number])
        ? category
        : 'Other',
    })
    if (items.length >= FRIDGE_MAX_ITEMS) break
  }

  return items
}
