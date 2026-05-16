// Stripe webhook handler for ATS-Friendly Resume Builder
// Handles subscription events and updates user status in the database

// These imports will work in Supabase Edge Functions (Deno runtime)
// TypeScript will show errors, but they can be safely ignored
// @ts-ignore - Deno-specific import
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore - Deno-specific import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore - Deno-specific import
import Stripe from 'https://esm.sh/stripe@12.0.0'

const isProd = Deno.env.get('NODE_ENV') === 'production'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}

// Type definitions for Stripe events and requests
interface StripeEventData {
  object: Record<string, unknown>;
}

interface StripeEventRequest {
  id: string | null;
  idempotency_key: string | null;
}

interface StripeEvent {
  id: string;
  object: string;
  api_version: string;
  created: number;
  data: StripeEventData;
  livemode: boolean;
  pending_webhooks: number;
  request: StripeEventRequest;
  type: string;
}

// Define a more specific type for checkout session
interface StripeCheckoutSession {
  id: string;
  object: string;
  mode: string;
  subscription: string;
  customer: string;
  customer_email?: string;
  customer_details?: {
    email?: string;
    name?: string;
  };
  metadata: Record<string, string>;
  [key: string]: unknown;
}

type StripeRequest = Request;

// Helper: add contact to Brevo list (fire-and-forget, never throws)
async function addBrevoContact(email: string, listId: number, firstName = '') {
  const brevoApiKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoApiKey || !email) return
  try {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: firstName },
        listIds: [listId],
        updateEnabled: true,
      }),
    })
  } catch (err) {
    console.warn('Brevo contact add failed:', err)
  }
}

// Get environment variables
// @ts-ignore - Deno namespace is available in Supabase Edge Functions
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
// @ts-ignore - Deno namespace is available in Supabase Edge Functions
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
// @ts-ignore - Deno namespace is available in Supabase Edge Functions
const supabaseUrl = Deno.env.get('API_URL') || Deno.env.get('SUPABASE_URL')
// @ts-ignore - Deno namespace is available in Supabase Edge Functions
const supabaseServiceKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Log environment variable status (not the values themselves)
logDebug('Environment variables status:')
logDebug(`- STRIPE_SECRET_KEY: ${stripeSecretKey ? 'Set' : 'Missing'}`)
logDebug(`- STRIPE_WEBHOOK_SECRET: ${stripeWebhookSecret ? 'Set' : 'Missing'}`)
logDebug(`- SUPABASE_URL: ${supabaseUrl ? 'Set' : 'Missing'}`)
logDebug(`- SUPABASE_SECRET_KEY/service key: ${supabaseServiceKey ? 'Set' : 'Missing'}`)

// Initialize Stripe with the secret key
const stripe = new Stripe(stripeSecretKey || '', {
  apiVersion: '2024-06-20', // Updated API version
})
const normalizePremiumPlanId = (planId?: string | null, interval?: string | null) => {
  if (planId === 'premium_yearly') return 'premium_yearly'
  if (planId === 'premium_monthly' || planId === 'premium' || planId === 'pro') return 'premium_monthly'
  if (interval === 'year') return 'premium_yearly'
  return 'premium_monthly'
}

const getSubscriptionInterval = (
  subscription: {
    items?: {
      data?: Array<{
        price?: {
          recurring?: {
            interval?: string | null;
          } | null;
        } | null;
      } | null>;
    } | null;
  } | null,
) =>
  subscription?.items?.data?.[0]?.price?.recurring?.interval || null

// Initialize Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '')

async function claimWebhookEvent(event: StripeEvent): Promise<boolean> {
  const { error } = await supabase
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
    })

  if (!error) return true

  const isDuplicate = error.code === '23505' || /duplicate|already exists/i.test(error.message || '')
  if (isDuplicate) {
    const { data: existing } = await supabase
      .from('stripe_webhook_events')
      .select('status')
      .eq('event_id', event.id)
      .maybeSingle()

    if (existing?.status === 'failed') {
      const { error: retryError } = await supabase
        .from('stripe_webhook_events')
        .update({
          status: 'processing',
          error: null,
          processed_at: null,
          event_type: event.type,
        })
        .eq('event_id', event.id)

      if (retryError) throw new Error(`Could not retry Stripe event ${event.id}: ${retryError.message}`)
      return true
    }

    return false
  }

  throw new Error(`Could not claim Stripe event ${event.id}: ${error.message}`)
}

async function markWebhookEventProcessed(eventId: string) {
  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({
      status: 'processed',
      error: null,
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)

  if (error) throw new Error(`Could not mark Stripe event ${eventId} processed: ${error.message}`)
}

async function markWebhookEventSkipped(eventId: string, reason: string) {
  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({
      status: 'skipped',
      error: reason.slice(0, 2000),
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)

  if (error) throw new Error(`Could not mark Stripe event ${eventId} skipped: ${error.message}`)
}

async function markWebhookEventFailed(eventId: string, errorMessage: string) {
  await supabase
    .from('stripe_webhook_events')
    .update({
      status: 'failed',
      error: errorMessage.slice(0, 2000),
    })
    .eq('event_id', eventId)
}

async function updateUserOrThrow(
  userId: string,
  updates: Record<string, unknown>,
  context: string,
) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`${context}: ${error.message}`)
  if (!data) throw new Error(`${context}: no user row updated for ${userId}`)
}

function throwMissingUser(context: string, identifier: unknown): never {
  throw new Error(`${context}: user not found for ${String(identifier || 'missing identifier')}`)
}

serve(async (req: StripeRequest) => {
  logDebug('[STRIPE WEBHOOK ENTRY] Request received. Method:', req.method);
  const requestHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });
  logDebug('[STRIPE WEBHOOK ENTRY] Request Headers:', JSON.stringify(requestHeaders));

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    logDebug('[STRIPE WEBHOOK ENTRY] Handling OPTIONS preflight.');
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
      },
      status: 204,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      status: 405,
    })
  }

  let receivedEvent: StripeEvent | null = null

  try {
    // Get the signature from the headers
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 400,
      })
    }

    // Get the raw body
    const body = await req.text()

    // Verify the webhook signature
    let event: StripeEvent
    try {
      if (!stripeWebhookSecret) {
        throw new Error('Webhook secret is not configured')
      }

      // Use Stripe.createSubtleCryptoProvider for Deno runtime compatibility
      const cryptoProvider = Stripe.createSubtleCryptoProvider();
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        stripeWebhookSecret,
        undefined, // Optional tolerance
        cryptoProvider
      ) as StripeEvent

      logDebug(`Received webhook event: ${event.type} (${event.id})`)

      // Durable idempotency check. Stripe retries can land on any Edge Function instance.
      receivedEvent = event
      const claimed = await claimWebhookEvent(event)
      if (!claimed) {
        logDebug(`Skipping already-processed event: ${event.id}`)
        return new Response(
          JSON.stringify({ received: true, success: true, skipped: true, reason: 'duplicate' }),
          { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, status: 200 }
        )
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${errorMessage}`)
      return new Response(
        JSON.stringify({
          error: 'Invalid signature',
          message: errorMessage,
          success: false
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          status: 400,
        }
      )
    }

    let skipReason: string | null = null

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as StripeCheckoutSession
        logDebug(`Checkout session completed: ${session.id}`)

        // Check if this is a subscription checkout
        if (session.mode === 'subscription' && session.subscription) {
          try {
            // First try to get userId and planId from metadata
            // Cast metadata to a record with string keys and values
            const metadata = session.metadata as Record<string, string> || {}
            const userId = metadata.userId || metadata.user_id // Check both formats
            const planId = metadata.planId || metadata.plan_id // Check both formats

            logDebug(`Session metadata:`, metadata)
            logDebug(`Session customer:`, session.customer)
            logDebug(`Session subscription:`, session.subscription)

            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(session.subscription)
            const customerId = typeof session.customer === 'string' ? session.customer : subscription.customer
            if (!['active', 'trialing'].includes(subscription.status)) {
              skipReason = `Checkout subscription ${session.subscription} is ${subscription.status}; entitlement not enabled yet`
              logDebug(skipReason)
              break
            }

            logDebug(`Determined customer ID: ${customerId}`)

            // If we have userId in metadata, use it directly
            if (userId && customerId) {
              logDebug(`Updating subscription for user ${userId} with customer ${customerId}`)

              // Safely get current_period_end with a fallback
              const currentPeriodEnd = typeof subscription.current_period_end === 'number'
                ? subscription.current_period_end
                : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // Default to 30 days from now

              const planName = normalizePremiumPlanId(planId, getSubscriptionInterval(subscription))

              logDebug(`Using plan name: ${planName}`)

              await updateUserOrThrow(userId, {
                is_premium: true,
                premium_plan: planName,
                stripe_customer_id: customerId,
                premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                premium_updated_at: new Date().toISOString(),
                ai_generations_limit: 30,
              }, `checkout.session.completed entitlement update for user ${userId}`)

              logDebug(`Successfully updated user ${userId} with customer ID ${customerId}`)
              // Add to Brevo "Premium Users" list (list ID 6) for premium email automation
              const premiumEmail = session.customer_email || session.customer_details?.email || ''
              const premiumName = session.customer_details?.name?.split(' ')[0] || ''
              addBrevoContact(premiumEmail, 6, premiumName)
            }
            // If no userId in metadata but we have customer email, try to find user by email
            else if (session.customer_email || (session.customer_details && session.customer_details.email)) {
              const customerEmail = session.customer_email || session.customer_details?.email
              logDebug(`Looking up user by email: ${customerEmail}`)

              // Get the user with this email
              const { data: userByEmail, error: emailError } = await supabase
                .from('users')
                .select('id, email, stripe_customer_id')
                .eq('email', customerEmail)
                .single()

              if (emailError || !userByEmail) {
                console.error('User not found for email:', customerEmail)

                // If we can't find by email, try to find by customer ID as a last resort
                if (customerId) {
                  logDebug(`Falling back to lookup by customer ID: ${customerId}`)

                  const { data: userByCustomerId, error: customerIdError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .single()

                  if (customerIdError || !userByCustomerId) {
                    throwMissingUser('checkout.session.completed fallback lookup', customerId)
                  }

                  const planName = normalizePremiumPlanId(undefined, getSubscriptionInterval(subscription))

                  logDebug(`Found user ${userByCustomerId.id} by customer ID, updating with plan ${planName}`)

                  // Update the user's subscription status
                  const currentPeriodEnd = typeof subscription.current_period_end === 'number'
                    ? subscription.current_period_end
                    : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

                  await updateUserOrThrow(userByCustomerId.id, {
                    is_premium: true,
                    premium_plan: planName,
                    premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                    premium_updated_at: new Date().toISOString(),
                    ai_generations_limit: 30,
                    ai_generations_used: 0
                  }, `checkout.session.completed fallback entitlement update for user ${userByCustomerId.id}`)
                } else {
                  throwMissingUser('checkout.session.completed email lookup', customerEmail)
                }
                break
              }

              const planName = normalizePremiumPlanId(planId, getSubscriptionInterval(subscription))

              logDebug(`Found user ${userByEmail.id} by email, updating with plan ${planName}`)

              // Safely get current_period_end with a fallback
              const currentPeriodEnd = typeof subscription.current_period_end === 'number'
                ? subscription.current_period_end
                : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // Default to 30 days from now

              await updateUserOrThrow(userByEmail.id, {
                is_premium: true,
                premium_plan: planName,
                stripe_customer_id: customerId,
                premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                premium_updated_at: new Date().toISOString(),
                ai_generations_limit: 30,
              }, `checkout.session.completed email entitlement update for user ${userByEmail.id}`)
            }
            // If no userId in metadata or email, try to find user by customer ID
            else if (customerId) {
              logDebug(`Looking up user by customer ID: ${customerId}`)

              // Get the user with this Stripe customer ID
              const { data: user, error } = await supabase
                .from('users')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .single()

              if (error || !user) {
                throwMissingUser('checkout.session.completed customer lookup', customerId)
              }

              const planName = normalizePremiumPlanId(planId, getSubscriptionInterval(subscription))

              logDebug(`Updating subscription for user ${user.id} with plan ${planName}`)

              // Safely get current_period_end with a fallback
              const currentPeriodEnd = typeof subscription.current_period_end === 'number'
                ? subscription.current_period_end
                : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // Default to 30 days from now

              await updateUserOrThrow(user.id, {
                is_premium: true,
                premium_plan: planName,
                premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                premium_updated_at: new Date().toISOString(),
                ai_generations_limit: 30,
              }, `checkout.session.completed customer entitlement update for user ${user.id}`)
            } else {
              throw new Error(`checkout.session.completed could not determine user for session ${session.id}`)
            }
          } catch (err) {
            console.error('Error processing checkout.session.completed event:', err)
            throw err
          }
        } else {
          skipReason = `checkout.session.completed ${session.id} was not a subscription checkout`
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer

        // Get the user with this Stripe customer ID
        const { data: user, error } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (error || !user) {
          throwMissingUser('customer.subscription.updated', customerId)
        }

        // Update the user's subscription status based on the subscription status
        // Include 'past_due' as still-premium to give grace period for payment retry
        const isActive = ['active', 'trialing', 'past_due'].includes(String(subscription.status || ''))

        // Cast metadata to a record with string keys and values
        const metadata = subscription.metadata as Record<string, string> || {}

        // Safely get current_period_end with a fallback
        const currentPeriodEnd = typeof subscription.current_period_end === 'number'
          ? subscription.current_period_end
          : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // Default to 30 days from now

        // Define the updates object with proper typing
        const updates: {
          is_premium: boolean;
          premium_updated_at: string;
          premium_until?: string;
          ai_generations_limit?: number;
          ai_generations_used?: number;
        } = {
          is_premium: isActive,
          premium_updated_at: new Date().toISOString(),
        }

        // If active, update the premium_until date
        if (isActive) {
          updates.premium_until = new Date(currentPeriodEnd * 1000).toISOString()

          // If this is a new subscription or reactivation, reset the AI generation counters
          if (subscription.status === 'active' && metadata.reset_counters === 'true') {
            updates.ai_generations_limit = 30
            updates.ai_generations_used = 0
          }
        }

        await updateUserOrThrow(user.id, updates, `customer.subscription.updated entitlement update for user ${user.id}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer

        // Get the user with this Stripe customer ID
        const { data: user, error } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (error || !user) {
          throwMissingUser('customer.subscription.deleted', customerId)
        }

        await updateUserOrThrow(user.id, {
          is_premium: false,
          premium_updated_at: new Date().toISOString(),
        }, `customer.subscription.deleted entitlement update for user ${user.id}`)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object

        // Only process subscription invoices
        if (invoice.subscription && invoice.customer) {
          logDebug(`Payment succeeded for invoice ${invoice.id}, subscription ${invoice.subscription}`)

          try {
            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
            if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
              skipReason = `Invoice subscription ${invoice.subscription} is ${subscription.status}; entitlement not enabled`
              logDebug(skipReason)
              break
            }

            // Get the user with this Stripe customer ID
            const { data: user, error } = await supabase
              .from('users')
              .select('id')
              .eq('stripe_customer_id', invoice.customer)
              .single()

            if (error || !user) {
              throwMissingUser('invoice.payment_succeeded', invoice.customer)
            }

            // Safely get current_period_end with a fallback
            const currentPeriodEnd = typeof subscription.current_period_end === 'number'
              ? subscription.current_period_end
              : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // Default to 30 days from now

            await updateUserOrThrow(user.id, {
              is_premium: true,
              premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
              premium_updated_at: new Date().toISOString(),
            }, `invoice.payment_succeeded entitlement update for user ${user.id}`)

            logDebug(`Updated premium status for user ${user.id}`)
          } catch (err) {
            console.error('Error processing payment_succeeded event:', err)
            throw err
          }
        } else {
          skipReason = 'invoice.payment_succeeded did not include a subscription and customer'
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object

        if (invoice.customer) {
          skipReason = `Payment failed for invoice ${invoice.id}, customer ${invoice.customer}; entitlement unchanged`
          logDebug(skipReason)

          // We don't immediately downgrade the user on payment failure
          // Stripe will retry the payment and eventually cancel the subscription if needed
          // Just log the failure for now
        } else {
          skipReason = `Payment failed for invoice ${invoice.id}; no customer on event`
        }
        break
      }

      default:
        skipReason = `Unhandled event type: ${event.type}`
        logDebug(skipReason)
    }

    if (skipReason) {
      await markWebhookEventSkipped(event.id, skipReason)
    } else {
      await markWebhookEventProcessed(event.id)
    }

    // Return a success response
    return new Response(
      JSON.stringify({
        received: true,
        success: true,
        skipped: Boolean(skipReason),
        reason: skipReason,
        event_type: event.type,
        event_id: event.id,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 200,
      }
    )
  } catch (error: unknown) {
    // Log the full error for debugging
    console.error('Error handling webhook:', error)
    if (receivedEvent?.id) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      await markWebhookEventFailed(receivedEvent.id, message).catch((markError) => {
        console.error('Could not mark Stripe webhook event failed:', markError)
      })
    }

    // Create a sanitized error response
    const errorResponse = {
      error: error instanceof Error ? error.message : 'Internal server error',
      success: false,
      timestamp: new Date().toISOString(),
      // Include stack trace in non-production environments
      // @ts-ignore - Deno namespace is available in Supabase Edge Functions
      ...(Deno.env.get('NODE_ENV') !== 'production' &&
        error instanceof Error && { stack: error.stack })
    }

    return new Response(
      JSON.stringify(errorResponse),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 500,
      }
    )
  }
})
