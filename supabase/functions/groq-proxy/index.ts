// supabase/functions/groq-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

// GROQ_API_KEY is the current provider key.
// TODO: In the future this may be replaced by OPENAI_API_KEY or GEMINI_API_KEY.
const groqApiKey = Deno.env.get('GROQ_API_KEY') || ''
// Default to the current Groq replacement model (llama-3.3-70b-versatile).
const defaultModel = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_OUTPUT_TOKENS = 2048

const clampMaxTokens = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value <= 0) return fallback
  return Math.min(Math.floor(value), MAX_OUTPUT_TOKENS)
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

  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: GROQ_API_KEY is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const messages = Array.isArray(body?.messages) ? body.messages : []

    let finalMessages = messages
    if (!finalMessages.length && Array.isArray(body?.contents)) {
      // Backwards compatibility: convert Gemini-style contents to a single user message
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

    const payload = {
      model: typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : defaultModel,
      messages: finalMessages,
      temperature: typeof body?.temperature === 'number' ? body.temperature : 0.7,
      max_tokens: clampMaxTokens(body?.maxTokens, 2048),
    }

    logDebug('groq-proxy: sending request', {
      model: payload.model,
      messageCount: payload.messages.length,
      max_tokens: payload.max_tokens,
    })

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
      logDebug('groq-proxy: upstream error', response.status, responseText)
      let details: string | Record<string, unknown> = responseText
      try {
        details = JSON.parse(responseText)
      } catch {
        // keep raw text
      }
      return new Response(JSON.stringify({
        error: 'AI provider error',
        providerStatus: response.status,
        details,
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
    console.error('groq-proxy: unexpected error', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
