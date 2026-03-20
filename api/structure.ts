import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

const SYSTEM_PROMPT = `You are a structured data extractor for a decision log. Given raw text (shared from WhatsApp, email, Slack, notes, etc.), extract and return a JSON object with these fields:

- title: A concise one-line summary of the decision (required)
- category: One of "Strategic", "Product", "Hiring", "Technical", "Operating" — pick the best fit (required)
- decision: What was actually decided (required)
- context: What prompted this decision
- rationale: Why this was chosen over alternatives
- alternatives: What else was considered
- owner: Who made or owns the decision
- tags: Array of relevant keyword tags (2-5 tags)
- implications: What happens next as a result

Rules:
- Return ONLY valid JSON, no markdown fences, no explanation
- If a field can't be extracted, omit it from the JSON
- Keep each field concise and clear
- title should be under 80 characters
- tags should be lowercase single words or short phrases`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { text } = req.body
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing "text" field' })
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT },
            { text: `Raw text to structure:\n\n${text}` }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini API error:', err)
      return res.status(502).json({ error: 'Failed to call Gemini API' })
    }

    const data = await response.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    const structured = JSON.parse(cleaned)
    return res.status(200).json(structured)
  } catch (err) {
    console.error('Structure error:', err)
    return res.status(500).json({ error: 'Failed to structure text' })
  }
}
