# PRD-lite — Decision Log + Retrieval
**Version:** 1.1  
**Sprint:** Internal Hackathon  

---

## 1. Problem Statement

Strategic, hiring, product, technical, and operating decisions at the company are recorded inconsistently — across chats, docs, decks, and memory. The rationale behind decisions gets lost. The same issues get re-debated. The founder's memory becomes the de facto system of record. When someone asks "what did we decide on X, and why?" — there is no reliable answer.

The cost isn't just time. It's repeated confusion, context loss when new people join, and decisions being revisited without knowing they were already made.

---

## 2. Why Now

Company complexity is growing. Capturing decisions now — even retroactively — creates institutional memory early and eliminates a class of operating problems before they compound. The longer this waits, the harder it becomes to reconstruct the past.

---

## 3. Core Use Case

> Pushkar is on his phone mid-conversation or just after a key call. He selects the relevant text, shares it to the Decision Log via the OS share sheet. It opens as a pre-filled draft. He adds category, rationale, and implications — 60 seconds total. Saved, embedded, retrievable forever.

Or:

> Weeks later, Pushkar types "pricing model discussion" or "why did we drop enterprise" into the search bar. The app returns the right decisions — even if those exact words aren't in the entries — because retrieval is semantic, not just keyword-based.

---

## 4. UI Structure

Two views. No other navigation.

| View | Purpose |
|---|---|
| **Log view** (default) | Scrollable list of decisions, filters, search bar at top |
| **Entry view** | Structured form — new entry or editing existing |

The share target opens directly into entry view with the shared text pre-filled in the context field.

Design language: same as Morning Brief — pure black (`#000000`), card-based, blue (`#1a8aff → #0066ee`) accent, Inter typeface.

---

## 5. Decision Data Model

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | String | Yes | One-line summary |
| `date` | Date | Yes | Defaults to today |
| `category` | Enum | Yes | Strategic / Product / Hiring / Technical / Operating |
| `decision` | String | Yes | What was actually decided |
| `context` | String | No | What prompted this — pre-filled from share target |
| `rationale` | String | No | Why this over alternatives |
| `alternatives` | String | No | What was considered and rejected |
| `owner` | String | No | Who made or owns this |
| `tags` | String[] | No | Free-form, multi-tag |
| `implications` | String | No | What happens next |
| `qdrantId` | String | Internal | The ID used in Qdrant for this decision's vector |

---

## 6. MVP Scope

### Capture — web form
- Full structured entry form, accessible via "+" button
- Required fields: `title`, `date`, `category`, `decision`
- On submit: saves to MongoDB, generates embedding via `all-MiniLM-L6-v2`, upserts vector to Qdrant

### Capture — PWA share target
- App installable as PWA (manifest + service worker)
- Registered as Web Share Target in `manifest.json`
- Sharing text from any mobile app (WhatsApp, Chrome, Notes, Gmail) opens entry form with shared text pre-filled in `context`
- Works natively on Android; iOS via Safari PWA

### Log view
- Scrollable list, newest first
- Each card: category badge, date, title, decision (truncated), tags
- Click to expand inline or open edit view
- Empty state with clear CTA

### Search and retrieval
- Single search bar — runs full-text (MongoDB) + semantic (Qdrant) in parallel on every query
- Results merged, deduplicated, ranked — full-text matches first, semantic fills the gaps
- Filter chips: by category, date range, tags — compose with search

### Edit and delete
- Any entry editable — re-saves to MongoDB, regenerates embedding in Qdrant
- Delete removes from both MongoDB and Qdrant

---

## 7. Non-Goals

- No generative AI anywhere
- No automatic extraction from external docs or conversations
- No multi-user collaboration
- No meeting minutes or long-form notes
- No notifications, analytics, or export in this version

---

## 8. Acceptance Criteria

- [ ] Decision created via web form saves to MongoDB and upserts vector to Qdrant
- [ ] App installable as PWA on mobile
- [ ] Sharing text from any mobile app pre-fills entry form context
- [ ] Full-text search returns relevant results across all text fields
- [ ] Semantic search returns conceptually related results without exact keyword matches
- [ ] Filters (category, date range, tag) compose with search
- [ ] Edit regenerates embedding in Qdrant; delete removes from both stores
- [ ] Fully usable on mobile (375px+) and desktop
- [ ] Deployed and demo-able on a live URL

---

## 9. Key Decisions and Assumptions

| Decision | Choice | Rationale |
|---|---|---|
| Embedding model | `all-MiniLM-L6-v2` via `@xenova/transformers` | Free, runs in Node.js serverless, no external API, 384-dim output, ~23MB quantized |
| Vector store | Qdrant Cloud (free tier) | 1GB free, managed, no Docker for deployment, clean REST API |
| Structured store | MongoDB Atlas | Holds all decision fields; Qdrant holds only vectors pointing back to MongoDB IDs |
| Cold start tradeoff | Accepted | First embedding call on a cold Vercel function takes ~3–5s as model loads; subsequent calls are fast — acceptable for a sprint |
| Retrieval | Full-text + semantic, merged | Full-text for exact matches; semantic for conceptual retrieval — both needed |
| No generative AI | Embeddings only | Keeps the product fast and trustworthy; Pushkar owns every word in the log |
| Two views only | Log + Entry | More navigation = product becomes something to manage |

**Assumptions:**
- Qdrant Cloud free cluster provisioned before build starts
- MongoDB Atlas free tier (M0) is sufficient — no vector index needed there
- PWA share target tested on Pushkar's primary device (Android has best support)
- Single-user app — `userId` hardcoded as `'pushkar'` for this sprint
