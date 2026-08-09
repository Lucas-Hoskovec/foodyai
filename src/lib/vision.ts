/**
 * Grocery photo scanning via the NVIDIA vision model.
 *
 * The call goes to the same-origin `/api/nim/chat/completions` proxy (the key
 * stays server-side). Errors are typed with a `kind` so the UI can show exact,
 * actionable messages — and so a plain JavaScript crash is never shown as an
 * "AI service" error.
 */
import { FRIDGE_CATEGORIES, limiter } from './nim'

export interface ScanItem {
  name: string
  quantity: number
  size: string | null
  category: string
}

export type ScanErrorKind = 'timeout' | 'network' | 'http' | 'parse' | 'empty' | 'decode' | 'other'

export class ScanError extends Error {
  kind: ScanErrorKind
  /** Raw model reply, kept so the UI can show it in the parse error box. */
  rawReply?: string
  /** HTTP status when kind === 'http'. */
  status?: number
  /** Response body snippet when kind === 'http'. */
  body?: string

  constructor(kind: ScanErrorKind, message: string, extra?: { rawReply?: string; status?: number; body?: string }) {
    super(message)
    this.name = 'ScanError'
    this.kind = kind
    this.rawReply = extra?.rawReply
    this.status = extra?.status
    this.body = extra?.body
  }
}

const MODEL =
  import.meta.env.VITE_NIM_MODEL ?? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

const TIMEOUT_MS = 180_000

function toKnownCategory(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : ''
  const exact = FRIDGE_CATEGORIES.find((c) => c.toLowerCase() === key.toLowerCase())
  return exact ?? 'Other'
}

function normalizeItems(parsed: unknown): ScanItem[] | null {
  if (!parsed || typeof parsed !== 'object') return null
  const container = parsed as { items?: unknown }
  if (!Array.isArray(container.items)) return null
  const items: ScanItem[] = []
  for (const entry of container.items) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as { name?: unknown; quantity?: unknown; size?: unknown; category?: unknown }
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 60) : ''
    const qtyNum = typeof row.quantity === 'string' ? Number(row.quantity) : (row.quantity as number)
    const quantity = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : 1
    const size =
      typeof row.size === 'string' && row.size.trim() ? row.size.trim().slice(0, 40) : null
    items.push({
      name: name || 'Unknown item',
      quantity,
      size,
      category: toKnownCategory(row.category),
    })
  }
  return items.length ? items : null
}

/**
 * Pull a JSON object out of a reasoning-model reply.
 *
 * The nano-omni model can wrap JSON in markdown fences and may emit a
 * `reasoning_content` field before `content`. We slice the first {..} block
 * (or [..] wrapped in { items: [...] }) to be robust.
 */
export function extractScanJson(reply: string): ScanItem[] {
  const cleaned = reply
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  const objectBlock = sliceBlock(cleaned, '{', '}')
  if (objectBlock) {
    const parsed = tryParse(objectBlock)
    if (parsed !== null) {
      const items = normalizeItems(parsed)
      if (items) return items
      throw new ScanError(
        'empty',
        'Foody AI came back with an empty list. Make sure the whole receipt is in the photo, well-lit, and retry.',
        { rawReply: reply },
      )
    }
  }

  const arrayBlock = sliceBlock(cleaned, '[', ']')
  if (arrayBlock) {
    try {
      const items = normalizeItems({ items: JSON.parse(arrayBlock) })
      if (items) return items
    } catch {
      // fall through to parse error
    }
  }

  throw new ScanError(
    'parse',
    'Foody AI’s response didn’t come back as a readable list. See the raw reply below.',
    { rawReply: reply },
  )
}

function sliceBlock(text: string, open: string, close: string): string | null {
  const first = text.indexOf(open)
  const last = text.lastIndexOf(close)
  if (first === -1 || last <= first) return null
  return text.slice(first, last + 1)
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Scan a (downscaled) photo of a receipt and return the recognised groceries.
 * Throws typed `ScanError`s.
 */
export async function analyzeFridgePhoto(dataUrl: string): Promise<ScanItem[]> {
  return limiter.schedule(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    return (async () => {
      let res: Response
      try {
        res = await fetch('/api/nim/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.2,
            top_k: 1,
            max_tokens: 4096,
            chat_template_kwargs: { enable_thinking: false },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: buildScanPrompt() },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        })
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          throw new ScanError(
            'timeout',
            'The scan took longer than 3 minutes and was cancelled. The model usually answers within a couple of minutes — please try again.',
          )
        }
        console.error(err)
        throw new ScanError(
          'network',
          'Could not reach the Foody AI service. This usually means the dev server or overlay connection is down — check it and retry.',
        )
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        let body = ''
        try {
          body = await res.text()
        } catch {
          // best-effort
        }
        throw new ScanError(
          'http',
          `The AI service returned an error (HTTP ${res.status}). It might be rate-limited or overloaded right now — wait a moment and try again.`,
          { status: res.status, body: body.slice(0, 500) },
        )
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
      }
      const message = data.choices?.[0]?.message
      const content = message?.content?.trim() || message?.reasoning_content?.trim() || ''
      if (!content) {
        throw new ScanError('empty', 'Foody AI came back with an empty response. Try a clearer photo.')
      }

      const items = extractScanJson(content)
      return items
    })().finally(() => clearTimeout(timer))
  })
}

/** The tuned grocery-scanning prompt. Keep in sync with the reference app. */
function buildScanPrompt(): string {
  return `You are a grocery-scanning assistant. A photo of a shopping receipt is attached.

Carefully list EVERY food item printed on the receipt. For each item:
- "name": a short lowercase product name, e.g. "milk", "apples", "whole wheat bread".
- "quantity": the number of units you can count or infer. Count loose items such as apples or eggs individually; for boxes/cartons/bottles count the containers (e.g. 2 cartons of milk, 1 bottle of ketchup). If it is unclear, use 1.
- "size": the weight or volume printed on the label or receipt, written exactly like "500 g", "1 kg", "250 ml", "1 L", "12 pieces". If no weight/volume is visible or it does not apply (e.g. loose produce), use null.
- "category": pick exactly one value from this list: ${FRIDGE_CATEGORIES.join(', ')}. For meat & fish items, assume they are refrigerated unless clearly a pantry product. If unsure, use "Other".

Respond with ONLY a single JSON object in this exact shape - no markdown fences, no extra text before or after:
{ "items": [ { "name": "...", "quantity": 1, "size": null, "category": "..." } ] }`
}