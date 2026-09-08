import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateUser, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { paypalPlans, paypalRequest, syncPayPalSubscription } from '../_shared/paypal.ts';

const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (!isOriginAllowed(req.headers.get('origin'))) return reply({ error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const auth = await authenticateUser(req);
  if (!auth) return reply({ error: 'Unauthorized' }, 401);
  try {
    const body = await req.json();
    if (body.action === 'verify') {
      if (!/^I-[A-Z0-9]+$/.test(body.subscriptionId || '')) return reply({ error: 'Invalid subscription' }, 400);
      const result = await syncPayPalSubscription(db, body.subscriptionId, auth.userId);
      return reply(result, result.paid ? 200 : 409);
    }
    if (body.action !== 'create') return reply({ error: 'Invalid action' }, 400);
    const plan = paypalPlans()[body.plan as keyof ReturnType<typeof paypalPlans>];
    if (!plan?.id || !/^[0-9a-f-]{36}$/.test(body.requestId || '')) return reply({ error: 'Invalid or unavailable plan' }, 400);
    const { data: user, error } = await db.from('users').select('is_premium,premium_until').eq('id', auth.userId).single();
    if (error) throw new Error('User lookup failed');
    if (user.is_premium && (!user.premium_until || Date.parse(user.premium_until) > Date.now())) return reply({ error: 'You already have Premium. Manage your existing subscription first.' }, 409);
    const { error: insertError } = await db.from('paypal_checkouts').upsert({ request_id: body.requestId, user_id: auth.userId, plan: body.plan }, { onConflict: 'request_id', ignoreDuplicates: true });
    if (insertError) throw new Error('Checkout registration failed');
    const { data: attempt, error: attemptError } = await db.from('paypal_checkouts').select('*').eq('request_id', body.requestId).single();
    if (attemptError || attempt.user_id !== auth.userId || attempt.plan !== body.plan) return reply({ error: 'Checkout ownership mismatch' }, 403);
    if (Date.now() - Date.parse(attempt.created_at) > 86400000) return reply({ error: 'Checkout attempt expired. Please start again.' }, 409);
    const subscription = attempt.subscription_id
      ? await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(attempt.subscription_id)}`)
      : await paypalRequest('/v1/billing/subscriptions', 'POST', {
        plan_id: plan.id, custom_id: body.requestId,
        application_context: { brand_name: 'ResumeATS', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
          return_url: 'https://www.resumeats.cv/return-from-paypal', cancel_url: 'https://www.resumeats.cv/pricing?paypal=cancelled' },
      }, body.requestId);
    const approval = subscription.links?.find((link: any) => link.rel === 'approve')?.href;
    if (!approval || new URL(approval).origin !== 'https://www.paypal.com') return reply({ error: 'This subscription is no longer awaiting approval. Check your subscription status.' }, 409);
    const { error: saveError } = await db.from('paypal_checkouts').update({ subscription_id: subscription.id }).eq('request_id', body.requestId);
    if (saveError) throw new Error('Checkout persistence failed');
    return reply({ url: approval, subscriptionId: subscription.id });
  } catch (error) {
    console.error('PayPal billing failed:', error instanceof Error ? error.message : 'Unknown error');
    return reply({ error: 'PayPal could not complete this request. Please retry or contact support.' }, 500);
  }
});
