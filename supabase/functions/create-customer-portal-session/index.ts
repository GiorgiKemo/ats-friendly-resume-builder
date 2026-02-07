// Follow this setup guide to integrate the Deno runtime into your Supabase project:
// https://supabase.com/docs/guides/functions/deno-runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

// Get environment variables
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')

// Validate environment variables
if (!stripeSecretKey) {
  console.error('Missing STRIPE_SECRET_KEY environment variable')
}
if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL environment variable')
}
if (!supabaseServiceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
}

// Initialize Stripe with the secret key from environment variables
const stripe = new Stripe(stripeSecretKey || '', {
  apiVersion: '2023-10-16',
})

// Initialize Supabase client
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '')

serve(async (req) => {
  const allowedOrigins = [
    Deno.env.get('CORS_ORIGIN_PROD'),
    Deno.env.get('CORS_ORIGIN'),
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ].filter(Boolean) as string[];

  const requestOrigin = req.headers.get('Origin');
  const isOriginAllowed = !requestOrigin || allowedOrigins.includes(requestOrigin);
  if (isProd && requestOrigin && !isOriginAllowed) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const corsOriginToUse = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : (allowedOrigins[0] || (isProd ? '' : '*'));

  const commonCorsHeaders = {
    ...(corsOriginToUse ? { 'Access-Control-Allow-Origin': corsOriginToUse } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, X-Client-Info',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: commonCorsHeaders,
      status: 204,
    })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
      status: 405,
    })
  }

  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
      status: 500,
    })
  }

  try {
    // Get the request body
    const { returnUrl } = await req.json()

    // Validate required parameters
    if (!returnUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 400,
        }
      )
    }

    // Get the user ID from the JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
          },
        status: 401,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
          },
        status: 401,
      })
    }

    // Get the user's profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('stripe_customer_id, is_premium')
      .eq('id', user.id)
      .single()

    if (profileError) {
      const payload = isProd
        ? { error: 'Failed to get user profile' }
        : { error: 'Failed to get user profile', details: profileError.message };

      return new Response(
        JSON.stringify(payload),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 500,
        }
      )
    }

    // Check if the user is premium but doesn't have a Stripe customer ID
    if (profile.is_premium && !profile.stripe_customer_id) {
      return new Response(
        JSON.stringify({
          error: 'No Stripe customer ID found',
          details: 'You have premium access but no Stripe subscription. This might be a development account.',
          fallback: true
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 200, // Return 200 to allow client-side fallback
        }
      )
    }

    // Check if the user has a Stripe customer ID
    if (!profile.stripe_customer_id) {
      return new Response(
        JSON.stringify({
          error: 'No active subscription found',
          details: 'You do not have an active subscription with Stripe.',
          fallback: true
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 200, // Return 200 to allow client-side fallback
        }
      )
    }

    // Validate the customer ID format
    if (!profile.stripe_customer_id.startsWith('cus_')) {
      console.error('Invalid Stripe customer ID format:', profile.stripe_customer_id)
      return new Response(
        JSON.stringify({
          error: 'Invalid Stripe customer ID format',
          details: 'The customer ID does not appear to be valid',
          fallback: true
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 200, // Return 200 to allow client-side fallback
        }
      )
    }

    // Log the customer ID we're using (dev-only)
    logDebug('Creating portal session for customer ID:', profile.stripe_customer_id)

    try {
      // Create a customer portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: returnUrl,
      })

      // Log success (dev-only)
      logDebug('Successfully created portal session with URL:', session.url.substring(0, 30) + '...')

      // Return the portal URL
      return new Response(JSON.stringify({ url: session.url }), {
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
        },
        status: 200,
      })
    } catch (stripeError) {
      console.error('Stripe API error creating portal session:', stripeError)

      const stripePayload = isProd
        ? { error: 'Stripe API error', fallback: true }
        : {
            error: stripeError.message || 'Stripe API error',
            type: stripeError.type || 'unknown',
            code: stripeError.code || 'unknown',
            param: stripeError.param,
            detail: stripeError.detail,
            fallback: true
          };

      return new Response(
        JSON.stringify(stripePayload),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 200, // Return 200 to allow client-side fallback
        }
      )
    }
  } catch (error) {
    // Log detailed error information
    console.error('Error creating customer portal session:', error)

    // Check for Stripe-specific errors
    if (error.type && error.type.startsWith('Stripe')) {
      console.error('Stripe API error details:', {
        type: error.type,
        code: error.code,
        param: error.param,
        detail: error.detail
      })
    }

    // Check for environment variable issues
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is missing or invalid')
    }

    // Check for customer ID issues
    if (error.message && error.message.includes('customer')) {
      console.error('Possible customer ID issue. Check if the customer exists in Stripe.')
    }

    // Return a response that indicates the client should use the fallback
    const errorPayload = isProd
      ? {
          error: 'Internal server error',
          fallback: true,
          details: 'An error occurred while creating the customer portal session. Using fallback subscription management.'
        }
      : {
          error: error.message || 'Internal server error',
          type: error.type || 'unknown',
          code: error.code || 'unknown',
          fallback: true,
          details: 'An error occurred while creating the customer portal session. Using fallback subscription management.'
        };

    return new Response(
      JSON.stringify(errorPayload),
      {
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
        },
        // Return 200 instead of 500 to avoid triggering error handling in the client
        // The fallback flag will signal the client to use the fallback
        status: 200,
      }
    )
  }
})
