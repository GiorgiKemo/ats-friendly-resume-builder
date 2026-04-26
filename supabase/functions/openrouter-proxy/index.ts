// supabase/functions/openrouter-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts'
import { refundAiGenerationForUser, reserveAiGenerationOrResponse, resolveAllowedModel } from '../_shared/aiAccess.ts'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY') || ''
const defaultModel = Deno.env.get('OPENROUTER_MODEL') || Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'
const siteUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://resumeats.cv'
const siteTitle = Deno.env.get('OPENROUTER_APP_TITLE') || 'ResumeATS'
const reasoningEffort = Deno.env.get('OPENROUTER_REASONING_EFFORT') || 'minimal'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_OUTPUT_TOKENS = 4096

const clampMaxTokens = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value <= 0) return fallback
  return Math.min(Math.floor(value), MAX_OUTPUT_TOKENS)
}

const parseJsonFromText = (text: string) => {
  const cleaned = text.replace(/^```json\s*|```$/g, '').trim()
  try {
    JSON.parse(cleaned)
    return true
  } catch {
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace <= firstBrace) return false
    try {
      JSON.parse(text.slice(firstBrace, lastBrace + 1))
      return true
    } catch {
      return false
    }
  }
}

const responseHasExpectedJson = (responseText: string) => {
  try {
    const parsed = JSON.parse(responseText)
    const content = parsed?.choices?.[0]?.message?.content
    return typeof content === 'string' && parseJsonFromText(content)
  } catch {
    return false
  }
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
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const authUser = await authenticateUser(req)
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (!openRouterApiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: OPENROUTER_API_KEY is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  let quotaReserved = false

  try {
    const body = await req.json().catch(() => ({}))
    const messages = Array.isArray(body?.messages) ? body.messages : []

    let finalMessages = messages
    if (!finalMessages.length && Array.isArray(body?.contents)) {
      const combined = body.contents
        .map((item: { parts?: Array<{ text?: string }> }) =>
          (item?.parts || []).map((part) => part?.text || '').join(' ')
        )
        .join('\n')
        .trim()
      if (combined) {
        finalMessages = [{ role: 'user', content: combined }]
      }
    }

    if (!finalMessages.length) {
      return new Response(JSON.stringify({ error: 'Missing messages for AI request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const accessDeniedResponse = await reserveAiGenerationOrResponse(authUser.userId, corsHeaders)
    if (accessDeniedResponse) return accessDeniedResponse
    quotaReserved = true

    const payload = {
      model: resolveAllowedModel(body?.model, defaultModel, 'OPENROUTER_ALLOWED_MODELS'),
      messages: finalMessages,
      temperature: typeof body?.temperature === 'number' ? body.temperature : 0.7,
      max_tokens: clampMaxTokens(body?.maxTokens, 2048),
      reasoning: body?.reasoning || {
        effort: reasoningEffort,
        exclude: true,
      },
    }

    logDebug('openrouter-proxy: sending request', {
      model: payload.model,
      messageCount: payload.messages.length,
      max_tokens: payload.max_tokens,
    })

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': siteUrl,
        'X-Title': siteTitle,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    if (!response.ok) {
      await refundAiGenerationForUser(authUser.userId)
      quotaReserved = false
      logDebug('openrouter-proxy: upstream error', response.status, responseText)
      let details: string | Record<string, unknown> = responseText
      try {
        details = JSON.parse(responseText)
      } catch {
        // keep raw text
      }
      return new Response(JSON.stringify({
        error: 'AI resume generation is temporarily unavailable. We are working on a fix. Please try again shortly.',
        aiServiceUnavailable: true,
        providerStatus: response.status,
        details,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (body?.expectJson === true && !responseHasExpectedJson(responseText)) {
      await refundAiGenerationForUser(authUser.userId)
      quotaReserved = false
      return new Response(JSON.stringify({
        error: 'AI resume generation is temporarily unavailable. We are working on a fix. Please try again shortly.',
        aiServiceUnavailable: true,
        details: 'The model response could not be parsed as JSON.',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(responseText, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (quotaReserved) {
      await refundAiGenerationForUser(authUser.userId)
    }
    console.error('openrouter-proxy: unexpected error', message)
    if (quotaReserved) {
      return new Response(JSON.stringify({
        error: 'AI resume generation is temporarily unavailable. We are working on a fix. Please try again shortly.',
        aiServiceUnavailable: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
