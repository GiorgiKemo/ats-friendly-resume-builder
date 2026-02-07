import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"
import { getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts"

const isProd = Deno.env.get("NODE_ENV") === "production"
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || ""
const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("API_URL") || ""
const supabaseKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SERVICE_ROLE_KEY") ||
  ""
const siteUrl = (Deno.env.get("SITE_URL") || "https://ats-friendly-resume-builder.vercel.app").replace(/\/+$/, "")

if (!stripeSecretKey) {
  console.error("Missing STRIPE_SECRET_KEY environment variable")
}
if (!supabaseUrl) {
  console.error("Missing SUPABASE_URL environment variable")
}
if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY environment variable")
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const originAllowed = isOriginAllowed(requestOrigin);
  if (isProd && requestOrigin && !originAllowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      headers: { "Content-Type": "application/json" },
      status: 403,
    });
  }

  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 405,
    })
  }

  if (!stripeSecretKey || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const returnUrlRaw = typeof body?.returnUrl === "string" ? body.returnUrl : ""
    const returnUrlLegacy = typeof body?.return_url === "string" ? body.return_url : ""
    const requestedReturnUrl = (returnUrlRaw || returnUrlLegacy).trim()

    const normalizeOrigin = (url: string) => {
      try {
        return new URL(url).origin
      } catch {
        return ""
      }
    }

    const siteOrigin = normalizeOrigin(siteUrl)
    const allowedReturnOrigins = new Set<string>()
    if (siteOrigin) allowedReturnOrigins.add(siteOrigin)
    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      allowedReturnOrigins.add(requestOrigin)
    }
    if (!isProd) {
      allowedReturnOrigins.add("http://localhost:5173")
      allowedReturnOrigins.add("http://localhost:5174")
      allowedReturnOrigins.add("http://127.0.0.1:5173")
      allowedReturnOrigins.add("http://127.0.0.1:5174")
    }

    const defaultReturnOrigin =
      requestOrigin && allowedReturnOrigins.has(requestOrigin)
        ? requestOrigin
        : (siteOrigin || siteUrl)

    let safeReturnUrl = `${defaultReturnOrigin}/#/dashboard`
    if (requestedReturnUrl) {
      if (requestedReturnUrl.startsWith("/")) {
        safeReturnUrl = `${defaultReturnOrigin}${requestedReturnUrl}`
      } else {
        try {
          const parsedReturnUrl = new URL(requestedReturnUrl)
          if (allowedReturnOrigins.has(parsedReturnUrl.origin)) {
            safeReturnUrl = requestedReturnUrl
          }
        } catch {
          // Keep the safe default
        }
      }
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 401,
      })
    }

    const token = authHeader.replace("Bearer ", "")

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 401,
      })
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single()

    if (userError || !userData?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "User not found or no Stripe customer ID" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 404,
      })
    }

    let customerId = userData.stripe_customer_id
    let session

    try {
      session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: safeReturnUrl,
      })
    } catch (stripeError) {
      const stripeErr = stripeError as { code?: string; type?: string; message?: string }
      const isMissingCustomer = stripeErr?.code === "resource_missing"
      const isTestKey = stripeSecretKey.startsWith("sk_test_")
      const isLocalReturn =
        safeReturnUrl.startsWith("http://localhost") ||
        safeReturnUrl.startsWith("http://127.0.0.1")

      if (isMissingCustomer && (isTestKey || isLocalReturn)) {
        logDebug("Stripe customer missing. Creating replacement customer for user:", user.id)

        const replacementCustomer = await stripe.customers.create({
          email: userData.email || user.email || undefined,
          metadata: {
            supabaseUserId: user.id,
            originalFailedCustomerId: customerId,
          },
        })

        customerId = replacementCustomer.id

        const { error: updateError } = await supabase
          .from("users")
          .update({
            stripe_customer_id: customerId,
            premium_updated_at: new Date().toISOString(),
          })
          .eq("id", user.id)

        if (updateError) {
          console.error("Failed to update user with replacement Stripe customer ID:", updateError)
        }

        session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: safeReturnUrl,
        })
      } else {
        throw stripeError
      }
    }

    logDebug("Created portal session for user:", user.id)

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred"
    console.error(`Error creating portal session: ${errorMessage}`)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    })
  }
})
