# CLAUDE.md — Decision Log + Retrieval

This file gives any AI coding assistant (Claude Code, Cursor, Copilot) full context to build this app correctly. Read this before writing any code.

---

## What this product is

A structured decision capture and retrieval tool. Pushkar logs key company decisions — what was decided, why, alternatives considered, implications. Retrieved later via keyword search, filters, or semantic similarity. Primary mobile capture path: PWA share target — share text from any app → lands as a pre-filled draft.

**Primary user:** Pushkar (single-user — userId hardcoded as `'pushkar'`)  
**Deployed at:** Vercel  
**AI in this app:** Local embeddings only (`all-MiniLM-L6-v2` via `@xenova/transformers`). No generative AI. No external AI API.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) + TypeScript |
| Styling | Plain CSS with custom properties — same design system as Morning Brief |
| Backend | Vercel serverless API routes (`/api/*`) |
| Structured DB | MongoDB Atlas (M0 free tier) |
| Vector DB | Qdrant Cloud (free tier — 1GB, 1 cluster) |
| Embeddings | `all-MiniLM-L6-v2` via `@xenova/transformers` — runs in Node.js, no external API |
| PWA | `vite-plugin-pwa` + Web Share Target API |
| Fonts | Inter from Google Fonts |

---

## Project structure

```
/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Two views: LogView, EntryView
│   ├── views/
│   │   ├── LogView.tsx            # Decision list, search bar, filter chips
│   │   └── EntryView.tsx          # New/edit form — reads URL params for share target
│   ├── components/
│   │   ├── DecisionCard.tsx       # Single card in the list, expandable
│   │   ├── SearchBar.tsx          # Text input, debounced
│   │   ├── FilterBar.tsx          # Category, date range, tag chips
│   │   └── SkeletonCard.tsx       # Loading placeholder
│   ├── lib/
│   │   ├── api.ts                 # fetch wrappers for all /api routes
│   │   └── dateUtils.ts           # getToday(), formatDate()
│   └── styles/
│       ├── globals.css            # Design tokens, resets
│       └── components.css         # Shared styles
├── api/
│   ├── decisions/
│   │   ├── index.ts               # GET (list + search) + POST (create)
│   │   └── [id].ts                # GET (single) + PATCH (edit) + DELETE
├── lib/
│   ├── db.ts                      # MongoDB connection (shared across routes)
│   ├── embeddings.ts              # all-MiniLM-L6-v2 wrapper
│   └── qdrant.ts                  # Qdrant client wrapper
├── public/
│   └── manifest.json              # PWA manifest with share_target
├── .env.local
├── CLAUDE.md
├── package.json
└── vite.config.ts
```

---

## Environment variables

```bash
# .env.local — never commit

MONGODB_URI=mongodb+srv://...

QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION=decisions
```

No OpenAI key. No Anthropic key. Embeddings run locally in the serverless function.

---

## Design system

Identical to Morning Brief. Copy these tokens exactly — do not introduce new values.

```css
:root {
  --bg-page: #000000;
  --bg-card: rgba(255, 255, 255, 0.04);
  --bg-card-hover: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-accent: rgba(0, 120, 255, 0.30);
  --text-primary: rgba(255, 255, 255, 0.87);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-muted: rgba(255, 255, 255, 0.25);
  --accent: #1a8aff;
  --accent-dark: #0066ee;
  --accent-glow-sm: 0 0 15px 2px rgba(0, 100, 255, 0.5), 0 0 40px 8px rgba(0, 80, 255, 0.25);
  --font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --radius-card: 16px;
  --radius-input: 100px;
  --radius-badge: 100px;
}
```

**Category badge colors** (only additions vs Morning Brief):
```css
--cat-strategic: rgba(139, 92, 246, 0.15);   /* purple */
--cat-product:   rgba(0, 120, 255, 0.15);    /* blue */
--cat-hiring:    rgba(16, 185, 129, 0.15);   /* green */
--cat-technical: rgba(245, 158, 11, 0.15);   /* amber */
--cat-operating: rgba(255, 255, 255, 0.08);  /* neutral */
```

Typography weights: 300 / 400 / 500 only. Never 600 or 700.

---

## Embedding model — `all-MiniLM-L6-v2`

Model produces 384-dimensional vectors. Runs entirely in Node.js via `@xenova/transformers`. No external API call, no cost.

**Install:**
```bash
npm install @xenova/transformers
```

**`lib/embeddings.ts`:**
```typescript
import { pipeline } from '@xenova/transformers'

let embedder: any = null

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
  return embedder
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embed = await getEmbedder()
  const output = await embed(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data) as number[]
}

export function buildEmbeddingText(decision: {
  title: string
  decision: string
  context?: string
  rationale?: string
  tags?: string[]
}): string {
  return [
    decision.title,
    decision.decision,
    decision.context,
    decision.rationale,
    decision.tags?.join(' ')
  ].filter(Boolean).join(' | ')
}
```

**Cold start note:** The model (~23MB) is downloaded on first invocation and cached. On Vercel, the first call after a cold start takes ~3–5 seconds. Subsequent calls within the same function instance are fast. This is acceptable — do not attempt to pre-warm or add caching complexity for the sprint.

---

## Qdrant setup

**Create collection** (run once — can be done via Qdrant Cloud dashboard or curl):
```bash
curl -X PUT "$QDRANT_URL/collections/decisions" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'
```

**`lib/qdrant.ts`:**
```typescript
const QDRANT_URL = process.env.QDRANT_URL!
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!
const COLLECTION = process.env.QDRANT_COLLECTION || 'decisions'

const headers = {
  'Content-Type': 'application/json',
  'api-key': QDRANT_API_KEY
}

// Upsert a vector (create or update)
export async function upsertVector(id: string, vector: number[], payload: object) {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      points: [{ id: toQdrantId(id), vector, payload }]
    })
  })
}

// Semantic search — returns MongoDB IDs
export async function searchVectors(queryVector: number[], limit = 10): Promise<string[]> {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ vector: queryVector, limit, with_payload: false })
  })
  const data = await res.json()
  return data.result.map((r: any) => fromQdrantId(r.id))
}

// Delete a vector
export async function deleteVector(id: string) {
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ points: [toQdrantId(id)] })
  })
}

// Qdrant requires integer or UUID point IDs
// Convert MongoDB ObjectId string to a stable numeric hash
function toQdrantId(mongoId: string): number {
  let hash = 0
  for (let i = 0; i < mongoId.length; i++) {
    hash = (Math.imul(31, hash) + mongoId.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// Store the original mongoId in payload so we can retrieve it
// Actually simpler: use a lookup map in the search result
// See searchVectors usage in decisions/index.ts below
```

**Important:** Qdrant point IDs must be integers or UUIDs. Since MongoDB uses ObjectId strings, the cleanest approach is to store the MongoDB `_id` as a string in the Qdrant point's `payload`, and use a deterministic integer hash as the point ID. When searching, retrieve the `payload.mongoId` from results.

**Updated `qdrant.ts` with payload:**
```typescript
export async function upsertVector(mongoId: string, vector: number[]) {
  const pointId = toQdrantId(mongoId)
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      points: [{ id: pointId, vector, payload: { mongoId } }]
    })
  })
}

export async function searchVectors(queryVector: number[], limit = 10): Promise<string[]> {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ vector: queryVector, limit, with_payload: true })
  })
  const data = await res.json()
  return data.result.map((r: any) => r.payload.mongoId as string)
}
```

---

## MongoDB schema

```typescript
// Decision document
{
  _id: ObjectId,
  userId: 'pushkar',          // hardcoded for single-user MVP
  title: String,              // required
  date: String,               // required — 'YYYY-MM-DD', defaults to today
  category: String,           // required — 'Strategic'|'Product'|'Hiring'|'Technical'|'Operating'
  decision: String,           // required
  context: String,            // optional
  rationale: String,          // optional
  alternatives: String,       // optional
  owner: String,              // optional
  tags: [String],             // optional
  implications: String,       // optional
  createdAt: Date,
  updatedAt: Date
  // No embedding field in MongoDB — vectors live in Qdrant only
}
```

**MongoDB index for full-text search:**
```javascript
db.decisions.createIndex({
  title: 'text',
  decision: 'text',
  context: 'text',
  rationale: 'text',
  tags: 'text'
})
```

---

## API routes

### `POST /api/decisions` — create

```typescript
1. Validate required fields (title, date, category, decision)
2. Save document to MongoDB → get _id
3. Build embedding text from title + decision + context + rationale + tags
4. generateEmbedding(text) → 384-dim vector
5. upsertVector(mongoId, vector) → Qdrant
6. Return saved document (no embedding field to hide — it's not in MongoDB)
```

### `GET /api/decisions` — list + search

```typescript
Query params: q, category, from, to, tag

If q is provided:
  Run in parallel:
    A. MongoDB text search: { $text: { $search: q }, userId: 'pushkar' }
    B. generateEmbedding(q) → searchVectors() → get mongoIds → MongoDB findMany by IDs

  Merge: textResults first, append semantic results not already in textResults
  Apply remaining filters (category, date, tag) to merged set

If no q:
  MongoDB find with filters only, sort by createdAt desc

Return: Decision[]
```

### `PATCH /api/decisions/:id` — edit

```typescript
1. Update fields in MongoDB
2. If any text field changed (title, decision, context, rationale, tags):
   Regenerate embedding → upsertVector (Qdrant upsert overwrites by point ID)
3. Return updated document
```

### `DELETE /api/decisions/:id`

```typescript
1. Delete from MongoDB
2. deleteVector(id) from Qdrant
3. Return { ok: true }
```

---

## Full API contract

```
GET  /api/decisions
  ?q        — search string
  ?category — Strategic | Product | Hiring | Technical | Operating
  ?tag      — tag string
  ?from     — YYYY-MM-DD
  ?to       — YYYY-MM-DD
  Returns: Decision[]

POST /api/decisions
  Body: { title, date, category, decision, context?, rationale?,
          alternatives?, owner?, tags?, implications? }
  Returns: Decision

GET  /api/decisions/:id
  Returns: Decision

PATCH /api/decisions/:id
  Body: partial decision fields
  Returns: Decision

DELETE /api/decisions/:id
  Returns: { ok: true }
```

---

## PWA share target

### `public/manifest.json`
```json
{
  "name": "Decision Log",
  "short_name": "Decisions",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "share_target": {
    "action": "/new",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

### Handling the share in `EntryView.tsx`
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const sharedText = params.get('text') || params.get('url') || ''
  const sharedTitle = params.get('title') || ''
  if (sharedText) setContext(sharedText)
  if (sharedTitle) setTitle(sharedTitle)
}, [])
```

### `vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      manifest: false,        // use our own public/manifest.json
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
})
```

---

## View specs

### Log view (`/`)
- Search bar at top — debounced 300ms, calls `GET /api/decisions?q=...`
- Filter chips: All / Strategic / Product / Hiring / Technical / Operating + date range + tag input
- Decision list — newest first
- Each card: category badge + date (top row), title, decision truncated to 2 lines, tags
- Click → expand inline showing all fields
- "+" button (top right, blue) → navigates to `/new`

### Entry view (`/new` or `/edit/:id`)
Form fields in order:
1. Title (required, text input)
2. Date (required, date input, defaults today)
3. Category (required, segmented select)
4. Decision (required, textarea) — "What was decided?"
5. Context (optional, textarea) — "What prompted this?" — pre-filled from share
6. Rationale (optional, textarea) — "Why this over alternatives?"
7. Alternatives (optional, textarea) — "What else was considered?"
8. Owner (optional, text input)
9. Tags (optional, tag input — comma-separated, renders as chips)
10. Implications (optional, textarea) — "What happens next?"

Save button: full-width, blue, bottom. Shows spinner while embedding generates.

---

## Build order (recommended)

1. Vite + React scaffold → deploy empty shell to Vercel immediately
2. MongoDB connection (`lib/db.ts`) + Decision schema
3. Qdrant collection creation (one-time curl or dashboard)
4. `lib/embeddings.ts` — test `generateEmbedding('test')` locally
5. `lib/qdrant.ts` — test upsert + search against live Qdrant cluster
6. `POST /api/decisions` — full create flow: MongoDB save → embed → Qdrant upsert
7. `GET /api/decisions` — list first, then add search (text + semantic)
8. `EntryView` component — form, validates required fields, calls POST
9. `LogView` component — list, search bar, filter chips
10. `DecisionCard` — expandable inline
11. `PATCH` + `DELETE` routes + edit/delete UI
12. PWA manifest + share target — test on physical Android device
13. Styling pass — design tokens, category badges, mobile layout
14. Full end-to-end test: share from WhatsApp → fill form → save → search → find it

---

## What NOT to do

- Do not add any generative AI — no Claude, no GPT, no summarisation
- Do not store embeddings in MongoDB — they live in Qdrant only
- Do not use OpenAI or any paid embedding API — `@xenova/transformers` only
- Do not add more than two views (Log + Entry)
- Do not cap priority items or add any artificial limits
- Do not use Tailwind — plain CSS with design tokens above
- Do not add user auth — userId is hardcoded `'pushkar'`
- Do not add export, bulk import, or analytics in this version
- Do not try to pre-warm the embedding model — cold start latency is acceptable
