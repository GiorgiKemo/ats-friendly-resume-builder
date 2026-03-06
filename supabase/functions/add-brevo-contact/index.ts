import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')
    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY is not configured')
    }

    const { email, firstName } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
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
        email,
        attributes: {
          FIRSTNAME: firstName || '',
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
    console.error('Error adding Brevo contact:', error.message)
    // Return 200 even on error — we don't want Brevo issues to break signup
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
