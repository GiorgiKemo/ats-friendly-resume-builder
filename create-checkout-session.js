import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=denonext'

const isProd = Deno.env.get('NODE_ENV') === 'production'

// Initialize Stripe with the secret key from environment variables
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

// Initialize Supabase client
const supabaseUrl = Deno.env.get("API_URL") || ""
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY") || ""
const supabase = createClient(supabaseUrl, supabaseKey)

const allowedOrigins = [
  Deno.env.get('CORS_ORIGIN_PROD'),
  Deno.env.get('CORS_ORIGIN'),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean)

const buildCorsHeaders = (requestOrigin) => {
  const isAllowed = !requestOrigin || allowedOrigins.includes(requestOrigin)
  if (isProd && requestOrigin && !isAllowed) return null

  const origin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : (allowedOrigins[0] || (isProd ? '' : '*'))

  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
    "Access-Control-Max-Age": "86400",
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("Origin"))
  if (!corsHeaders) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      headers: { "Content-Type": "application/json" },
      status: 403,
    })
  }

  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    })
  }

  try {
    // Get the request body
    const { priceId, planId, successUrl, cancelUrl } = await req.json()

    // Validate required parameters
    if (!priceId || !planId || !successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    // Get the user ID from the authorization header
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    const token = authHeader.replace("Bearer ", "")

    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    // Get the user's data from the database
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single()

    if (userError) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      })
    }

    // Create checkout session parameters
    const params = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
        plan_id: planId,
      },
    }

    // If the user already has a Stripe customer ID, use it
    if (userData.stripe_customer_id) {
      params.customer = userData.stripe_customer_id
    } else {
      // Otherwise, create a new customer
      params.customer_email = userData.email || user.email
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(params)

    // Return the session URL
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (err) {
    console.error(`Error creating checkout session: ${err.message}`)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
