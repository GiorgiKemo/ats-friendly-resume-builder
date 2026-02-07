// Supabase Edge Function to verify a Stripe checkout session
/// <reference path="./deno.d.ts" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2' // Keep original import
// Use the default Stripe import
import Stripe from 'https://esm.sh/stripe@12.18.0'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

// Initialize Stripe with the secret key from environment variables
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20', // Updated API version to match create-checkout-session
})

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || ''
const supabase: any = createClient(supabaseUrl, supabaseServiceKey) // Type as any to bypass env issues

serve(async (req: Request) => {
  // Define allowed origins
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
    })
  }

  const corsOriginToUse = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : (allowedOrigins[0] || (isProd ? '' : '*'));

  const commonCorsHeaders = {
    ...(corsOriginToUse ? { 'Access-Control-Allow-Origin': corsOriginToUse } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, X-Client-Info, Referer', // Added Referer
  };

  try {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: commonCorsHeaders,
      })
    }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
    })
  }

  if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
    })
  }

    // Get the request body
    const requestBody = await req.json(); // Get the whole body first
    logDebug('[VerifyCheckout] Received request body:', JSON.stringify(requestBody));
    const { sessionId } = requestBody; // Then destructure

    logDebug('[VerifyCheckout] Parsed sessionId from request body:', sessionId);

    // Validate required parameters
    if (!sessionId) {
      console.error('[VerifyCheckout] Missing required parameter: sessionId. Body was:', JSON.stringify(requestBody));
      return new Response(
        JSON.stringify({
          error: 'Missing required parameter: sessionId',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
        }
      )
    }

    // Get the user from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
        },
      })
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '')

    // Verify the token and get the user
    // No longer need ts-ignore due to 'any' type
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
        }
      )
    }

    logDebug(`[VerifyCheckout] Attempting to retrieve Stripe session ID: ${sessionId}`);

    // Retrieve the checkout session from Stripe
    // Type as any to bypass type issues
    const session: any = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    })

    // Verify that the session belongs to the user
    // No longer need ts-ignore due to 'any' type
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to get user profile',
          details: profileError,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
        }
      )
    }

    // Check if the session's customer matches the user's customer ID
    // Ensure session.customer is not null, a string, or deleted before accessing id
    if (
      profile.stripe_customer_id &&
      session.customer && typeof session.customer !== 'string' && !session.customer.deleted && // Type guard
      profile.stripe_customer_id !== session.customer.id
    ) {
      return new Response(
        JSON.stringify({
          error: 'Session does not belong to the authenticated user',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
        }
      )
    }

    // If the user doesn't have a customer ID yet, update it
    if (!profile.stripe_customer_id) {
      // Ensure session.customer is valid before using its ID
      if (session.customer && typeof session.customer !== 'string' && !session.customer.deleted) {
        // No longer need ts-ignore due to 'any' type
        await supabase
          .from('users')
          .update({ stripe_customer_id: session.customer.id })
          .eq('id', user.id)
      } else {
        // Handle the case where customer details are unexpectedly missing/invalid
        console.error(`[VerifyCheckout] Cannot update user ${user.id} with Stripe customer ID because session.customer is invalid:`, session.customer);
        // Optionally throw an error or return a specific response
        throw new Error('Invalid customer details in Stripe session during verification.');
      }
      // Stray .eq() removed from here
    }

    // Get subscription and customer details after type guards
    if (!session.subscription || typeof session.subscription === 'string' || session.subscription.deleted) {
      throw new Error('Subscription details not found or subscription was deleted.');
    }
    if (!session.customer || typeof session.customer === 'string' || session.customer.deleted) {
      throw new Error('Customer details not found or customer was deleted.');
    }

    // Now TypeScript knows these are the expanded, non-deleted types
    // Type as any to bypass type issues
    const subscription: any = session.subscription;
    const customer: any = session.customer;

    const subscriptionData = {
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      plan: session.metadata?.planId || 'premium', // Metadata is on the session itself
      customer: customer.id,
    }

    // Update the user's premium status if the subscription is active
    if (subscription.status === 'active' || subscription.status === 'trialing') { // Also update for trialing status
      // No longer need ts-ignore due to 'any' type
      await supabase
        .from('users')
        .update({
          is_premium: true,
          premium_plan: session.metadata?.planId || 'premium', // Metadata is on the session
          premium_until: new Date(subscription.current_period_end * 1000).toISOString(),
          premium_updated_at: new Date().toISOString(),
          ai_generations_limit: 30, // Default limit for premium users
          ai_generations_used: 0, // Reset usage counter
        })
        .eq('id', user.id)
    }

    // Return the subscription details
    return new Response(JSON.stringify(subscriptionData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
    })
  } catch (error: unknown) {
    console.error('Error verifying checkout session:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const payload = isProd
      ? { error: 'Failed to verify checkout session' }
      : { error: 'Failed to verify checkout session', details: errorMessage };

    return new Response(
      JSON.stringify(payload),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
        },
      }
    )
  }
})
