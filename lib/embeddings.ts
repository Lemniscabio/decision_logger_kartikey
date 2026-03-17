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
