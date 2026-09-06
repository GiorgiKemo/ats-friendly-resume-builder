// Follow this setup guide to integrate the Deno runtime into your Supabase project:
// https://supabase.com/docs/guides/functions/deno-runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0'
import { getAllowedOrigins, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts'

const isProd = Deno.env.get('NODE_ENV') !== 'development'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}
const logWarn = (...args: unknown[]) => {
  if (!isProd) console.warn(...args)
}
type ProviderErrorLike = {
  code?: unknown
  type?: unknown
  status?: unknown
  statusCode?: unknown
  param?: unknown
}

const summarizeError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return { kind: typeof error }
  }

  const candidate = error as Error & ProviderErrorLike
  const summary: Record<string, string | number> = {
    name: typeof candidate.name === 'string' ? candidate.name : 'UnknownError',
  }
  for (const key of ['code', 'type', 'param'] as const) {
    if (typeof candidate[key] === 'string' && candidate[key]) summary[key] = candidate[key] as string
  }
  for (const key of ['status', 'statusCode'] as const) {
    if (typeof candidate[key] === 'number' && Number.isFinite(candidate[key])) summary[key] = candidate[key] as number
  }
  return summary
}

const logError = (message: string, error?: unknown) => {
  if (typeof error === 'undefined') {
    console.error(message)
    return
  }
  console.error(message, summarizeError(error))
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
const stripeMode = stripeSecretKey?.startsWith('sk_live_') ? 'live' : 'test'
const normalizePremiumPlanId = (planId?: string | null) => {
  if (planId === 'premium_yearly') return 'premium_yearly'
  if (planId === 'premium_monthly' || planId === 'premium' || planId === 'pro') return 'premium_monthly'
  return 'premium_monthly'
}
const configuredPriceIdsByMode = stripeMode === 'live'
  ? [
    Deno.env.get('STRIPE_PRICE_PREMIUM_MONTHLY_LIVE'),
    Deno.env.get('STRIPE_PRICE_PREMIUM_YEARLY_LIVE'),
  ]
  : [
    Deno.env.get('STRIPE_PRICE_PREMIUM_MONTHLY_TEST'),
    Deno.env.get('STRIPE_PRICE_PREMIUM_YEARLY_TEST'),
  ]

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY')
if (!supabaseUrl) {
  console.error('CRITICAL: SUPABASE_URL is not set in environment variables.')
}
if (!supabaseServiceKey) {
  console.error('CRITICAL: SUPABASE_SECRET_KEY or legacy service key is not set in environment variables.')
}
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '') // Fallback to empty strings if still desired

serve(async (req) => {
  logDebug(`create-checkout-session: Function invoked. Method: ${req.method}`)

  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.get('Origin');
  if (isProd && requestOrigin && !isOriginAllowed(requestOrigin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const commonCorsHeaders = getCorsHeaders(requestOrigin);

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

    // Accommodate both naming conventions for success/cancel paths
    const rawSuccessPath = requestBody.clientSuccessPath || requestBody.successUrl;
    const rawCancelPath = requestBody.clientCancelPath || requestBody.cancelUrl;
    const { priceId, planId } = requestBody;
    let normalizedPlanId = normalizePremiumPlanId(planId);

    // Validate redirect paths to prevent open redirect attacks
    // Only allow relative paths starting with / (no protocol-relative //domain.com)
    const isValidPath = (p: string) => typeof p === 'string' && /^\/[^/]/.test(p);
    const actualSuccessPath = isValidPath(rawSuccessPath) ? rawSuccessPath : '/subscription/success';
    const actualCancelPath = isValidPath(rawCancelPath) ? rawCancelPath : '/pricing';

    // Validate priceId against server-side allowlist to prevent arbitrary price injection
    const allowedPriceIds = [
      ...configuredPriceIdsByMode,
      ...(Deno.env.get('ALLOWED_STRIPE_PRICE_IDS') || '')
        .split(',')
        .map((id: string) => id.trim())
        .filter(Boolean),
    ]
      .filter(Boolean)
      .filter((id, index, array) => array.indexOf(id) === index);
    const allowedPlanIds = ['premium', 'pro', 'premium_monthly', 'premium_yearly'];

    const isLocalOrigin = !requestOrigin || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(requestOrigin)
    if (allowedPriceIds.length === 0 && (isProd || stripeMode === 'live' || !isLocalOrigin)) {
      console.error('create-checkout-session: No allowed Stripe prices configured for production.');
      return new Response(
        JSON.stringify({ error: 'Stripe price configuration is missing' }),
        {
          headers: { 'Content-Type': 'application/json', ...commonCorsHeaders },
          status: 500,
        }
      )
    }

    const yearlyPriceIds = [
      Deno.env.get('STRIPE_PRICE_PREMIUM_YEARLY_LIVE'),
      Deno.env.get('STRIPE_PRICE_PREMIUM_YEARLY_TEST'),
    ].filter(Boolean)
    const monthlyPriceIds = [
      Deno.env.get('STRIPE_PRICE_PREMIUM_MONTHLY_LIVE'),
      Deno.env.get('STRIPE_PRICE_PREMIUM_MONTHLY_TEST'),
    ].filter(Boolean)
    if (yearlyPriceIds.includes(priceId)) normalizedPlanId = 'premium_yearly'
    if (monthlyPriceIds.includes(priceId)) normalizedPlanId = 'premium_monthly'

    if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
      console.error('create-checkout-session: Rejected invalid price selection.');
      return new Response(
        JSON.stringify({ error: 'Invalid price selected' }),
        {
          headers: { 'Content-Type': 'application/json', ...commonCorsHeaders },
          status: 400,
        }
      )
    }

    if (planId && !allowedPlanIds.includes(planId)) {
      console.error('create-checkout-session: Rejected invalid plan selection.');
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
      console.error(`create-checkout-session: Validation error - ${errorDetail}.`);
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
    logDebug('create-checkout-session: Supabase auth lookup completed.', summarizeError(userError));

    if (userError || !user) {
      logError('create-checkout-session: Authorization failed.', userError);
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
    logDebug('create-checkout-session: Profile lookup completed.', summarizeError(profileError));


    if (profileError) {
      logError('create-checkout-session: Failed to get user profile.', profileError);
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
      logDebug('Creating a new Stripe customer.')

      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        metadata: {
          supabaseUserId: user.id,
        },
      })

      customerId = customer.id
      logDebug('Created a new Stripe customer.')

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
        logError('Error updating the user with the Stripe customer ID.', updateError)
        // Continue anyway, as the webhook will also try to update this
      } else {
        logDebug('Updated the user with the Stripe customer ID.')
      }
    } else {
      logDebug('Using the existing Stripe customer.')

      // Verify the customer exists in Stripe AND IS NOT DELETED
      try {
        const retrievedCustomer = await stripe.customers.retrieve(customerId);
        if (retrievedCustomer.deleted) {
          logWarn('Stripe customer was marked as deleted; creating a replacement.');
          // Artificially throw an error to trigger the catch block for replacement customer creation.
          // Pass a custom error object or a modified StripeError-like object if needed for specific handling in the catch.
          const error = new Error('Stripe customer is deleted.');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error as any).code = 'resource_missing_deleted'; // Custom code to identify this scenario if needed
          throw error;
        }
        logDebug('Verified the Stripe customer exists and is active.');
      } catch (stripeError) {
        // This catch block will now also handle the 'Customer ... is deleted.' error thrown above.
        logError('Stripe customer verification failed; attempting a replacement.', stripeError);
        logDebug('Attempting to create a replacement Stripe customer.');
        try {
          const replacementCustomer = await stripe.customers.create({
            email: profile.email || user.email, // Ensure email is available
            metadata: {
              supabaseUserId: user.id,
              originalFailedCustomerId: customerId,
            },
          });

          const newCustomerId = replacementCustomer.id;
          logDebug('Successfully created a replacement Stripe customer.');
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
            logError('Error saving the replacement Stripe customer.', updateError);
            // Even if Supabase update fails, proceed with the new customerId for this session
          } else {
            logDebug('Successfully saved the replacement Stripe customer.');
          }
        } catch (replacementCreateError) {
          logError('CRITICAL_STRIPE_FAILURE: Failed to create a replacement Stripe customer.', replacementCreateError);
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
      logError('Error verifying the saved Stripe customer.', checkError || new Error('Stripe customer ID missing'))

      // Try one more time to update the user profile
      if (!checkError && !updatedProfile.stripe_customer_id) {
        logDebug('Attempting to repair a missing Stripe customer ID.')

        const { error: fixError } = await supabase
          .from('users')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id)

        if (fixError) {
          logError('Failed to repair the missing Stripe customer ID.', fixError)
        } else {
          logDebug('Successfully repaired the missing Stripe customer ID.')
        }
      }
    } else {
      logDebug('Verified the saved Stripe customer ID.')
    }

    logDebug('Reached point immediately after Stripe customer ID verification/fixing logic.');

    // Create a checkout session
    logDebug('[StripeDebug] Preparing the checkout session.');

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
      const success_url_for_stripe = `${baseUrl}/#/return-from-stripe/{CHECKOUT_SESSION_ID}?redirect=${encodeURIComponent(actualSuccessPath)}&plan=${normalizedPlanId}`;

      // Construct the cancel_url for Stripe
      const cancel_url_for_stripe = `${baseUrl}/#${actualCancelPath.startsWith('/') ? actualCancelPath : `/${actualCancelPath}`}`;

      logDebug('[StripeDebug] Constructed checkout redirect URLs.');

      const sessionMetadata = {
        userId: user.id, // Ensure user is not null here
        planId: normalizedPlanId,
        stripeCustomerId: customerId, // This is good for cross-referencing
        // Add any other crucial identifiers if needed
      };
      logDebug('[StripeDebug] Prepared checkout metadata.');


      session = await stripe.checkout.sessions.create({
        client_reference_id: user.id,
        customer: customerId,
        line_items: minimalLineItems,
        mode: 'subscription',
        success_url: success_url_for_stripe,
        cancel_url: cancel_url_for_stripe,
        metadata: sessionMetadata,
        subscription_data: {
          metadata: sessionMetadata,
        },
      });
      logDebug('[StripeDebug] Checkout session created successfully.');
    } catch (stripeSessionError) {
      logError('[StripeDebug] Checkout session creation failed.', stripeSessionError);
      throw stripeSessionError;
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        'Content-Type': 'application/json',
        ...commonCorsHeaders,
      },
      status: 200,
    })
  } catch (error: unknown) {
    logError('create-checkout-session: Top-level error caught in function execution.', error);

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
        logDebug('create-checkout-session: Stripe API error detected.', summarizeError(stripeError));
        if (stripeError.statusCode) {
          statusCode = stripeError.statusCode;
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
        logDebug('create-checkout-session: Non-Stripe error.', summarizeError(error));
      }
    } else {
      // If it's not an Error instance, log its string representation
      logError('create-checkout-session: Unknown error type.', error);
      errorDetails.rawError = String(error);
    }

    const responseBody = isProd
      ? { error: 'Could not start checkout. Please try again or contact support.' }
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
