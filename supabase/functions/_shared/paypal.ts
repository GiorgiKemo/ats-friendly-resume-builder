import { recordServerAnalyticsEvent } from './analytics.ts';
import { projectBillingTransaction, projectPayPalSubscription } from './billingProjection.ts';

type JsonRecord = Record<string, unknown>;
type DbError = { message?: string; code?: string };
type DbResult<T> = { data: T | null; error: DbError | null };
type BillingQuery = {
  select: (columns?: string) => BillingQuery;
  eq: (column: string, value: unknown) => BillingQuery;
  maybeSingle: () => Promise<DbResult<JsonRecord>>;
  insert: (values: JsonRecord) => Promise<{ error: DbError | null }>;
};
type BillingDatabase = {
  from: (table: string) => BillingQuery;
  rpc: (name: string, args: JsonRecord) => Promise<{ error: DbError | null }>;
};
type BillingPeriod = { start: string; end: string };

const api = Deno.env.get('PAYPAL_API_BASE') || 'https://api-m.paypal.com';
const maxTransactionPages = 12;

const asRecord = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

export const paypalPlans = () => ({
  premium_monthly: { id: Deno.env.get('PAYPAL_PLAN_MONTHLY'), amount: '9.99', months: 1 },
  premium_yearly: { id: Deno.env.get('PAYPAL_PLAN_YEARLY'), amount: '99.99', months: 12 },
});
export async function paypalRequest(path: string, method = 'GET', body?: unknown, requestId?: string): Promise<unknown> {
  const client = Deno.env.get('PAYPAL_CLIENT_ID');
  const secret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!client || !secret) throw new Error('PayPal credentials are not configured');
  const tokenResponse = await fetch(`${api}/v1/oauth2/token`, {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${client}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15000),
  });
  if (!tokenResponse.ok) throw new Error(`PayPal authentication failed (${tokenResponse.status})`);
  const token = asRecord(await tokenResponse.json());
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('PayPal authentication returned no access token');
  const response = await fetch(`${api}${path}`, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = asRecord(await response.json().catch(() => ({})));
    throw new Error(`PayPal request failed (${response.status}, ${typeof error.name === 'string' ? error.name : 'unknown'})`);
  }
  return response.status === 204 ? {} : response.json();
}

export function paidPeriod(transaction: unknown, months: number, amount: string, now = Date.now()): BillingPeriod | null {
  const payment = asRecord(transaction);
  const breakdown = asRecord(payment.amount_with_breakdown);
  const grossAmount = asRecord(breakdown.gross_amount);
  if (payment.status !== 'COMPLETED' || grossAmount.currency_code !== 'USD'
    || Number(grossAmount.value) !== Number(amount)) return null;
  const start = new Date(typeof payment.time === 'string' ? payment.time : '');
  if (!Number.isFinite(start.getTime()) || start.getTime() > now) return null;
  // Calendar billing periods, including month-end and leap-year clamping.
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end.getTime() > now ? { start: start.toISOString(), end: end.toISOString() } : null;
}

const listSubscriptionTransactions = async (subscriptionId: string, now: number) => {
  const query = new URLSearchParams({
    start_time: new Date(now - 370 * 86400000).toISOString(),
    end_time: new Date(now).toISOString(),
    page_size: '100',
  });
  const transactions: unknown[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    query.set('page', String(page));
    const result = asRecord(await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?${query}`));
    const reportedPages = Number(result.total_pages);
    if (Number.isSafeInteger(reportedPages) && reportedPages > maxTransactionPages) {
      throw new Error('PayPal transaction history exceeds reconciliation bound');
    }
    totalPages = Number.isSafeInteger(reportedPages) && reportedPages > 0 ? reportedPages : 1;
    if (Array.isArray(result.transactions)) transactions.push(...result.transactions);
  }
  return transactions;
};

export async function syncPayPalSubscription(db: BillingDatabase, subscriptionId: string, expectedUser?: string, sourceEventId?: string) {
  const observedAt = new Date().toISOString();
  const { data: checkout, error } = await db.from('paypal_checkouts').select('user_id,plan,request_id')
    .eq('subscription_id', subscriptionId).maybeSingle();
  if (error) throw new Error('Checkout lookup failed');
  if (!checkout || typeof checkout.user_id !== 'string' || !checkout.user_id || (expectedUser && checkout.user_id !== expectedUser)) {
    throw new Error('PayPal checkout ownership mismatch');
  }
  const subscription = asRecord(await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`));
  const planName = typeof checkout.plan === 'string' ? checkout.plan : '';
  const plan = paypalPlans()[planName as keyof ReturnType<typeof paypalPlans>];
  if (!plan?.id || subscription.plan_id !== plan.id || subscription.custom_id !== checkout.request_id || subscription.plan_overridden === true) {
    throw new Error('PayPal subscription details mismatch');
  }
  const now = Date.now();
  const transactions = await listSubscriptionTransactions(subscriptionId, now);
  const validTransactions = transactions
    .map((transaction) => ({ transaction, period: paidPeriod(transaction, plan.months, plan.amount, now) }))
    .filter((entry): entry is { transaction: unknown; period: BillingPeriod } => Boolean(entry.period));
  validTransactions.sort((a, b) => b.period.end.localeCompare(a.period.end));
  const currentPayment = validTransactions[0];
  const period = currentPayment?.period;
  const { error: writeError } = await db.rpc('apply_billing_entitlement', {
    p_user_id: checkout.user_id, p_provider: 'paypal', p_subscription_id: subscriptionId,
    p_updates: { is_premium: !!period, premium_until: period?.end || null, premium_plan: checkout.plan }, p_observed_at: observedAt,
  });
  if (writeError) throw new Error('PayPal entitlement update failed');
  await projectPayPalSubscription(db, checkout.user_id, subscription, plan, period?.end || null, sourceEventId);
  if (period) {
    const { error: quotaError } = await db.rpc('sync_ai_quota_period_for_user', { p_user_id: checkout.user_id, p_period_start: period.start });
    if (quotaError) throw new Error('PayPal quota synchronization failed');
    await recordServerAnalyticsEvent(db, {
      eventKey: `paypal:purchase:${subscriptionId}`,
      eventName: 'purchase_confirmed',
      userId: checkout.user_id,
      provider: 'paypal',
      properties: { plan: checkout.plan, status: subscription.status },
      occurredAt: observedAt,
    });

    const latestTransaction = currentPayment ? asRecord(currentPayment.transaction) : {};
    const latestTransactionId = typeof latestTransaction?.id === 'string'
      ? latestTransaction.id
      : typeof latestTransaction?.transaction_id === 'string' ? latestTransaction.transaction_id : '';
    const latestAmount = asRecord(asRecord(latestTransaction?.amount_with_breakdown).gross_amount);
    if (latestTransactionId) {
      await projectBillingTransaction(db, {
        userId: checkout.user_id,
        provider: 'paypal',
        transactionId: latestTransactionId,
        transactionType: 'payment',
        subscriptionId,
        status: typeof latestTransaction?.status === 'string' ? latestTransaction.status : 'COMPLETED',
        currency: typeof latestAmount.currency_code === 'string' ? latestAmount.currency_code : 'USD',
        amountMinor: typeof latestAmount.value === 'string' && Number.isFinite(Number(latestAmount.value)) ? Math.round(Number(latestAmount.value) * 100) : null,
        occurredAt: typeof latestTransaction?.time === 'string' ? latestTransaction.time : observedAt,
        sourceEventId,
      });
    }
  }
  return {
    paid: Boolean(period),
    status: typeof subscription.status === 'string' ? subscription.status : 'UNKNOWN',
    premiumUntil: period?.end || null,
    plan: planName,
  };
}
