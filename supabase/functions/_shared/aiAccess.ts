import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ReserveResult {
  allowed?: boolean
  remaining?: number
  reason?: string
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
): Promise<Response | null> => {
  if (!serviceClient) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: Supabase service key is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { data, error } = await serviceClient.rpc('reserve_ai_generation_for_user', {
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
    return null
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

export const refundAiGenerationForUser = async (userId: string): Promise<boolean> => {
  if (!serviceClient || !userId) {
    return false
  }

  const { data, error } = await serviceClient.rpc('refund_ai_generation_for_user', {
    p_user_id: userId,
  })

  if (error) {
    console.error('AI quota refund failed:', error.message)
    return false
  }

  return Boolean(data)
}
