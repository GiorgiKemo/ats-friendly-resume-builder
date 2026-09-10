import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateUser, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { paypalPlans, paypalRequest, syncPayPalSubscription } from '../_shared/paypal.ts';
import { recordServerAnalyticsEvent } from '../_shared/analytics.ts';
import { readBoundedBodyText } from '../_shared/boundedBody.ts';

const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const MAX_BODY_BYTES = 16_384;
const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (!isOriginAllowed(req.headers.get('origin'))) return reply({ error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const auth = await authenticateUser(req);
  if (!auth) return reply({ error: 'Unauthorized' }, 401);
  try {
    const rawBody = await readBoundedBodyText(req, MAX_BODY_BYTES);
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return reply({ error: 'A valid JSON request is required' }, 400);
    }
    const body = asRecord(parsedBody);
    const action = typeof body.action === 'string' ? body.action : '';
    const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : '';
    if (action === 'verify') {
      if (!/^I-[A-Z0-9]+$/.test(subscriptionId)) return reply({ error: 'Invalid subscription' }, 400);
      const result = await syncPayPalSubscription(db, subscriptionId, auth.userId);
      return reply(result, result.paid ? 200 : 409);
    }
    if (action !== 'create') return reply({ error: 'Invalid action' }, 400);
    const planName = typeof body.plan === 'string' ? body.plan : '';
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const plan = paypalPlans()[planName as keyof ReturnType<typeof paypalPlans>];
    if (!plan?.id || !/^[0-9a-f-]{36}$/.test(requestId)) return reply({ error: 'Invalid or unavailable plan' }, 400);
    const { data: user, error } = await db.from('users').select('is_premium,premium_until').eq('id', auth.userId).single();
    if (error) throw new Error('User lookup failed');
    if (user.is_premium && (!user.premium_until || Date.parse(user.premium_until) > Date.now())) return reply({ error: 'You already have Premium. Manage your existing subscription first.' }, 409);
    const { error: insertError } = await db.from('paypal_checkouts').upsert({ request_id: requestId, user_id: auth.userId, plan: planName }, { onConflict: 'request_id', ignoreDuplicates: true });
    if (insertError) throw new Error('Checkout registration failed');
    const { data: attempt, error: attemptError } = await db.from('paypal_checkouts').select('*').eq('request_id', requestId).single();
    if (attemptError || !attempt || attempt.user_id !== auth.userId || attempt.plan !== planName) return reply({ error: 'Checkout ownership mismatch' }, 403);
    if (Date.now() - Date.parse(attempt.created_at) > 86400000) return reply({ error: 'Checkout attempt expired. Please start again.' }, 409);
    const subscription = attempt.subscription_id
      ? await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(attempt.subscription_id)}`)
      : await paypalRequest('/v1/billing/subscriptions', 'POST', {
        plan_id: plan.id, custom_id: requestId,
        application_context: { brand_name: 'ResumeATS', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
          return_url: 'https://www.resumeats.cv/return-from-paypal', cancel_url: 'https://www.resumeats.cv/pricing?paypal=cancelled' },
      }, requestId);
    const subscriptionRecord = asRecord(subscription);
    const links = Array.isArray(subscriptionRecord.links) ? subscriptionRecord.links : [];
    const approvalLink = links
      .map(asRecord)
      .find((link) => link.rel === 'approve');
    const approval = typeof approvalLink?.href === 'string' ? approvalLink.href : '';
    let approvalOrigin = '';
    try { approvalOrigin = new URL(approval).origin; } catch { /* handled as an invalid provider response below */ }
    if (!approval || approvalOrigin !== 'https://www.paypal.com') return reply({ error: 'This subscription is no longer awaiting approval. Check your subscription status.' }, 409);
    if (typeof subscriptionRecord.id !== 'string' || !/^I-[A-Z0-9]+$/.test(subscriptionRecord.id)) return reply({ error: 'PayPal returned an invalid subscription.' }, 502);
    const { error: saveError } = await db.from('paypal_checkouts').update({ subscription_id: subscriptionRecord.id }).eq('request_id', requestId);
    if (saveError) throw new Error('Checkout persistence failed');
    try {
      await recordServerAnalyticsEvent(db, {
        eventKey: `paypal:checkout:${requestId}`,
        eventName: 'checkout_created',
        userId: auth.userId,
        provider: 'paypal',
        properties: { plan: planName, request_id: requestId },
      });
    } catch {
      // Checkout success must not depend on the optional analytics table being available.
    }
    return reply({ url: approval, subscriptionId: subscriptionRecord.id });
  } catch (error) {
    console.error('PayPal billing failed:', error instanceof Error ? error.message : 'Unknown error');
    return reply({ error: 'PayPal could not complete this request. Please retry or contact support.' }, 500);
  }
});
