import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ObjectId } from 'mongodb'
import { getDecisionsCollection } from '../lib/db'
import { generateEmbedding, buildEmbeddingText } from '../lib/embeddings'
import { upsertVector, deleteVector } from '../lib/qdrant'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id' })
  }

  let objectId: ObjectId
  try {
    objectId = new ObjectId(id)
  } catch {
    return res.status(400).json({ error: 'Invalid id' })
  }

  try {
    const collection = await getDecisionsCollection()

    if (req.method === 'GET') {
      const doc = await collection.findOne({ _id: objectId, userId: 'pushkar' })
      if (!doc) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json(doc)
    }

    if (req.method === 'PATCH') {
      const updates = req.body
      updates.updatedAt = new Date()

      const result = await collection.findOneAndUpdate(
        { _id: objectId, userId: 'pushkar' },
        { $set: updates },
        { returnDocument: 'after' }
      )

      if (!result) return res.status(404).json({ error: 'Not found' })

      // Regenerate embedding if text fields changed
      const textFields = ['title', 'decision', 'context', 'rationale', 'tags']
      if (textFields.some(f => f in updates)) {
        const doc = result
        const embeddingText = buildEmbeddingText({
          title: doc.title,
          decision: doc.decision,
          context: doc.context,
          rationale: doc.rationale,
          tags: doc.tags
        })
        const vector = await generateEmbedding(embeddingText)
        await upsertVector(id, vector)
      }

      return res.status(200).json(result)
    }

    if (req.method === 'DELETE') {
      await collection.deleteOne({ _id: objectId, userId: 'pushkar' })
      await deleteVector(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('API error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
