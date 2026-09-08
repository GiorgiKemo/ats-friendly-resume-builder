const api = 'https://api-m.paypal.com';
export const paypalPlans = () => ({
  premium_monthly: { id: Deno.env.get('PAYPAL_PLAN_MONTHLY'), amount: '9.99', months: 1 },
  premium_yearly: { id: Deno.env.get('PAYPAL_PLAN_YEARLY'), amount: '99.99', months: 12 },
});
export async function paypalRequest(path: string, method = 'GET', body?: unknown, requestId?: string) {
  const client = Deno.env.get('PAYPAL_CLIENT_ID');
  const secret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!client || !secret) throw new Error('PayPal credentials are not configured');
  const tokenResponse = await fetch(`${api}/v1/oauth2/token`, {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${client}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15000),
  });
  if (!tokenResponse.ok) throw new Error(`PayPal authentication failed (${tokenResponse.status})`);
  const token = await tokenResponse.json();
  const response = await fetch(`${api}${path}`, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`PayPal request failed (${response.status}, ${error.name || 'unknown'})`);
  }
  return response.status === 204 ? {} : response.json();
}

export function paidPeriod(transaction: any, months: number, amount: string, now = Date.now()) {
  if (transaction.status !== 'COMPLETED' || transaction.amount_with_breakdown?.gross_amount?.currency_code !== 'USD'
    || Number(transaction.amount_with_breakdown?.gross_amount?.value) !== Number(amount)) return null;
  const start = new Date(transaction.time);
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

export async function syncPayPalSubscription(db: any, subscriptionId: string, expectedUser?: string) {
  const observedAt = new Date().toISOString();
  const { data: checkout, error } = await db.from('paypal_checkouts').select('user_id,plan,request_id')
    .eq('subscription_id', subscriptionId).maybeSingle();
  if (error) throw new Error('Checkout lookup failed');
  if (!checkout || (expectedUser && checkout.user_id !== expectedUser)) throw new Error('PayPal checkout ownership mismatch');
  const subscription = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const plan = paypalPlans()[checkout.plan as keyof ReturnType<typeof paypalPlans>];
  if (!plan?.id || subscription.plan_id !== plan.id || subscription.custom_id !== checkout.request_id || subscription.plan_overridden) {
    throw new Error('PayPal subscription details mismatch');
  }
  const now = Date.now();
  const query = new URLSearchParams({ start_time: new Date(now - 370 * 86400000).toISOString(), end_time: new Date(now).toISOString() });
  const result = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?${query}`);
  if (result.total_pages > 1) throw new Error('PayPal transaction history requires reconciliation');
  const periods = (result.transactions || []).map((t: any) => paidPeriod(t, plan.months, plan.amount, now)).filter(Boolean);
  periods.sort((a: any, b: any) => b.end.localeCompare(a.end));
  const period = periods[0];
  const { error: writeError } = await db.rpc('apply_billing_entitlement', {
    p_user_id: checkout.user_id, p_provider: 'paypal', p_subscription_id: subscriptionId,
    p_updates: { is_premium: !!period, premium_until: period?.end || null, premium_plan: checkout.plan }, p_observed_at: observedAt,
  });
  if (writeError) throw new Error('PayPal entitlement update failed');
  if (period) {
    const { error: quotaError } = await db.rpc('sync_ai_quota_period_for_user', { p_user_id: checkout.user_id, p_period_start: period.start });
    if (quotaError) throw new Error('PayPal quota synchronization failed');
  }
  return { paid: !!period, status: subscription.status, premiumUntil: period?.end || null, plan: checkout.plan };
}
