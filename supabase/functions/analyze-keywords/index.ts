// supabase/functions/analyze-keywords/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

// Legacy Gemini/Vertex AI implementation is preserved (commented out) here:
// supabase/functions/analyze-keywords/legacy-gemini.ts

const aiProvider = (Deno.env.get('AI_PROVIDER') || 'groq').toLowerCase()
const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || ''

// GROQ_API_KEY is the current provider key.
// TODO: In the future this may be replaced by OPENAI_API_KEY or GEMINI_API_KEY.
const groqApiKey = Deno.env.get('GROQ_API_KEY') || ''
const defaultModel = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY') || ''
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-pro'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`

const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
]

interface KeywordOccurrence {
  keyword: string
  resumeFrequency?: number
  jdFrequency?: number
}

interface KeywordAnalysisResponse {
  extractedJdKeywords: string[]
  extractedResumeKeywords: string[]
  matchedKeywords: KeywordOccurrence[]
  missingKeywords: string[]
  error?: string
}

const extractJson = (text: string) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in AI response')
  }
  const jsonSlice = text.slice(start, end + 1)
  return JSON.parse(jsonSlice)
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin')
  const originAllowed = isOriginAllowed(requestOrigin)
  if (isProd && requestOrigin && !originAllowed) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const corsHeaders = getCorsHeaders(requestOrigin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Authenticate the user
  const authUser = await authenticateUser(req)
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (aiProvider !== 'gemini' && !groqApiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: GROQ_API_KEY is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const resumeText = typeof body?.resumeText === 'string' ? body.resumeText : ''
    const jobDescriptionText = typeof body?.jobDescriptionText === 'string' ? body.jobDescriptionText : ''

    if (!resumeText || !jobDescriptionText) {
      return new Response(JSON.stringify({ error: 'Missing resumeText or jobDescriptionText' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const prompt = `You are an ATS keyword analysis engine. Compare the resume and job description below.
Return ONLY a JSON object with this exact structure:
{
  "extractedJdKeywords": ["keyword1", "keyword2"],
  "extractedResumeKeywords": ["keyword1", "keyword2"],
  "matchedKeywords": [{"keyword": "keyword1", "resumeFrequency": 2, "jdFrequency": 3}],
  "missingKeywords": ["keyword3", "keyword4"]
}

Rules:
- Use concise keywords (1-3 words each).
- Provide integer frequencies.
- Limit lists to the 30 most important keywords.

Resume:
${resumeText}

Job Description:
${jobDescriptionText}
`

    let content = ''

    if (aiProvider === 'gemini') {
      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2500,
          responseMimeType: 'application/json',
          topP: 0.8,
          topK: 40,
        },
        safetySettings: GEMINI_SAFETY_SETTINGS,
      }

      logDebug('analyze-keywords: sending Gemini request', { model: geminiModel })

      let response: Response
      if (geminiApiKey) {
        response = await fetch(GEMINI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
      } else if (supabaseUrl) {
        const proxyUrl = `${supabaseUrl}/functions/v1/gemini-proxy`
        response = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
      } else {
        return new Response(JSON.stringify({ error: 'Server misconfiguration: GEMINI_API_KEY is missing and SUPABASE_URL is not set' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const responseText = await response.text()
      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'AI provider error', details: responseText }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const aiResponse = JSON.parse(responseText)
      content = aiResponse?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else {
      const payload = {
        model: defaultModel,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }

      logDebug('analyze-keywords: sending Groq request', { model: payload.model })

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const responseText = await response.text()
      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'AI provider error', details: responseText }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const aiResponse = JSON.parse(responseText)
      content = aiResponse?.choices?.[0]?.message?.content || ''
    }
    const parsed = extractJson(content)

    const normalized: KeywordAnalysisResponse = {
      extractedJdKeywords: Array.isArray(parsed.extractedJdKeywords) ? parsed.extractedJdKeywords : [],
      extractedResumeKeywords: Array.isArray(parsed.extractedResumeKeywords) ? parsed.extractedResumeKeywords : [],
      matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords : [],
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
    }

    return new Response(JSON.stringify(normalized), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('analyze-keywords: error', message)
    return new Response(JSON.stringify({ error: `Server error: ${message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
