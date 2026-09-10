import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import Stripe from 'https://esm.sh/stripe@12.0.0';
import { projectStripeSubscription } from '../_shared/billingProjection.ts';
import { syncAiQuotaForSubscription } from '../_shared/aiQuotaBilling.ts';
import { syncPayPalSubscription } from '../_shared/paypal.ts';
import { readBoundedBodyText } from '../_shared/boundedBody.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('BILLING_RECONCILIATION_SECRET') || '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' }) : null;
const stripeEnvironment: 'live' | 'test' = stripeSecretKey.startsWith('sk_live_') ? 'live' : 'test';
const paypalEnvironmentConfig = (Deno.env.get('PAYPAL_ENVIRONMENT') || '').toLowerCase();
const paypalEnvironment: 'live' | 'test' = paypalEnvironmentConfig === 'sandbox' || paypalEnvironmentConfig === 'test'
  || (paypalEnvironmentConfig !== 'live' && (Deno.env.get('PAYPAL_API_BASE') || '').toLowerCase().includes('sandbox'))
  ? 'test'
  : 'live';
const maxBodyBytes = 16_384;
const maxBatch = 25;

type JsonRecord = Record<string, unknown>;
type Candidate = { user_id: string; subscription_id: string; observed_at?: string | null };

const asRecord = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);
const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const asString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const jsonResponse = (body: JsonRecord, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const stripePlan = (subscription: JsonRecord) => {
  const items = asRecord(subscription.items);
  const first = Array.isArray(items.data) ? asRecord(items.data[0]) : {};
  const price = asRecord(first.price);
  const recurring = asRecord(price.recurring);
  return recurring.interval === 'year' ? 'premium_yearly' : 'premium_monthly';
};

const reconcileStripe = async (
  client: ReturnType<typeof createClient>,
  candidate: Candidate,
  profile: JsonRecord,
  runId: string,
) => {
  if (!stripe) throw new Error('stripe_not_configured');
  const subscription = asRecord(await stripe.subscriptions.retrieve(candidate.subscription_id));
  const customerId = asString(subscription.customer);
  const expectedCustomerId = asString(profile.stripe_customer_id);
  if (!customerId || !expectedCustomerId || customerId !== expectedCustomerId) {
    throw new Error('stripe_subscription_ownership_mismatch');
  }
  const periodEnd = asNumber(subscription.current_period_end);
  if (!periodEnd || periodEnd <= 0) throw new Error('stripe_period_missing');
  const status = asString(subscription.status) || 'unknown';
  const active = ['active', 'trialing', 'past_due'].includes(status) && periodEnd * 1000 > Date.now();
  const observedAt = new Date().toISOString();
  const { error } = await client.rpc('apply_billing_entitlement', {
    p_user_id: candidate.user_id,
    p_provider: 'stripe',
    p_subscription_id: candidate.subscription_id,
    p_updates: {
      is_premium: active,
      premium_plan: stripePlan(subscription),
      premium_until: new Date(periodEnd * 1000).toISOString(),
      ai_limit: 30,
    },
    p_observed_at: observedAt,
  });
  if (error) throw new Error('stripe_entitlement_reconciliation_failed');
  await projectStripeSubscription(client, candidate.user_id, subscription, `reconcile:${runId}:${candidate.subscription_id}`);
  if (active) await syncAiQuotaForSubscription(client, candidate.user_id, subscription);
};

const reconcileProvider = async (
  client: ReturnType<typeof createClient>,
  provider: 'stripe' | 'paypal',
  environment: 'live' | 'test',
  workerId: string,
  limit: number,
) => {
  const { data: run, error: claimError } = await client.rpc('billing_claim_reconciliation_run', {
    p_provider: provider,
    p_environment: environment,
    p_worker_id: workerId,
    p_lease_seconds: 900,
  });
  if (claimError) throw new Error(`${provider}_reconciliation_queue_unavailable`);
  if (!run || typeof run.id !== 'string') return { provider, status: 'busy', processed: 0, failed: 0 };

  const runId = run.id;
  let processed = 0;
  let failed = 0;
  try {
    const { data: rows, error: rowsError } = await client
      .from('billing_entitlements')
      .select('user_id,subscription_id,observed_at')
      .eq('provider', provider)
      .order('observed_at', { ascending: true })
      .limit(limit);
    if (rowsError) throw new Error(`${provider}_entitlements_unavailable`);

    const candidates = ((rows || []) as Candidate[]).filter((row) => (
      typeof row.user_id === 'string' &&
      typeof row.subscription_id === 'string' &&
      (provider === 'stripe' ? row.subscription_id.startsWith('sub_') : /^I-[A-Z0-9]+$/.test(row.subscription_id))
    ));
    const userIds = [...new Set(candidates.map((row) => row.user_id))];
    const profiles = new Map<string, JsonRecord>();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await client.from('users').select('id,stripe_customer_id').in('id', userIds);
      if (usersError) throw new Error(`${provider}_users_unavailable`);
      for (const user of (users || []) as JsonRecord[]) {
        if (typeof user.id === 'string') profiles.set(user.id, user);
      }
    }

    for (const candidate of candidates) {
      try {
        if (provider === 'stripe') await reconcileStripe(client, candidate, profiles.get(candidate.user_id) || {}, runId);
        else await syncPayPalSubscription(client, candidate.subscription_id, candidate.user_id, `reconcile:${runId}:${candidate.subscription_id}`);
        processed += 1;
      } catch {
        // A provider timeout or ownership mismatch is a failed observation,
        // never a reason to revoke access locally. The next leased run retries.
        failed += 1;
      }
    }

    if (failed > 0) {
      await client.rpc('billing_fail_reconciliation_run', {
        p_run_id: runId,
        p_worker_id: workerId,
        p_error: 'one_or_more_provider_observations_failed',
        p_processed_count: processed,
        p_failed_count: failed,
      });
      return { provider, status: 'failed', processed, failed };
    }
    const { error: finishError } = await client.rpc('billing_finish_reconciliation_run', {
      p_run_id: runId,
      p_worker_id: workerId,
      p_processed_count: processed,
      p_failed_count: failed,
    });
    if (finishError) throw new Error(`${provider}_reconciliation_completion_failed`);
    return { provider, status: 'completed', processed, failed };
  } catch (error) {
    await client.rpc('billing_fail_reconciliation_run', {
      p_run_id: runId,
      p_worker_id: workerId,
      p_error: error instanceof Error ? error.message : 'billing_reconciliation_failed',
      p_processed_count: processed,
      p_failed_count: failed,
    });
    throw error;
  }
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-billing-reconciliation-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Billing reconciliation is not configured' }, 503);

  let limit = 25;
  let provider: 'stripe' | 'paypal' | 'all' = 'all';
  try {
    const raw = await readBoundedBodyText(req, maxBodyBytes);
    if (raw) {
      const body = JSON.parse(raw) as JsonRecord;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) limit = body.limit;
      if (body.provider === 'stripe' || body.provider === 'paypal' || body.provider === 'all') provider = body.provider;
      else if (typeof body.provider !== 'undefined') return jsonResponse({ error: 'Invalid provider' }, 422);
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  limit = Math.max(1, Math.min(maxBatch, limit));
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const workerId = `billing-reconcile:${crypto.randomUUID()}`;
  const selected = provider === 'all' ? ['stripe', 'paypal'] as const : [provider] as const;
  const results: JsonRecord[] = [];
  for (const item of selected) {
    const configured = item === 'stripe' ? Boolean(stripeSecretKey) : Boolean(Deno.env.get('PAYPAL_CLIENT_ID') && Deno.env.get('PAYPAL_CLIENT_SECRET'));
    if (!configured) {
      results.push({ provider: item, status: 'unconfigured', processed: 0, failed: 0 });
      continue;
    }
    try {
      results.push(await reconcileProvider(
        client,
        item,
        item === 'stripe' ? stripeEnvironment : paypalEnvironment,
        workerId,
        limit,
      ));
    } catch {
      results.push({ provider: item, status: 'failed', processed: 0, failed: 1 });
    }
  }
  const hasFailure = results.some((result) => result.status === 'failed');
  return jsonResponse({ ok: !hasFailure, results }, 200);
});
