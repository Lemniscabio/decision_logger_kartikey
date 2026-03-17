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

const PORT = 3001
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
