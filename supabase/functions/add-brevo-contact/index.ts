import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || ''
const anonKey = Deno.env.get('SB_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('ANON_KEY') ||
  ''

const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
})

const normalizeEmail = (value: unknown = '') =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const sanitizeString = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const getAuthenticatedUser = async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ') || !anonKey) return null

  const token = authHeader.slice('Bearer '.length)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = getCorsHeaders(origin)

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  const authUser = await getAuthenticatedUser(req)
  if (!authUser?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  try {
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY is not configured')
    }

    const { email, firstName } = await req.json()
    const normalizedEmail = normalizeEmail(email)
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (normalizedEmail !== normalizeEmail(authUser.email)) {
      return new Response(JSON.stringify({ error: 'Email does not match authenticated user' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // List ID 5 = "ResumeATS Users" list in Brevo
    const brevoResponse = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        email: normalizedEmail,
        attributes: {
          FIRSTNAME: sanitizeString(firstName, 100),
        },
        listIds: [5],
        updateEnabled: true,
      }),
    })

    const brevoData = await brevoResponse.json()

    if (!brevoResponse.ok) {
      console.error('Brevo API error:', brevoData)
      // Don't fail the signup — just log the error
      return new Response(JSON.stringify({ success: false, error: brevoData.message }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not add Brevo contact'
    console.error('Error adding Brevo contact:', message)
    // Return 200 even on error — we don't want Brevo issues to break signup
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
