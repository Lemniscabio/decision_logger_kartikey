import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ObjectId } from 'mongodb'
import { getDecisionsCollection } from '../lib/db'
import { generateEmbedding, buildEmbeddingText } from '../lib/embeddings'
import { upsertVector, searchVectors } from '../lib/qdrant'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const collection = await getDecisionsCollection()

    if (req.method === 'POST') {
      return await handleCreate(req, res, collection)
    }

    if (req.method === 'GET') {
      return await handleList(req, res, collection)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('API error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

async function handleCreate(req: VercelRequest, res: VercelResponse, collection: any) {
  const { title, date, category, decision, context, rationale, alternatives, owner, tags, implications } = req.body

  if (!title || !date || !category || !decision) {
    return res.status(400).json({ error: 'Missing required fields: title, date, category, decision' })
  }

  const doc = {
    userId: 'pushkar',
    title,
    date,
    category,
    decision,
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

  // Generate embedding and upsert to Qdrant
  const embeddingText = buildEmbeddingText({ title, decision, context, rationale, tags })
  const vector = await generateEmbedding(embeddingText)
  await upsertVector(mongoId, vector)

  return res.status(201).json({ ...doc, _id: mongoId })
}

async function handleList(req: VercelRequest, res: VercelResponse, collection: any) {
  const { q, category, from, to, tag } = req.query as Record<string, string | undefined>

  let results: any[]

  if (q) {
    // Run text search + semantic search in parallel
    const [textResults, semanticIds] = await Promise.all([
      collection
        .find({ $text: { $search: q }, userId: 'pushkar' })
        .sort({ score: { $meta: 'textScore' } })
        .limit(20)
        .toArray(),
      generateEmbedding(q).then(vec => searchVectors(vec, 10))
    ])

    const textIds = new Set(textResults.map((d: any) => d._id.toString()))

    // Fetch semantic results not already in text results
    const additionalIds = semanticIds.filter(id => !textIds.has(id))
    let semanticDocs: any[] = []
    if (additionalIds.length > 0) {
      semanticDocs = await collection
        .find({
          _id: { $in: additionalIds.map(id => new ObjectId(id)) },
          userId: 'pushkar'
        })
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

  // Apply filters
  if (category) {
    results = results.filter((d: any) => d.category === category)
  }
  if (from) {
    results = results.filter((d: any) => d.date >= from)
  }
  if (to) {
    results = results.filter((d: any) => d.date <= to)
  }
  if (tag) {
    results = results.filter((d: any) => d.tags?.includes(tag))
  }

  return res.status(200).json(results)
}
