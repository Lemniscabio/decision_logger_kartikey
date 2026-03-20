const API_BASE = '/api/decisions'

export interface Decision {
  _id: string
  userId: string
  title: string
  date: string
  category: string
  decision: string
  context: string
  rationale: string
  alternatives: string
  owner: string
  tags: string[]
  implications: string
  createdAt: string
  updatedAt: string
}

export interface DecisionInput {
  title: string
  date: string
  category: string
  decision: string
  context?: string
  rationale?: string
  alternatives?: string
  owner?: string
  tags?: string[]
  implications?: string
}

export async function fetchDecisions(params?: {
  q?: string
  category?: string
  from?: string
  to?: string
  tag?: string
}): Promise<Decision[]> {
  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) searchParams.set(k, v)
    })
  }
  const qs = searchParams.toString()
  const res = await fetch(`${API_BASE}${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch decisions')
  return res.json()
}

export async function fetchDecision(id: string): Promise<Decision> {
  const res = await fetch(`${API_BASE}/${id}`)
  if (!res.ok) throw new Error('Failed to fetch decision')
  return res.json()
}

export async function createDecision(data: DecisionInput): Promise<Decision> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to create decision')
  return res.json()
}

export async function updateDecision(id: string, data: Partial<DecisionInput>): Promise<Decision> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update decision')
  return res.json()
}

export async function deleteDecision(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete decision')
}

export interface StructuredDecision {
  title?: string
  category?: string
  decision?: string
  context?: string
  rationale?: string
  alternatives?: string
  owner?: string
  tags?: string[]
  implications?: string
}

export async function structureText(text: string): Promise<StructuredDecision> {
  const res = await fetch('/api/structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) throw new Error('Failed to structure text')
  return res.json()
}
