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
import { syncAiQuotaForSubscription } from '../_shared/aiQuotaBilling.ts'

const isProd = Deno.env.get('NODE_ENV') !== 'development'
const logDebug = (...args: unknown[]) => {
  if (!isProd) console.log(...args)
}
const summarizeError = (error: unknown) => {
  if (!error || typeof error !== 'object') return { kind: typeof error }
  const candidate = error as {
    name?: unknown
    code?: unknown
    type?: unknown
    status?: unknown
    statusCode?: unknown
  }
  const summary: Record<string, string | number> = {
    name: typeof candidate.name === 'string' ? candidate.name : 'UnknownError',
  }
  for (const key of ['code', 'type'] as const) {
    if (typeof candidate[key] === 'string' && candidate[key]) summary[key] = candidate[key] as string
  }
  for (const key of ['status', 'statusCode'] as const) {
    if (typeof candidate[key] === 'number' && Number.isFinite(candidate[key])) summary[key] = candidate[key] as number
  }
  return summary
}
const logError = (message: string, error?: unknown) => {
  if (typeof error === 'undefined') console.error(message)
  else console.error(message, summarizeError(error))
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
    logError('Brevo contact add failed.', err)
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

const getSubscriptionPeriodEnd = (subscription: { current_period_end?: unknown }) => {
  const periodEnd = subscription?.current_period_end;
  if (typeof periodEnd !== 'number' || !Number.isFinite(periodEnd) || periodEnd <= 0) {
    throw new Error('Stripe subscription period is missing');
  }
  return periodEnd;
}

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
    const { data: existing, error: lookupError } = await supabase
      .from('stripe_webhook_events')
      .select('status,created_at')
      .eq('event_id', event.id)
      .maybeSingle()

    if (lookupError || !existing) throw new Error(`Could not read Stripe event ${event.id}`)
    if (existing.status === 'processed' || existing.status === 'skipped') return false

    // Failed events can retry; abandoned processing claims expire after fifteen
    // minutes. A fresh in-flight claim must return a retryable failure, not a
    // success acknowledgement that could permanently lose the event.
    const claimStartedAt = Date.parse(existing.created_at)
    const abandoned = existing.status === 'processing' &&
      Number.isFinite(claimStartedAt) && Date.now() - claimStartedAt > 15 * 60 * 1000
    if (existing.status === 'failed' || abandoned) {
      const { data: reclaimed, error: retryError } = await supabase
        .from('stripe_webhook_events')
        .update({
          status: 'processing',
          error: null,
          processed_at: null,
          event_type: event.type,
          created_at: new Date().toISOString(),
        })
        .eq('event_id', event.id)
        .eq('status', existing.status)
        .eq('created_at', existing.created_at)
        .select('event_id')
        .maybeSingle()

      if (retryError) throw new Error(`Could not retry Stripe event ${event.id}: ${retryError.message}`)
      if (!reclaimed) throw new Error(`Stripe event ${event.id} is already being processed; retry later`)
      return true
    }

    throw new Error(`Stripe event ${event.id} is already being processed; retry later`)
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
  let eventClaimed = false

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

      logDebug('Received a webhook event.', { type: event.type })

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logError('Webhook signature verification failed.', err)
      return new Response(
        JSON.stringify({
          error: 'Invalid signature',
          ...(isProd ? {} : { message: errorMessage }),
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

    // Claim failures are operational failures, not invalid signatures. Only the
    // worker that owns a claim may transition that event to failed below.
    receivedEvent = event
    eventClaimed = await claimWebhookEvent(event)
    if (!eventClaimed) {
      return new Response(
        JSON.stringify({ received: true, success: true, skipped: true, reason: 'duplicate' }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, status: 200 }
      )
    }

    let skipReason: string | null = null

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as StripeCheckoutSession
        logDebug('Checkout session completed.')

        // Check if this is a subscription checkout
        if (session.mode === 'subscription' && session.subscription) {
          try {
            // First try to get userId and planId from metadata
            // Cast metadata to a record with string keys and values
            const metadata = session.metadata as Record<string, string> || {}
            const userId = metadata.userId || metadata.user_id // Check both formats
            const planId = metadata.planId || metadata.plan_id // Check both formats

            logDebug('Checkout session metadata and subscription were loaded.')

            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(session.subscription)
            const customerId = typeof session.customer === 'string' ? session.customer : subscription.customer
            if (!['active', 'trialing'].includes(subscription.status)) {
              skipReason = `Checkout subscription ${session.subscription} is ${subscription.status}; entitlement not enabled yet`
              logDebug(skipReason)
              break
            }

            logDebug('Determined the Stripe customer.')

            // If we have userId in metadata, use it directly
            if (userId && customerId) {
              logDebug('Updating the subscription from checkout metadata.')

              const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

              const planName = normalizePremiumPlanId(planId, getSubscriptionInterval(subscription))

              logDebug('Resolved the subscription plan.')

              await updateUserOrThrow(userId, {
                is_premium: true,
                premium_plan: planName,
                stripe_customer_id: customerId,
                premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                premium_updated_at: new Date().toISOString(),
                ai_generations_limit: 30,
              }, `checkout.session.completed entitlement update for user ${userId}`)
              await syncAiQuotaForSubscription(supabase, userId, subscription)

              logDebug('Successfully updated the subscription entitlement.')
              // Add to Brevo "Premium Users" list (list ID 6) for premium email automation
              const premiumEmail = session.customer_email || session.customer_details?.email || ''
              const premiumName = session.customer_details?.name?.split(' ')[0] || ''
              addBrevoContact(premiumEmail, 6, premiumName)
            }
            // If no userId in metadata but we have customer email, try to find user by email
            else if (session.customer_email || (session.customer_details && session.customer_details.email)) {
              const customerEmail = session.customer_email || session.customer_details?.email
              logDebug('Looking up a user from the checkout email fallback.')

              // Get the user with this email
              const { data: userByEmail, error: emailError } = await supabase
                .from('users')
                .select('id, email, stripe_customer_id')
                .eq('email', customerEmail)
                .single()

              if (emailError || !userByEmail) {
                console.error('User not found for checkout email fallback.')

                // If we can't find by email, try to find by customer ID as a last resort
                if (customerId) {
                  logDebug('Falling back to the Stripe customer lookup.')

                  const { data: userByCustomerId, error: customerIdError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .single()

                  if (customerIdError || !userByCustomerId) {
                    throwMissingUser('checkout.session.completed fallback lookup', customerId)
                  }

                  const planName = normalizePremiumPlanId(undefined, getSubscriptionInterval(subscription))

                  logDebug('Found the user by Stripe customer and resolved the plan.')

                  // Update the user's subscription status
                  const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

                  await updateUserOrThrow(userByCustomerId.id, {
                    is_premium: true,
                    premium_plan: planName,
                    premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                    premium_updated_at: new Date().toISOString(),
                    ai_generations_limit: 30,
                  }, `checkout.session.completed fallback entitlement update for user ${userByCustomerId.id}`)
                  await syncAiQuotaForSubscription(supabase, userByCustomerId.id, subscription)
                } else {
                  throwMissingUser('checkout.session.completed email lookup', customerEmail)
                }
                break
              }

              const planName = normalizePremiumPlanId(planId, getSubscriptionInterval(subscription))

              logDebug('Found the user by checkout email and resolved the plan.')

              const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

              await updateUserOrThrow(userByEmail.id, {
                is_premium: true,
                premium_plan: planName,
                stripe_customer_id: customerId,
                premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                premium_updated_at: new Date().toISOString(),
                ai_generations_limit: 30,
              }, `checkout.session.completed email entitlement update for user ${userByEmail.id}`)
              await syncAiQuotaForSubscription(supabase, userByEmail.id, subscription)
            }
            // If no userId in metadata or email, try to find user by customer ID
            else if (customerId) {
              logDebug('Looking up a user from the Stripe customer fallback.')

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

              logDebug('Updating the subscription from the Stripe customer fallback.')

              const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

              await updateUserOrThrow(user.id, {
                is_premium: true,
                premium_plan: planName,
                premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
                premium_updated_at: new Date().toISOString(),
                ai_generations_limit: 30,
              }, `checkout.session.completed customer entitlement update for user ${user.id}`)
              await syncAiQuotaForSubscription(supabase, user.id, subscription)
            } else {
              throw new Error(`checkout.session.completed could not determine user for session ${session.id}`)
            }
          } catch (err) {
            logError('Error processing checkout.session.completed event.', err)
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

        const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

        // Define the updates object with proper typing
        const updates: {
          is_premium: boolean;
          premium_updated_at: string;
          premium_until?: string;
        } = {
          is_premium: isActive,
          premium_updated_at: new Date().toISOString(),
        }

        // If active, update the premium_until date
        if (isActive) {
          updates.premium_until = new Date(currentPeriodEnd * 1000).toISOString()

        }

        await updateUserOrThrow(user.id, updates, `customer.subscription.updated entitlement update for user ${user.id}`)
        if (isActive) await syncAiQuotaForSubscription(supabase, user.id, subscription)
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
          logDebug('Payment succeeded for a subscription invoice.')

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

            const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

            await updateUserOrThrow(user.id, {
              is_premium: true,
              premium_until: new Date(currentPeriodEnd * 1000).toISOString(),
              premium_updated_at: new Date().toISOString(),
            }, `invoice.payment_succeeded entitlement update for user ${user.id}`)
            await syncAiQuotaForSubscription(supabase, user.id, subscription)

            logDebug('Updated premium status for the invoice customer.')
          } catch (err) {
            logError('Error processing payment_succeeded event.', err)
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
    logError('Error handling webhook.', error)
    if (eventClaimed && receivedEvent?.id) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      await markWebhookEventFailed(receivedEvent.id, isProd ? 'Webhook processing failed' : message).catch((markError) => {
        logError('Could not mark Stripe webhook event failed.', markError)
      })
    }

    // Create a sanitized error response
    const errorResponse = {
      error: isProd ? 'Webhook processing failed' : (error instanceof Error ? error.message : 'Internal server error'),
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
