// supabase/functions/analyze-keywords/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts'
import { refundAiGenerationForUser, reserveAiGenerationOrResponse, resolveAllowedModel } from '../_shared/aiAccess.ts'
import { assertBodyByteSize, assertContentLength, RequestValidationError, validateTextInput } from '../_shared/aiRequestValidation.ts'

const isProd = Deno.env.get('NODE_ENV') !== 'development'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

const configuredAiProvider = (Deno.env.get('AI_PROVIDER') || 'openrouter').toLowerCase()
const AI_PROVIDER_ORDER = ['openrouter', 'groq']
const TEMPORARY_AI_ERROR = 'AI keyword analysis is temporarily unavailable. We are working on a fix. Please try again shortly.'

const groqApiKey = Deno.env.get('GROQ_API_KEY') || ''
const defaultModel = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'
const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY') || ''
const openRouterModel = Deno.env.get('OPENROUTER_MODEL') || defaultModel

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_SITE_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://resumeats.cv'
const OPENROUTER_APP_TITLE = Deno.env.get('OPENROUTER_APP_TITLE') || 'ResumeATS'
const OPENROUTER_REASONING_EFFORT = Deno.env.get('OPENROUTER_REASONING_EFFORT') || 'minimal'

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

const buildProviderPayload = (provider: string, requestedModel: unknown, prompt: string) => {
  const useOpenRouter = provider === 'openrouter'
  return {
    model: useOpenRouter
      ? resolveAllowedModel(requestedModel, openRouterModel, 'OPENROUTER_ALLOWED_MODELS')
      : resolveAllowedModel(requestedModel, defaultModel, 'GROQ_ALLOWED_MODELS'),
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 1200,
    ...(useOpenRouter ? {
      reasoning: {
        effort: OPENROUTER_REASONING_EFFORT,
        exclude: true,
      },
    } : {}),
  }
}

const callProvider = async (provider: string, requestedModel: unknown, prompt: string) => {
  const useOpenRouter = provider === 'openrouter'
  const apiKey = useOpenRouter ? openRouterApiKey : groqApiKey

  if (!apiKey) {
    throw new Error(`${provider} API key is missing`)
  }

  const payload = buildProviderPayload(provider, requestedModel, prompt)
  logDebug(`analyze-keywords: sending ${useOpenRouter ? 'OpenRouter' : 'Groq'} request`, { model: payload.model })

  const response = await fetch(useOpenRouter ? OPENROUTER_API_URL : GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(useOpenRouter ? {
        'HTTP-Referer': OPENROUTER_SITE_URL,
        'X-Title': OPENROUTER_APP_TITLE,
      } : {}),
    },
    body: JSON.stringify(payload),
  })

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(`${provider} provider error: ${response.status} ${responseText.slice(0, 300)}`)
  }

  const aiResponse = JSON.parse(responseText)
  const content = aiResponse?.choices?.[0]?.message?.content || ''
  return extractJson(content)
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

  if (!openRouterApiKey && !groqApiKey) {
    return new Response(JSON.stringify({
      error: TEMPORARY_AI_ERROR,
      aiServiceUnavailable: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (configuredAiProvider !== 'openrouter') {
    logDebug('analyze-keywords: AI_PROVIDER is ignored; using OpenRouter primary with Groq fallback')
  }

  let quotaReserved = false
  let quotaReservedAt = ''

  try {
    assertContentLength(req)
    const body = await req.json().catch(() => ({}))
    assertBodyByteSize(body)
    const resumeText = typeof body?.resumeText === 'string' ? body.resumeText : ''
    const jobDescriptionText = typeof body?.jobDescriptionText === 'string' ? body.jobDescriptionText : ''

    if (!resumeText || !jobDescriptionText) {
      return new Response(JSON.stringify({ error: 'Missing resumeText or jobDescriptionText' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    validateTextInput('resumeText', resumeText)
    validateTextInput('jobDescriptionText', jobDescriptionText)

    const reservation = await reserveAiGenerationOrResponse(authUser.userId, corsHeaders)
    if (reservation instanceof Response) return reservation
    quotaReservedAt = reservation.periodStart
    quotaReserved = true

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

    let parsed: Record<string, unknown> | null = null
    let lastProviderError: Error | null = null
    for (const provider of AI_PROVIDER_ORDER) {
      try {
        parsed = await callProvider(provider, body?.model, prompt)
        break
      } catch (providerError) {
        const errorMessage = providerError instanceof Error ? providerError.message : 'Unknown provider error'
        lastProviderError = providerError instanceof Error ? providerError : new Error(errorMessage)
        logDebug(`analyze-keywords: ${provider} unavailable; trying fallback if available`, errorMessage)
      }
    }

    if (!parsed) {
      await refundAiGenerationForUser(authUser.userId, quotaReservedAt)
      quotaReserved = false
      console.error('analyze-keywords: all providers failed', lastProviderError?.message || 'Unknown provider error')
      return new Response(JSON.stringify({
        error: TEMPORARY_AI_ERROR,
        aiServiceUnavailable: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

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
    if (quotaReserved) {
      await refundAiGenerationForUser(authUser.userId, quotaReservedAt)
    }
    if (error instanceof RequestValidationError) {
      return new Response(JSON.stringify({ error: message }), {
        status: error.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    console.error('analyze-keywords: error', message)
    if (quotaReserved) {
      return new Response(JSON.stringify({
        error: TEMPORARY_AI_ERROR,
        aiServiceUnavailable: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(JSON.stringify({ error: `Server error: ${message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
