# Foody

Talk (or type) what you're craving. Foody understands your words, finds a real recipe with a photo, and shows you the full steps to cook it.

Built with the **Apple "liquid glass"** aesthetic — light-only, monochrome white chrome, softened by warm pastel glows. Installable as a mobile PWA.

## How it works

1. **You speak** (or type) — Web Speech API in the browser transcribes, no key needed.
2. **NVIDIA NIM** (free developer tier, OpenAI-compatible) parses your craving into a structured intent in JSON.
3. **NVIDIA NIM** writes the full structured recipe (with a free food photo), tuned to your taste preferences.
4. You get a clean glass **recipe page**: hero photo, tags, ingredients, and timed steps.

All APIs are free. No backend account required beyond a free NVIDIA Developer Program key.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 (custom `glass`, `glass-strong`, `glass-badge` utilities)
- lucide-react icons
- vite-plugin-pwa (installable, "Add to Home Screen")
- `localStorage`-based history + saved recipes

## Setup

```bash
npm install
```

Get a free NVIDIA key at [build.nvidia.com](https://build.nvidia.com), then:

```bash
cp .env.example .env   # then paste your nvapi-... key into .env
```

## Run

```bash
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # preview the production build
```

### Testing voice on your phone

The Web Speech API needs a secure context. Use:

- `localhost` via the dev server (works when tunneled with `--host`), or
- a HTTPS tunnel, or
- the built app served over HTTPS / installed as a PWA.

The NVIDIA key is passed through the Vite dev proxy (`/api/nim`) so it is never
exposed to the client. For production, wire a small backend or serverless
function to the same `/api/nim` path pattern.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_NIM_API_KEY` | — | Your NVIDIA NIM key (required). |
| `VITE_NIM_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` | Model for intent parsing + recipe generation. |
| `VITE_NIM_BASE_URL` | `/api/nim` | Override for self-hosted / remote NIM. |