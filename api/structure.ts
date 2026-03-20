import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

const SYSTEM_PROMPT = `You are a structured data extractor for a founder's decision log. You receive raw text — it could be a WhatsApp message, email snippet, Slack thread, article excerpt, meeting notes, or just a rough thought dump. Your job is to interpret the intent and extract a structured decision record.

Return a JSON object with these fields:

- title: A concise one-line summary of the decision (required, under 80 chars)
- category: One of "Strategic", "Product", "Hiring", "Technical", "Operating" — pick the best fit (required)
- decision: What was actually decided — state it clearly even if the raw text is vague (required)
- context: IMPORTANT — always start this field with any URLs, links, references, names, or key data points from the original shared text verbatim, then follow with the extracted background/context. This field is the user's reference back to the source material, so never lose any concrete information (links, numbers, dates, names) from the original text
- rationale: Why this option was chosen — the reasoning, tradeoffs, data points
- alternatives: What else was considered and why it was rejected
- owner: Who made or owns this decision (person or team name if mentioned)
- tags: Array of 2-5 lowercase keyword tags relevant for future search
- implications: What happens next — follow-up actions, downstream effects, deadlines

Instructions:
- Be proactive: read between the lines, infer context from the tone and content
- If the text contains a URL, the page content will be provided — use it heavily to fill fields
- If the raw text is messy or conversational, clean it up into professional decision language
- Fill fields only with information you can extract or reasonably infer from the provided text
- NEVER fabricate names, dates, numbers, or specific facts that aren't in the source text
- If you cannot determine a field's value, omit it entirely — do NOT guess or hallucinate
- For owner: only fill if a specific person or team is explicitly mentioned
- For alternatives/rationale/implications: only fill if the text provides real signals, otherwise omit
- For category: Strategic = big company direction, Product = features/roadmap, Hiring = people/roles, Technical = architecture/tools, Operating = processes/ops
- Keep each field value to 1-3 sentences max — be concise, not verbose
- ALL field values MUST be plain strings (except tags which is an array of strings). NEVER return nested objects or arrays of objects for any field
- For alternatives: list them as a single string like "Option A was rejected because X. Option B was rejected because Y."
- Return ONLY valid JSON, no markdown fences, no explanation
- tags should be lowercase single words or short phrases derived from the actual content`

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
          maxOutputTokens: 4096
        }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini API error:', err)
      return res.status(502).json({ error: 'Failed to call Gemini API' })
    }

    const data = await response.json()

    // Combine all text parts (Gemini 2.5 may split across multiple parts)
    const parts = data.candidates?.[0]?.content?.parts || []
    const raw = parts.map((p: any) => p.text || '').join('')

    console.log('Gemini raw length:', raw.length, 'first 500:', raw.slice(0, 500))

    if (!raw) {
      console.error('Gemini returned empty response, full data:', JSON.stringify(data).slice(0, 500))
      return res.status(502).json({ error: 'Gemini returned empty response' })
    }

    // Extract JSON: find first { and last } in the raw response directly
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.error('No JSON found. Raw response:', raw)
      return res.status(502).json({ error: 'Could not parse Gemini response' })
    }

    const jsonStr = raw.slice(jsonStart, jsonEnd + 1)
    const structured = JSON.parse(jsonStr)
    return res.status(200).json(structured)
  } catch (err: any) {
    console.error('Structure error:', err.message || err)
    return res.status(500).json({ error: err.message || 'Failed to structure text' })
  }
}
