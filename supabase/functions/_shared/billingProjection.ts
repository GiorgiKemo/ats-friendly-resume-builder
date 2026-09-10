type ProjectionDb = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error: { message?: string } | null }>;
};

type StripeSubscriptionLike = {
  id?: unknown;
  livemode?: unknown;
  customer?: unknown;
  status?: unknown;
  cancel_at_period_end?: unknown;
  cancel_at?: unknown;
  canceled_at?: unknown;
  current_period_start?: unknown;
  current_period_end?: unknown;
  items?: { data?: Array<{ price?: { id?: unknown; unit_amount?: unknown; currency?: unknown; recurring?: { interval?: unknown } | null } | null } | null> } | null;
};

type PayPalSubscriptionLike = {
  id?: unknown;
  status?: unknown;
  plan_id?: unknown;
  create_time?: unknown;
  update_time?: unknown;
  subscriber?: { payer_id?: unknown } | null;
  billing_info?: { next_billing_time?: unknown } | null;
};

const paypalApiBase = Deno.env.get('PAYPAL_API_BASE') || 'https://api-m.paypal.com';
const paypalEnvironment = (Deno.env.get('PAYPAL_ENVIRONMENT') || (paypalApiBase.toLowerCase().includes('sandbox') ? 'sandbox' : 'live')).toLowerCase();

const asString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const asBoolean = (value: unknown) => typeof value === 'boolean' ? value : false;
const asIso = (unixSeconds: unknown) => {
  const value = asNumber(unixSeconds);
  return value && value > 0 ? new Date(value * 1000).toISOString() : null;
};

export const projectStripeSubscription = async (
  db: ProjectionDb,
  userId: string,
  subscription: StripeSubscriptionLike,
  sourceEventId?: string | null,
  observedAt?: string | null,
) => {
  const item = subscription.items?.data?.[0] || null;
  const price = item?.price || null;
  const subscriptionId = asString(subscription.id);
  if (!subscriptionId) throw new Error('Billing projection subscription id is missing');
  const { error } = await db.rpc('upsert_billing_subscription_projection', {
    p_user_id: userId,
    p_provider: 'stripe',
    p_subscription_id: subscriptionId,
    p_snapshot: {
      livemode: asBoolean(subscription.livemode),
      customerId: asString(subscription.customer),
      status: asString(subscription.status) || 'unknown',
      priceId: asString(price?.id),
      currency: asString(price?.currency),
      amountMinor: asNumber(price?.unit_amount),
      billingInterval: asString(price?.recurring?.interval),
      currentPeriodStart: asIso(subscription.current_period_start),
      currentPeriodEnd: asIso(subscription.current_period_end),
      cancelAtPeriodEnd: asBoolean(subscription.cancel_at_period_end),
      cancelAt: asIso(subscription.cancel_at),
      canceledAt: asIso(subscription.canceled_at),
      sourceEventId: asString(sourceEventId),
    },
    p_observed_at: observedAt || new Date().toISOString(),
  });
  if (error) throw new Error('Billing subscription projection failed');
};

export const projectPayPalSubscription = async (
  db: ProjectionDb,
  userId: string,
  subscription: PayPalSubscriptionLike,
  plan: { id?: string | null; amount?: string | null; months?: number | null } | null,
  periodEnd?: string | null,
  sourceEventId?: string | null,
) => {
  const subscriptionId = asString(subscription.id);
  if (!subscriptionId) throw new Error('Billing projection subscription id is missing');
  const amount = plan?.amount ? Number(plan.amount) : Number.NaN;
  const { error } = await db.rpc('upsert_billing_subscription_projection', {
    p_user_id: userId,
    p_provider: 'paypal',
    p_subscription_id: subscriptionId,
    p_snapshot: {
      livemode: !['sandbox', 'test'].includes(paypalEnvironment),
      customerId: asString(subscription.subscriber?.payer_id),
      status: asString(subscription.status) || 'unknown',
      plan: plan?.id || null,
      priceId: asString(subscription.plan_id),
      currency: 'USD',
      amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
      billingInterval: plan?.months === 12 ? 'year' : 'month',
      currentPeriodEnd: periodEnd || asString(subscription.billing_info?.next_billing_time),
      cancelAtPeriodEnd: ['CANCELLED', 'SUSPENDED'].includes(String(subscription.status || '')),
      sourceEventId: asString(sourceEventId),
    },
    p_observed_at: new Date().toISOString(),
  });
  if (error) throw new Error('Billing subscription projection failed');
};

export const projectBillingTransaction = async (
  db: ProjectionDb,
  input: {
    userId: string;
    provider: 'stripe' | 'paypal';
    transactionId: string;
    transactionType: 'payment' | 'invoice' | 'refund' | 'dispute' | 'chargeback' | 'adjustment';
    subscriptionId?: string | null;
    status: string;
    currency?: string | null;
    amountMinor?: number | null;
    occurredAt?: string | null;
    sourceEventId?: string | null;
    livemode?: boolean;
    observedAt?: string | null;
  },
) => {
  const { error } = await db.rpc('record_billing_transaction_projection', {
    p_user_id: input.userId,
    p_provider: input.provider,
    p_transaction_id: input.transactionId,
    p_transaction_type: input.transactionType,
    p_snapshot: {
      livemode: input.livemode !== false,
      subscriptionId: input.subscriptionId || null,
      status: input.status,
      currency: input.currency || null,
      amountMinor: input.amountMinor ?? null,
      occurredAt: input.occurredAt || null,
      sourceEventId: input.sourceEventId || null,
    },
    p_observed_at: input.observedAt || new Date().toISOString(),
  });
  if (error) throw new Error('Billing transaction projection failed');
};
