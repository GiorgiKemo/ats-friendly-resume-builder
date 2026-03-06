#!/bin/bash

# Script to create the Stripe customer portal Edge Function in Supabase

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
  echo "Error: Supabase CLI is not installed."
  echo "Please install it with: npm install -g supabase"
  exit 1
fi

# Create the functions directory if it doesn't exist
mkdir -p supabase/functions/create-portal-session

# Create the portal session function
echo "Creating Stripe customer portal session function..."
cat > supabase/functions/create-portal-session/index.ts << 'EOL'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"

// Initialize Stripe with the secret key from environment variables
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

// Initialize Supabase client
const supabaseUrl = Deno.env.get("API_URL") || ""
const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY") || ""
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
      },
      status: 204,
    })
  }
  
  try {
    // Get the request body
    const { return_url } = await req.json()
    
    // Get the user ID from the authorization header
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      })
    }
    
    const token = authHeader.replace("Bearer ", "")
    
    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      })
    }
    
    // Get the user's Stripe customer ID from the database
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single()
    
    if (userError || !userData.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "User not found or no Stripe customer ID" }), {
        headers: { "Content-Type": "application/json" },
        status: 404,
      })
    }
    
    // Create a portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: return_url || "https://resumeats.cv/#/dashboard",
    })
    
    // Return the portal URL
    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      status: 200,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred"
    console.error(`Error creating portal session: ${errorMessage}`)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
EOL

echo "Portal session function created successfully"

# Deploy the function to Supabase
echo "Deploying portal session function to Supabase..."
supabase functions deploy create-portal-session

echo "Portal session function deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Make sure your Stripe secret key is set in Supabase:"
echo "   supabase secrets set STRIPE_SECRET_KEY=your_stripe_secret_key"
echo "2. Add a button to your account page to create a portal session:"
echo "   ```javascript"
echo "   const createPortalSession = async () => {"
echo "     const { data, error } = await supabase.functions.invoke('create-portal-session', {"
echo "       body: { return_url: window.location.origin + '/account' }"
echo "     });"
echo "     "
echo "     if (data?.url) {"
echo "       window.location.href = data.url;"
echo "     }"
echo "   };"
echo "   ```"
echo "3. Test the portal functionality with a test subscription"
