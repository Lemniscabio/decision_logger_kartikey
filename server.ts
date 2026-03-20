import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import express from 'express'
import cors from 'cors'
import { ObjectId } from 'mongodb'
import { getDecisionsCollection } from './lib/db'
import { generateEmbedding, buildEmbeddingText } from './lib/embeddings'
import { upsertVector, searchVectors, deleteVector } from './lib/qdrant'

const app = express()
app.use(cors())
app.use(express.json())

// POST /api/decisions — create
app.post('/api/decisions', async (req, res) => {
  const { title, date, category, decision, context, rationale, alternatives, owner, tags, implications } = req.body

  if (!title || !date || !category || !decision) {
    res.status(400).json({ error: 'Missing required fields: title, date, category, decision' })
    return
  }

  const collection = await getDecisionsCollection()
  const doc = {
    userId: 'pushkar',
    title, date, category, decision,
    context: context || '',
    rationale: rationale || '',
    alternatives: alternatives || '',
    owner: owner || '',
    tags: tags || [],
    implications: implications || '',
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const result = await collection.insertOne(doc)
  const mongoId = result.insertedId.toString()

  const embeddingText = buildEmbeddingText({ title, decision, context, rationale, tags })
  const vector = await generateEmbedding(embeddingText)
  await upsertVector(mongoId, vector)

  res.status(201).json({ ...doc, _id: mongoId })
})

// GET /api/decisions — list + search
app.get('/api/decisions', async (req, res) => {
  const { q, category, from, to, tag } = req.query as Record<string, string | undefined>
  const collection = await getDecisionsCollection()

  let results: any[]

  if (q) {
    const [textResults, semanticIds] = await Promise.all([
      collection
        .find({ $text: { $search: q }, userId: 'pushkar' })
        .sort({ score: { $meta: 'textScore' } })
        .limit(20)
        .toArray(),
      generateEmbedding(q).then(vec => searchVectors(vec, 10))
    ])

    const textIds = new Set(textResults.map((d: any) => d._id.toString()))
    const additionalIds = semanticIds.filter(id => !textIds.has(id))
    let semanticDocs: any[] = []
    if (additionalIds.length > 0) {
      semanticDocs = await collection
        .find({ _id: { $in: additionalIds.map(id => new ObjectId(id)) }, userId: 'pushkar' })
        .toArray()
    }
    results = [...textResults, ...semanticDocs]
  } else {
    results = await collection
      .find({ userId: 'pushkar' })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()
  }

  if (category) results = results.filter((d: any) => d.category === category)
  if (from) results = results.filter((d: any) => d.date >= from)
  if (to) results = results.filter((d: any) => d.date <= to)
  if (tag) results = results.filter((d: any) => d.tags?.includes(tag))

  res.json(results)
})

// GET /api/decisions/:id
app.get('/api/decisions/:id', async (req, res) => {
  const collection = await getDecisionsCollection()
  const doc = await collection.findOne({ _id: new ObjectId(req.params.id), userId: 'pushkar' })
  if (!doc) { res.status(404).json({ error: 'Not found' }); return }
  res.json(doc)
})

// PATCH /api/decisions/:id
app.patch('/api/decisions/:id', async (req, res) => {
  const collection = await getDecisionsCollection()
  const updates = req.body
  updates.updatedAt = new Date()

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(req.params.id), userId: 'pushkar' },
    { $set: updates },
    { returnDocument: 'after' }
  )
  if (!result) { res.status(404).json({ error: 'Not found' }); return }

  const textFields = ['title', 'decision', 'context', 'rationale', 'tags']
  if (textFields.some(f => f in updates)) {
    const embeddingText = buildEmbeddingText({
      title: result.title as string,
      decision: result.decision as string,
      context: result.context as string,
      rationale: result.rationale as string,
      tags: result.tags as string[]
    })
    const vector = await generateEmbedding(embeddingText)
    await upsertVector(req.params.id, vector)
  }

  res.json(result)
})

// DELETE /api/decisions/:id
app.delete('/api/decisions/:id', async (req, res) => {
  const collection = await getDecisionsCollection()
  await collection.deleteOne({ _id: new ObjectId(req.params.id), userId: 'pushkar' })
  await deleteVector(req.params.id)
  res.json({ ok: true })
})

// POST /api/structure — Gemini text structuring
app.post('/api/structure', async (req, res) => {
  const { text } = req.body
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing "text" field' })
    return
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' })
    return
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const SYSTEM_PROMPT = `You are a structured data extractor for a founder's decision log. You receive raw text — it could be a WhatsApp message, email snippet, Slack thread, article excerpt, meeting notes, or just a rough thought dump. Your job is to interpret the intent and extract a structured decision record.

Return a JSON object with these fields:

- title: A concise one-line summary of the decision (required, under 80 chars)
- category: One of "Strategic", "Product", "Hiring", "Technical", "Operating" — pick the best fit (required)
- decision: What was actually decided — state it clearly even if the raw text is vague (required)
- context: What prompted or led to this decision — background, trigger event, problem being solved
- rationale: Why this option was chosen — the reasoning, tradeoffs, data points
- alternatives: What else was considered and why it was rejected
- owner: Who made or owns this decision (person or team name if mentioned)
- tags: Array of 2-5 lowercase keyword tags relevant for future search
- implications: What happens next — follow-up actions, downstream effects, deadlines

Instructions:
- Be proactive: read between the lines, infer context from the tone and content
- If the text contains a URL, the page content will be provided — use it heavily to fill fields
- If the raw text is messy or conversational, clean it up into professional decision language
- Fill as many fields as possible — guess intelligently rather than leaving fields empty
- For category: Strategic = big company direction, Product = features/roadmap, Hiring = people/roles, Technical = architecture/tools, Operating = processes/ops
- Return ONLY valid JSON, no markdown fences, no explanation
- tags should be lowercase single words or short phrases`

  // Extract URLs from text
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g
  const urls = text.match(urlRegex) || []

  let urlContext = ''
  if (urls.length > 0) {
    const fetches = urls.slice(0, 2).map(async (url: string) => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DecisionLogger/1.0)',
            'Accept': 'text/html,application/xhtml+xml,text/plain'
          }
        })
        clearTimeout(timeout)
        if (!r.ok) return ''
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('text/html') && !ct.includes('text/plain')) return ''
        const html = await r.text()
        const clean = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 3000)
        return `\n\n--- Content from ${url} ---\n${clean}`
      } catch { return '' }
    })
    const results = await Promise.all(fetches)
    urlContext = results.join('')
  }

  const userMessage = urlContext
    ? `Raw text shared by the user:\n\n${text}\n\n${urlContext}`
    : `Raw text shared by the user:\n\n${text}`

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT },
            { text: userMessage }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500
        }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini API error:', err)
      res.status(502).json({ error: 'Failed to call Gemini API' })
      return
    }

    const data = await response.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    const structured = JSON.parse(cleaned)
    res.json(structured)
  } catch (err) {
    console.error('Structure error:', err)
    res.status(500).json({ error: 'Failed to structure text' })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
