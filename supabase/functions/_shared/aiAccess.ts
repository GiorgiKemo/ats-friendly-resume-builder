import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { recordServerAnalyticsEvent } from './analytics.ts'

interface ReserveResult {
  allowed?: boolean
  remaining?: number
  reason?: string
  period_start?: string
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || ''
const supabaseServiceKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  ''

const serviceClient = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

const analyticsOrigins = new Set(['https://resumeats.cv', 'https://www.resumeats.cv'])
export type AiGenerationFeature = 'resume_generation' | 'resume_keyword_extraction' | 'work_experience_bullets' |
  'professional_summary' | 'application_answer' | 'keyword_analysis' | 'auto_apply_job_scoring' |
  'auto_apply_cover_letter' | 'auto_apply_email_extraction' | 'gmail_reply_classification' | 'other'

const aiFeatures = new Set<AiGenerationFeature>([
  'resume_generation',
  'resume_keyword_extraction',
  'work_experience_bullets',
  'professional_summary',
  'application_answer',
  'keyword_analysis',
  'auto_apply_job_scoring',
  'auto_apply_cover_letter',
  'auto_apply_email_extraction',
  'gmail_reply_classification',
  'other',
])

export const hasAnalyticsConsent = (request: Request) => (
  Deno.env.get('NODE_ENV') !== 'development' &&
  request.headers.get('x-analytics-consent') === 'granted' &&
  analyticsOrigins.has(request.headers.get('Origin') || '')
)

export const resolveAiAnalyticsFeature = (request: Request) => {
  const feature = request.headers.get('x-ai-feature') || ''
  return aiFeatures.has(feature as AiGenerationFeature) ? feature as AiGenerationFeature : 'other'
}

type AiGenerationEventName = 'ai_generation_started' | 'ai_generation_completed' | 'ai_generation_failed'

export const recordAiGenerationEvent = async (event: {
  consented: boolean
  attemptId: string
  userId: string
  eventName: AiGenerationEventName
  feature: AiGenerationFeature
  provider?: 'openrouter' | 'groq' | 'fallback_chain'
  model?: string
  durationMs?: number
  failureCode?: 'provider_http_error' | 'invalid_response' | 'provider_unavailable' | 'provider_or_response_error'
}) => {
  if (!event.consented || !serviceClient || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.attemptId)) return false

  const properties: Record<string, unknown> = {
    attempt_id: event.attemptId,
    feature: event.feature,
    usage_version: 1,
    cost_version: 'unpriced',
  }
  if (event.provider) properties.provider = event.provider
  if (event.model) properties.model = event.model.slice(0, 120)
  if (Number.isFinite(event.durationMs)) properties.duration_ms = Math.max(0, Math.min(Math.floor(event.durationMs!), 1_000_000))
  if (event.failureCode) properties.failure_code = event.failureCode

  try {
    await recordServerAnalyticsEvent(serviceClient, {
      eventKey: `ai:${event.attemptId}:${event.eventName}`,
      eventName: event.eventName,
      userId: event.userId,
      properties,
    })
    return true
  } catch {
    console.error('AI analytics lifecycle event could not be recorded', event.eventName)
    return false
  }
}

export const resolveAllowedModel = (
  requestedModel: unknown,
  defaultModel: string,
  allowedModelsEnvName: string,
) => {
  const normalizedDefault = defaultModel.trim()
  const configured = (Deno.env.get(allowedModelsEnvName) || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)

  const allowedModels = configured.length ? configured : [normalizedDefault].filter(Boolean)
  const requested = typeof requestedModel === 'string' ? requestedModel.trim() : ''
  if (requested && allowedModels.includes(requested)) return requested

  if (configured.length > 0) {
    if (normalizedDefault && allowedModels.includes(normalizedDefault)) {
      return normalizedDefault
    }

    console.error(`${allowedModelsEnvName} is configured but default model "${normalizedDefault}" is not allowed. Falling back to first allowed model.`)
    return allowedModels[0]
  }

  return normalizedDefault
}

export const reserveAiGenerationOrResponse = async (
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | { periodStart: string }> => {
  if (!serviceClient) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: Supabase service key is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { data, error } = await serviceClient.rpc('reserve_ai_generation_with_period', {
    p_user_id: userId,
  })

  if (error) {
    console.error('AI quota reservation failed:', error.message)
    return new Response(JSON.stringify({ error: 'Could not verify AI access' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const reservation = (Array.isArray(data) ? data[0] : data) as ReserveResult | null
  if (reservation?.allowed) {
    if (reservation.period_start) return { periodStart: reservation.period_start }
    return new Response(JSON.stringify({ error: 'Could not verify AI quota period' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const reason = reservation?.reason || 'upgrade_required'
  const message = reason === 'limit_reached'
    ? 'You have reached your AI generation limit for this billing period.'
    : reason === 'user_not_found'
      ? 'Your profile is not ready yet. Please refresh and try again.'
      : 'Upgrade to Premium to use AI generation.'

  return new Response(JSON.stringify({
    error: message,
    aiAccessDenied: true,
    reason,
    remaining: reservation?.remaining || 0,
  }), {
    // Keep a 200 response so supabase-js returns the structured denial payload to the app.
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

export const refundAiGenerationForUser = async (userId: string, periodStart: string): Promise<boolean> => {
  if (!serviceClient || !userId || !periodStart) {
    return false
  }

  const { data, error } = await serviceClient.rpc('refund_ai_generation_for_user', {
    p_user_id: userId,
    p_period_start: periodStart,
  })

  if (error) {
    console.error('AI quota refund failed:', error.message)
    return false
  }

  return Boolean(data)
}
