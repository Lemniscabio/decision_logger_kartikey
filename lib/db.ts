import { MongoClient, Db } from 'mongodb'

let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb

  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set')
  const client = new MongoClient(uri)
  await client.connect()

  cachedClient = client
  cachedDb = client.db('decision_log')
  return cachedDb
}

export async function getDecisionsCollection() {
  const db = await getDb()
  return db.collection('decisions')
}
