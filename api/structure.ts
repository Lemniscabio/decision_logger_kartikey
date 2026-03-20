import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
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
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g
  return text.match(urlRegex) || []
}

// Fetch URL content as text (best-effort)
async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DecisionLogger/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain'
      }
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null

    const html = await res.text()

    // Strip HTML tags, scripts, styles — extract readable text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Limit to ~3000 chars to avoid token bloat
    return text.slice(0, 3000)
  } catch {
    return null
  }
}

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
    // Extract and fetch any URLs in the shared text
    const urls = extractUrls(text)
    let urlContext = ''

    if (urls.length > 0) {
      const fetches = urls.slice(0, 2).map(async url => {
        const content = await fetchUrlContent(url)
        return content ? `\n\n--- Content from ${url} ---\n${content}` : ''
      })
      const results = await Promise.all(fetches)
      urlContext = results.join('')
    }

    const userMessage = urlContext
      ? `Raw text shared by the user:\n\n${text}\n\n${urlContext}`
      : `Raw text shared by the user:\n\n${text}`

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
      return res.status(502).json({ error: 'Failed to call Gemini API' })
    }

    const data = await response.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Strip markdown fences and thinking tags if present
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const structured = JSON.parse(cleaned)
    return res.status(200).json(structured)
  } catch (err) {
    console.error('Structure error:', err)
    return res.status(500).json({ error: 'Failed to structure text' })
  }
}
