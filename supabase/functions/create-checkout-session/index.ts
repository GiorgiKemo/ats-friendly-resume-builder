// Follow this setup guide to integrate the Deno runtime into your Supabase project:
// https://supabase.com/docs/guides/functions/deno-runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}
const logWarn = (...args: unknown[]) => {
  if (!isProd) console.warn(...args)
}

// Initialize Stripe with the secret key from environment variables
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
if (!stripeSecretKey) {
  console.error('CRITICAL: STRIPE_SECRET_KEY is not set in environment variables.')
  // Optionally, you could throw an error here to prevent the function from proceeding
  // throw new Error("CRITICAL: STRIPE_SECRET_KEY is not set.");
}
const stripe = new Stripe(stripeSecretKey || '', { // Use the fetched key, fallback to empty string if still desired (though not recommended)
  apiVersion: '2024-06-20', // Updated API version
})

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')
if (!supabaseUrl) {
  console.error('CRITICAL: SUPABASE_URL is not set in environment variables.')
}
if (!supabaseServiceKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.')
}
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '') // Fallback to empty strings if still desired

serve(async (req) => {
  logDebug(`create-checkout-session: Function invoked. Method: ${req.method}`)

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, X-Client-Info, Referer',
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
    const requestBody = await req.json();
    logDebug('create-checkout-session: Received request body:', JSON.stringify(requestBody));

    // Accommodate both naming conventions for success/cancel paths
    const rawSuccessPath = requestBody.clientSuccessPath || requestBody.successUrl;
    const rawCancelPath = requestBody.clientCancelPath || requestBody.cancelUrl;
    const { priceId, planId } = requestBody;

    // Validate redirect paths to prevent open redirect attacks
    // Only allow relative paths starting with / (no protocol-relative //domain.com)
    const isValidPath = (p: string) => typeof p === 'string' && /^\/[^/]/.test(p);
    const actualSuccessPath = isValidPath(rawSuccessPath) ? rawSuccessPath : '/subscription/success';
    const actualCancelPath = isValidPath(rawCancelPath) ? rawCancelPath : '/pricing';

    // Validate priceId against server-side allowlist to prevent arbitrary price injection
    const allowedPriceIds = (Deno.env.get('ALLOWED_STRIPE_PRICE_IDS') || '')
      .split(',')
      .map((id: string) => id.trim())
      .filter(Boolean);
    const allowedPlanIds = ['premium', 'pro', 'premium_monthly', 'premium_yearly'];

    if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
      console.error(`create-checkout-session: Rejected invalid priceId: ${priceId}. Allowed: ${allowedPriceIds.join(', ')}`);
      return new Response(
        JSON.stringify({ error: 'Invalid price selected' }),
        {
          headers: { 'Content-Type': 'application/json', ...commonCorsHeaders },
          status: 400,
        }
      )
    }

    if (planId && !allowedPlanIds.includes(planId)) {
      console.error(`create-checkout-session: Rejected invalid planId: ${planId}. Allowed: ${allowedPlanIds.join(', ')}`);
      return new Response(
        JSON.stringify({ error: 'Invalid plan selected' }),
        {
          headers: { 'Content-Type': 'application/json', ...commonCorsHeaders },
          status: 400,
        }
      )
    }

    // Validate required parameters
    const missingParams: string[] = [];
    if (!priceId) missingParams.push('priceId');
    if (!planId) missingParams.push('planId');
    if (!actualSuccessPath) missingParams.push('clientSuccessPath or successUrl');
    if (!actualCancelPath) missingParams.push('clientCancelPath or cancelUrl');

    if (missingParams.length > 0) {
      const errorDetail = `Missing required parameters: ${missingParams.join(', ')}`;
      console.error(`create-checkout-session: Validation Error - ${errorDetail}. Request body:`, JSON.stringify(requestBody));
      return new Response(
        JSON.stringify({ error: 'Missing required parameters', detail: errorDetail }),
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

    // DEBUG: Force an error to test logging - REMOVED
    // throw new Error("DEBUG: Deliberate error to test logging.");

    if (!authHeader) {
      logDebug('create-checkout-session: No Authorization header found.');
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
    logDebug('create-checkout-session: User object from Supabase auth:', JSON.stringify(user));
    logDebug('create-checkout-session: User error from Supabase auth:', JSON.stringify(userError));

    if (userError || !user) {
      console.error('create-checkout-session: Authorization failed. User error or no user.', { userError, userExists: !!user });
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
      .select('email, stripe_customer_id')
      .eq('id', user.id) // Ensure user is not null here due to the check above
      .single()
    // Log the raw profileError object to understand its structure and content
    logDebug('create-checkout-session: Profile error object from Supabase db:', JSON.stringify(profileError));
    logDebug('create-checkout-session: Profile data object from Supabase db:', JSON.stringify(profile));


    if (profileError) {
      console.error('create-checkout-session: Failed to get user profile. Profile error details:', JSON.stringify(profileError));
      return new Response(
        JSON.stringify({ error: 'Failed to get user profile' }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...commonCorsHeaders,
          },
          status: 500,
        }
      )
    }

    // Get or create a Stripe customer
    let customerId = profile.stripe_customer_id

    if (!customerId) {
      logDebug(`Creating new Stripe customer for user ${user.id} with email ${profile.email || user.email}`)

      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        metadata: {
          supabaseUserId: user.id,
        },
      })

      customerId = customer.id
      logDebug(`Created new Stripe customer: ${customerId}`)

      // Update the user profile with the Stripe customer ID
      const { error: updateError } = await supabase
        .from('users')
        .update({
          stripe_customer_id: customerId,
          // Also update these fields to ensure they're set correctly
          premium_updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (updateError) {
        console.error(`Error updating user ${user.id} with Stripe customer ID:`, updateError)
        // Continue anyway, as the webhook will also try to update this
      } else {
        logDebug(`Updated user ${user.id} with Stripe customer ID ${customerId}`)
      }
    } else {
      logDebug(`Using existing Stripe customer ID for user ${user.id}: ${customerId}`)

      // Verify the customer exists in Stripe AND IS NOT DELETED
      try {
        const retrievedCustomer = await stripe.customers.retrieve(customerId);
        if (retrievedCustomer.deleted) {
          logWarn(`Stripe customer ${customerId} was retrieved but is marked as DELETED. Treating as non-existent and forcing replacement.`);
          // Artificially throw an error to trigger the catch block for replacement customer creation.
          // Pass a custom error object or a modified StripeError-like object if needed for specific handling in the catch.
          const error = new Error(`Customer ${customerId} is deleted.`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error as any).code = 'resource_missing_deleted'; // Custom code to identify this scenario if needed
          throw error;
        }
        logDebug(`Verified Stripe customer exists and is NOT DELETED: ${customerId}`);
      } catch (stripeError) {
        // This catch block will now also handle the 'Customer ... is deleted.' error thrown above.
        console.error(`Error during Stripe customer retrieve/check for ${customerId} (or customer was deleted). Will attempt to create a replacement. Error details:`, stripeError);
        logDebug(`Attempting to create a replacement Stripe customer for user ${user.id} because original ID ${customerId} was not found, invalid, or deleted.`);
        try {
          const replacementCustomer = await stripe.customers.create({
            email: profile.email || user.email, // Ensure email is available
            metadata: {
              supabaseUserId: user.id,
              originalFailedCustomerId: customerId, // Log the old ID for reference
            },
          });

          const newCustomerId = replacementCustomer.id;
          logDebug(`Successfully created REPLACEMENT Stripe customer. New ID: ${newCustomerId}. Old/failed ID was: ${customerId}`);
          customerId = newCustomerId; // IMPORTANT: Update customerId to the new one

          // Update the user profile with the NEW Stripe customer ID
          const { error: updateError } = await supabase
            .from('users')
            .update({
              stripe_customer_id: newCustomerId, // Use the new ID for the update
              premium_updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          if (updateError) {
            console.error(`Error updating user ${user.id} in Supabase with REPLACEMENT Stripe customer ID ${newCustomerId}:`, updateError);
            // Even if Supabase update fails, proceed with the new customerId for this session
          } else {
            logDebug(`Successfully updated user ${user.id} in Supabase with REPLACEMENT Stripe customer ID ${newCustomerId}`);
          }
        } catch (replacementCreateError) {
          console.error(`CRITICAL_STRIPE_FAILURE: Failed to create REPLACEMENT Stripe customer for user ${user.id} after original ID ${customerId} failed retrieval. Replacement creation error:`, replacementCreateError);
          // If replacement customer creation itself fails, we cannot proceed.
          // Re-throw the error to be caught by the main handler, which will return a 500.
          // This ensures we don't try to use the old, invalid customerId.
          throw replacementCreateError;
        }
      }
    }

    // Double-check that the customer ID was properly saved
    const { data: updatedProfile, error: checkError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (checkError || !updatedProfile.stripe_customer_id) {
      console.error(`Error verifying Stripe customer ID for user ${user.id}:`, checkError || 'No customer ID found')

      // Try one more time to update the user profile
      if (!checkError && !updatedProfile.stripe_customer_id) {
        logDebug(`Attempting to fix missing Stripe customer ID for user ${user.id}`)

        const { error: fixError } = await supabase
          .from('users')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id)

        if (fixError) {
          console.error(`Failed to fix missing Stripe customer ID for user ${user.id}:`, fixError)
        } else {
          logDebug(`Successfully fixed missing Stripe customer ID for user ${user.id}`)
        }
      }
    } else {
      logDebug(`Verified Stripe customer ID ${updatedProfile.stripe_customer_id} for user ${user.id}`)
    }

    logDebug('Reached point immediately after Stripe customer ID verification/fixing logic.');

    // Create a checkout session
    logDebug(`[StripeDebug] PRE-STRIPE-CALL-BLOCK. Customer ID: ${customerId}, Price ID: ${priceId}, Plan ID: ${planId}`);

    let session;
    try {
      logDebug('[StripeDebug] ENTERING Stripe API call try block.');

      // Minimal parameters for testing (using existing variables)
      const minimalLineItems = [{ price: priceId, quantity: 1 }];

      const rawBaseUrl = (requestOrigin && allowedOrigins.includes(requestOrigin))
        ? requestOrigin
        : (Deno.env.get('SITE_URL') || 'https://resumeats.cv');
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');

      // Construct the success_url for Stripe
      const success_url_for_stripe = `${baseUrl}/#/return-from-stripe/{CHECKOUT_SESSION_ID}?redirect=${encodeURIComponent(actualSuccessPath)}&plan=${planId}`;

      // Construct the cancel_url for Stripe
      const cancel_url_for_stripe = `${baseUrl}/#${actualCancelPath.startsWith('/') ? actualCancelPath : `/${actualCancelPath}`}`;

      logDebug(`[StripeDebug] Constructed success_url_for_stripe: ${success_url_for_stripe}`);
      logDebug(`[StripeDebug] Constructed cancel_url_for_stripe: ${cancel_url_for_stripe}`);

      const sessionMetadata = {
        userId: user.id, // Ensure user is not null here
        planId: planId, // Ensure planId is defined and correct here
        stripeCustomerId: customerId, // This is good for cross-referencing
        // Add any other crucial identifiers if needed
      };
      logDebug('[StripeDebug] Metadata being sent to Stripe for checkout session creation:', JSON.stringify(sessionMetadata));
      logDebug(`[StripeDebug] planId value just before sending to Stripe metadata: "${planId}"`);


      session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: minimalLineItems,
        mode: 'subscription',
        success_url: success_url_for_stripe,
        cancel_url: cancel_url_for_stripe,
        metadata: sessionMetadata,
      });
      logDebug('[StripeDebug] stripe.checkout.sessions.create SUCCEEDED. Session ID:', session.id);
    } catch (stripeSessionError) {
      console.error('[StripeDebug] stripe.checkout.sessions.create FAILED. Raw Error:', stripeSessionError);
      // More detailed logging for the error object
      if (stripeSessionError instanceof Error) {
        console.error(`[StripeDebug] Error Name: ${stripeSessionError.name}`);
        console.error(`[StripeDebug] Error Message: ${stripeSessionError.message}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const se = stripeSessionError as any; // Type assertion for Stripe-specific fields
        if (se.type) {
          console.error(`[StripeDebug] Stripe Error Type: ${se.type}`);
          console.error(`[StripeDebug] Stripe Error Code: ${se.code}`);
          console.error(`[StripeDebug] Stripe Error Param: ${se.param}`);
          if (se.doc_url) console.error(`[StripeDebug] Stripe Doc URL: ${se.doc_url}`);
          if (se.raw) console.error('[StripeDebug] Stripe Raw Error Details:', JSON.stringify(se.raw));
        }
      } else {
        console.error('[StripeDebug] stripe.checkout.sessions.create FAILED. Error is not an Error instance. Stringified:', String(stripeSessionError));
      }
      throw stripeSessionError;
    }

    logDebug(`[StripeDebug] Post-Stripe-call. Session URL: ${session.url}`);
    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
      status: 200,
    })
  } catch (error: unknown) {
    console.error('create-checkout-session: Top-level error caught in function execution:', error);

    let errorMessage = 'Internal server error';
    let statusCode = 500;
    const errorDetails: Record<string, unknown> = { // Changed any to unknown
      message: 'An unexpected error occurred',
    };

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails.message = error.message;
      errorDetails.name = error.name;
      if (!isProd) {
        errorDetails.stack = error.stack;
      }

      // Attempt to get more details if it's a Stripe error
      // Stripe errors often have a 'type', 'code', 'param', 'statusCode'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stripeError = error as any; // Use 'any' for duck typing
      if (stripeError.type) {
        console.error('create-checkout-session: Stripe API Error Detected');
        console.error(`create-checkout-session: Stripe Error Type: ${stripeError.type}`);
        console.error(`create-checkout-session: Stripe Error Code: ${stripeError.code}`);
        console.error(`create-checkout-session: Stripe Error Param: ${stripeError.param}`);
        console.error(`create-checkout-session: Stripe Error Message: ${stripeError.message}`);
        if (stripeError.statusCode) {
          statusCode = stripeError.statusCode;
        }
        if (stripeError.doc_url) {
          console.error(`create-checkout-session: Stripe Doc URL: ${stripeError.doc_url}`);
        }
        if (stripeError.raw) {
          console.error('create-checkout-session: Stripe Raw Error:', JSON.stringify(stripeError.raw));
        }
        errorMessage = `Stripe Error: ${stripeError.message}`; // More specific error for the client
        errorDetails.stripe_error = {
          type: stripeError.type,
          code: stripeError.code,
          param: stripeError.param,
          message: stripeError.message,
          statusCode: stripeError.statusCode,
        };
      } else {
        console.error('create-checkout-session: Non-Stripe Error Details:', error);
      }
    } else {
      // If it's not an Error instance, log its string representation
      console.error('create-checkout-session: Error is not an instance of Error. Stringified:', String(error));
      errorDetails.rawError = String(error);
    }

    const responseBody = isProd
      ? { error: errorMessage }
      : { error: errorMessage, details: errorDetails };

    return new Response(
      JSON.stringify(responseBody),
      {
        headers: {
          'Content-Type': 'application/json',
          ...commonCorsHeaders,
        },
        status: statusCode, // Use Stripe's status code if available, otherwise 500
      }
    );
  }
})
