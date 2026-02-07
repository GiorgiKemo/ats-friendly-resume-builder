import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"

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

// Helper function for logging
const logInfo = (message, data = {}) => {
  if (!isProd) console.log(`INFO: ${message}`, JSON.stringify(data));
}

// Helper function for error logging
const logError = (message, error = {}) => {
  console.error(`ERROR: ${message}`, JSON.stringify(error));
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
    logInfo("Function invoked", { method: req.method });

    // Get the request body
    let returnUrl;
    try {
      const body = await req.json();
      returnUrl = body.returnUrl;
      logInfo("Request body parsed", { returnUrl });
    } catch (parseError) {
      logError("Failed to parse request body", parseError);
      return new Response(JSON.stringify({
        fallback: true,
        error: "Invalid request body",
        details: parseError.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 to prevent non-2xx errors
      });
    }

    // Get the user ID from the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logError("Missing authorization header");
      return new Response(JSON.stringify({
        fallback: true,
        error: "Missing authorization header",
        details: "Please log in again"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 to prevent non-2xx errors
      });
    }

    const token = authHeader.replace("Bearer ", "");
    logInfo("Authorization header found");

    // Verify the token and get the user
    let user;
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        logError("Invalid token", { error });
        return new Response(JSON.stringify({
          fallback: true,
          error: "Invalid token",
          details: "Please log in again"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Always return 200 to prevent non-2xx errors
        });
      }
      user = data.user;
      logInfo("User authenticated", { userId: user.id });
    } catch (authError) {
      logError("Error authenticating user", authError);
      return new Response(JSON.stringify({
        fallback: true,
        error: "Authentication error",
        details: authError.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 to prevent non-2xx errors
      });
    }

    // Get the user's Stripe customer ID from the database
    let userData;
    try {
      const { data, error } = await supabase
        .from("users")
        .select("stripe_customer_id, email")
        .eq("id", user.id)
        .single();

      if (error) {
        logError("Error fetching user data", { error });
        return new Response(JSON.stringify({
          fallback: true,
          error: "User data error",
          details: "Could not retrieve user information"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Always return 200 to prevent non-2xx errors
        });
      }

      userData = data;
      logInfo("User data retrieved", {
        hasStripeCustomerId: !!userData.stripe_customer_id,
        email: userData.email
      });

      if (!userData.stripe_customer_id) {
        logInfo("No Stripe customer ID found");
        return new Response(JSON.stringify({
          fallback: true,
          error: "No subscription found",
          details: "No Stripe customer ID associated with this account"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Always return 200 to prevent non-2xx errors
        });
      }
    } catch (dbError) {
      logError("Database error", dbError);
      return new Response(JSON.stringify({
        fallback: true,
        error: "Database error",
        details: dbError.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 to prevent non-2xx errors
      });
    }

    // Create a portal session
    try {
      logInfo("Creating Stripe portal session", {
        customerId: userData.stripe_customer_id,
        returnUrl
      });

      const session = await stripe.billingPortal.sessions.create({
        customer: userData.stripe_customer_id,
        return_url: returnUrl || "https://ats-friendly-resume-builder.vercel.app/account",
      });

      logInfo("Portal session created", { sessionId: session.id });

      // Return the portal URL
      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (stripeError) {
      logError("Stripe error", stripeError);
      return new Response(JSON.stringify({
        fallback: true,
        error: "Stripe error",
        details: stripeError.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 to prevent non-2xx errors
      });
    }
  } catch (err) {
    logError("Unhandled error", err);
    return new Response(JSON.stringify({
      fallback: true,
      error: "Server error",
      details: err.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200, // Always return 200 to prevent non-2xx errors
    });
  }
})
