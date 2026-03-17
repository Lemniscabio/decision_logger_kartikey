# Decision Log

A structured decision capture and retrieval tool. Log company decisions with full context — what was decided, why, what alternatives were considered, and what happens next. Retrieve them later via keyword search, filters, or semantic similarity.

**Primary capture path:** PWA share target — share text from any mobile app and it lands as a pre-filled draft.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Styling | Plain CSS with design tokens |
| Backend | Vercel Serverless Functions |
| Database | MongoDB Atlas (M0 free tier) |
| Vector DB | Qdrant Cloud (free tier) |
| Embeddings | `all-MiniLM-L6-v2` via `@xenova/transformers` (local, no external API) |
| PWA | `vite-plugin-pwa` + Web Share Target API |

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd decision-log
npm install --legacy-peer-deps
```

### 2. Environment variables

Copy the example and fill in your credentials:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant API key |
| `QDRANT_COLLECTION` | Qdrant collection name (default: `decisions`) |

### 3. One-time database setup

**Create Qdrant collection** (384-dim vectors for MiniLM):

```bash
source .env.local
curl -X PUT "$QDRANT_URL/collections/decisions" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 384, "distance": "Cosine"}}'
```

**Create MongoDB text index:**

```bash
source .env.local
mongosh "$MONGODB_URI" --eval \
  'db.getSiblingDB("decision_log").decisions.createIndex({
    title: "text", decision: "text", context: "text",
    rationale: "text", tags: "text"
  })'
```

### 4. Run locally

```bash
npm run dev
```

This starts both the Express API server (port 3001) and Vite dev server (port 5173) with hot reload. The Vite server proxies `/api` requests to Express.

Open http://localhost:5173

## Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel
```

Set the same environment variables in Vercel dashboard under **Settings > Environment Variables**.

The `api/` directory is automatically picked up as serverless functions. The `vercel.json` handles SPA routing.

## Project Structure

```
├── api/decisions/         # Vercel serverless API routes
│   ├── index.ts           # GET (list + search) / POST (create)
│   └── [id].ts            # GET / PATCH / DELETE single decision
├── lib/
│   ├── db.ts              # MongoDB connection
│   ├── embeddings.ts      # all-MiniLM-L6-v2 embedding generation
│   └── qdrant.ts          # Qdrant vector DB client
├── src/
│   ├── App.tsx            # Two views: Log + Entry
│   ├── views/
│   │   ├── LogView.tsx    # Decision list, search, filters
│   │   └── EntryView.tsx  # New/edit form, share target handler
│   ├── components/
│   │   ├── DecisionCard.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FilterBar.tsx
│   │   └── SkeletonCard.tsx
│   ├── lib/
│   │   ├── api.ts         # Fetch wrappers
│   │   └── dateUtils.ts
│   └── styles/
├── public/manifest.json   # PWA manifest with share target
├── server.ts              # Express dev server (local only)
├── vercel.json            # SPA rewrites + API routing
└── vite.config.ts
```

## API

```
GET    /api/decisions?q=&category=&tag=&from=&to=
POST   /api/decisions          { title, date, category, decision, ... }
GET    /api/decisions/:id
PATCH  /api/decisions/:id      { partial fields }
DELETE /api/decisions/:id
```

## How Search Works

When a search query is entered, two searches run in parallel:

1. **Full-text search** — MongoDB `$text` index for exact keyword matches
2. **Semantic search** — query is embedded via MiniLM, then matched against decision vectors in Qdrant using cosine similarity

Results are merged and deduplicated: text matches first, semantic results fill the gaps.

## PWA / Share Target

Once installed on a mobile device, the app registers as a share target. Sharing text from any app (WhatsApp, Chrome, Gmail, etc.) opens the entry form with the shared text pre-filled in the Context field.

- **Android:** Chrome > menu > "Install app"
- **iOS:** Safari > Share > "Add to Home Screen"
