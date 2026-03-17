function getConfig() {
  return {
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
    collection: process.env.QDRANT_COLLECTION || 'decisions'
  }
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'api-key': getConfig().apiKey
  }
}

function toQdrantId(mongoId: string): number {
  let hash = 0
  for (let i = 0; i < mongoId.length; i++) {
    hash = (Math.imul(31, hash) + mongoId.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export async function upsertVector(mongoId: string, vector: number[]) {
  const { url, collection } = getConfig()
  const pointId = toQdrantId(mongoId)
  await fetch(`${url}/collections/${collection}/points`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      points: [{ id: pointId, vector, payload: { mongoId } }]
    })
  })
}

export async function searchVectors(queryVector: number[], limit = 10): Promise<string[]> {
  const { url, collection } = getConfig()
  const res = await fetch(`${url}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ vector: queryVector, limit, with_payload: true })
  })
  const data = await res.json()
  return data.result.map((r: any) => r.payload.mongoId as string)
}

export async function deleteVector(mongoId: string) {
  const { url, collection } = getConfig()
  await fetch(`${url}/collections/${collection}/points/delete`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ points: [toQdrantId(mongoId)] })
  })
}
