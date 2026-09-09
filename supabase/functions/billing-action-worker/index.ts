import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import Stripe from 'https://esm.sh/stripe@12.0.0';
import { paypalRequest } from '../_shared/paypal.ts';

type JsonRecord = Record<string, unknown>;

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('BILLING_ACTION_WORKER_SECRET') || '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' }) : null;
const stripeEnvironment: 'live' | 'test' = stripeSecretKey.startsWith('sk_live_') ? 'live' : 'test';
const paypalEnvironmentConfig = (Deno.env.get('PAYPAL_ENVIRONMENT') || '').toLowerCase();
const paypalEnvironment: 'live' | 'test' = paypalEnvironmentConfig === 'sandbox' || paypalEnvironmentConfig === 'test'
  || (paypalEnvironmentConfig !== 'live' && (Deno.env.get('PAYPAL_API_BASE') || '').toLowerCase().includes('sandbox'))
  ? 'test'
  : 'live';
const maxBodyBytes = 16_384;
const maxBatch = 10;

const asRecord = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);
const asString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const jsonResponse = (body: JsonRecord, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const stableRequestId = (intentId: string) => `resumeats-billing-${intentId}`;

const recordAttempt = async (
  client: ReturnType<typeof createClient>,
  intentId: string,
  workerId: string,
  status: string,
  providerRequestId: string | null,
  providerOperationId: string | null,
  responseSummary: JsonRecord,
  errorCode: string | null = null,
) => {
  const { error } = await client.rpc('billing_record_action_attempt', {
    p_intent_id: intentId,
    p_worker_id: workerId,
    p_status: status,
    p_provider_request_id: providerRequestId,
    p_provider_operation_id: providerOperationId,
    p_response_summary: responseSummary,
    p_error_code: errorCode,
    p_error_message: errorCode ? 'Provider action requires reconciliation.' : null,
  });
  if (error) throw new Error('billing_action_receipt_failed');
};

const stripeAction = async (intent: JsonRecord, requestId: string) => {
  if (!stripe || stripeEnvironment !== intent.environment) throw new Error('provider_not_configured_for_environment');
  const operation = asString(intent.operation);
  const subscriptionId = asString(intent.subscription_id);
  if (!operation) throw new Error('invalid_billing_operation');

  if (operation === 'refund') {
    const paymentId = asString(intent.provider_payment_id);
    const amount = Number(intent.amount_minor);
    if (!paymentId || !Number.isSafeInteger(amount) || amount < 1) throw new Error('refund_reference_or_amount_missing');
    const refund = asRecord(await stripe.refunds.create({
      payment_intent: paymentId,
      amount,
      reason: 'requested_by_customer',
    }, { idempotencyKey: requestId }));
    return { providerOperationId: asString(refund.id), summary: { provider: 'stripe', operation, status: asString(refund.status) || 'unknown', amountMinor: amount, currency: asString(refund.currency) || intent.currency || null, awaitingWebhook: true } };
  }

  if (!subscriptionId) throw new Error('subscription_reference_missing');
  const subscription = asRecord(await stripe.subscriptions.retrieve(subscriptionId));
  if (operation === 'cancel') {
    if (intent.cancel_at_period_end !== true) throw new Error('immediate_cancel_requires_explicit_policy');
    const updated = asRecord(await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true }, { idempotencyKey: requestId }));
    return { providerOperationId: asString(updated.id), summary: { provider: 'stripe', operation, status: asString(updated.status) || 'unknown', cancelAtPeriodEnd: updated.cancel_at_period_end === true, awaitingWebhook: true } };
  }
  if (operation === 'resume') {
    if (subscription.status === 'canceled') throw new Error('canceled_subscription_cannot_resume');
    const updated = asRecord(await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false }, { idempotencyKey: requestId }));
    return { providerOperationId: asString(updated.id), summary: { provider: 'stripe', operation, status: asString(updated.status) || 'unknown', cancelAtPeriodEnd: updated.cancel_at_period_end === true, awaitingWebhook: true } };
  }
  throw new Error('stripe_plan_change_requires_reviewed_preview_contract');
};

const paypalAction = async (intent: JsonRecord, requestId: string) => {
  if (!Deno.env.get('PAYPAL_CLIENT_ID') || !Deno.env.get('PAYPAL_CLIENT_SECRET') || paypalEnvironment !== intent.environment) {
    throw new Error('provider_not_configured_for_environment');
  }
  const operation = asString(intent.operation);
  const subscriptionId = asString(intent.subscription_id);
  if (!operation) throw new Error('invalid_billing_operation');
  if (operation === 'refund') {
    const captureId = asString(intent.provider_payment_id);
    const amount = Number(intent.amount_minor);
    const currency = asString(intent.currency);
    if (!captureId || !Number.isSafeInteger(amount) || amount < 1 || !currency) throw new Error('refund_reference_or_amount_missing');
    const refund = asRecord(await paypalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, 'POST', {
      amount: { value: (amount / 100).toFixed(2), currency_code: currency.toUpperCase() },
      note_to_payer: 'Refund processed by ResumeATS support',
    }, requestId));
    return { providerOperationId: asString(refund.id), summary: { provider: 'paypal', operation, status: asString(refund.status) || 'unknown', amountMinor: amount, currency, awaitingWebhook: true } };
  }
  if (!subscriptionId) throw new Error('subscription_reference_missing');
  const subscription = asRecord(await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`));
  if (operation === 'cancel') {
    await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, 'POST', { reason: String(intent.reason || 'Canceled by support').slice(0, 128) }, requestId);
    return { providerOperationId: subscriptionId, summary: { provider: 'paypal', operation, status: 'CANCELLED_REQUESTED', awaitingWebhook: true } };
  }
  if (operation === 'resume') {
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') throw new Error('canceled_subscription_cannot_resume');
    if (subscription.status === 'ACTIVE') return { providerOperationId: subscriptionId, summary: { provider: 'paypal', operation, status: 'ACTIVE', noOp: true, awaitingWebhook: false } };
    await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/activate`, 'POST', { reason: String(intent.reason || 'Resumed by support').slice(0, 128) }, requestId);
    return { providerOperationId: subscriptionId, summary: { provider: 'paypal', operation, status: 'ACTIVE_REQUESTED', awaitingWebhook: true } };
  }
  if (operation === 'plan_change') {
    const targetPlanId = asString(intent.target_price_id);
    if (!targetPlanId) throw new Error('paypal_plan_id_missing');
    const revised = asRecord(await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/revise`, 'POST', { plan_id: targetPlanId }, requestId));
    const approvalUrl = Array.isArray(revised.links)
      ? asString((revised.links as unknown[]).map(asRecord).find((link) => link.rel === 'approve')?.href)
      : null;
    if (!approvalUrl) throw new Error('paypal_customer_approval_link_missing');
    return { providerOperationId: subscriptionId, summary: { provider: 'paypal', operation, status: 'AWAITING_CUSTOMER_APPROVAL', approvalUrl, awaitingWebhook: true } };
  }
  throw new Error('unsupported_billing_operation');
};

const executeIntent = async (client: ReturnType<typeof createClient>, intent: JsonRecord, workerId: string) => {
  const intentId = asString(intent.id);
  const provider = asString(intent.provider);
  if (!intentId || !provider) return { status: 'failed', error: 'invalid_billing_intent' };
  const requestId = asString(intent.provider_request_id) || stableRequestId(intentId);
  try {
    const result = provider === 'stripe' ? await stripeAction(intent, requestId) : await paypalAction(intent, requestId);
    const status = result.summary.status === 'AWAITING_CUSTOMER_APPROVAL' ? 'awaiting_customer_approval' : 'succeeded';
    await recordAttempt(client, intentId, workerId, status, requestId, result.providerOperationId, result.summary);
    return { status, intentId };
  } catch (error) {
    const errorCode = error instanceof Error && error.message
      ? error.message
      : 'provider_call_uncertain';
    const unsupported = [
      'provider_not_configured_for_environment',
      'immediate_cancel_requires_explicit_policy',
      'canceled_subscription_cannot_resume',
      'stripe_plan_change_requires_reviewed_preview_contract',
      'paypal_customer_approval_link_missing',
      'paypal_plan_id_missing',
      'refund_reference_or_amount_missing',
      'unsupported_billing_operation',
    ].includes(errorCode);
    const status = unsupported ? 'unsupported' : 'pending_reconciliation';
    await recordAttempt(client, intentId, workerId, status, requestId, null, { provider, operation: intent.operation, outcome: unsupported ? 'unsupported' : 'provider_call_uncertain' }, unsupported ? errorCode : 'provider_call_uncertain');
    return { status, intentId };
  }
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-billing-action-secret') !== workerSecret) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Billing action worker is not configured' }, 503);

  let limit = maxBatch;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) return jsonResponse({ error: 'Request too large' }, 413);
    if (raw) {
      const body = JSON.parse(raw) as JsonRecord;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) limit = Math.max(1, Math.min(maxBatch, body.limit));
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const workerId = `billing-action:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await client.rpc('billing_claim_action_intents', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 900,
  });
  if (claimError) return jsonResponse({ error: 'Billing action queue is unavailable' }, 503);
  const intents = Array.isArray(claimed) ? claimed as JsonRecord[] : [];
  const results = [];
  for (const intent of intents) results.push(await executeIntent(client, intent, workerId));
  return jsonResponse({ ok: results.every((item) => item.status === 'succeeded' || item.status === 'awaiting_customer_approval'), workerId, results });
});
