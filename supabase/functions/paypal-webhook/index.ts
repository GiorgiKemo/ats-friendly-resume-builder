import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { paypalRequest, syncPayPalSubscription } from '../_shared/paypal.ts';
const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
const eventInboxKey = 'paypal';

async function claimEvent(eventId: string, eventType: string) {
  const { error } = await db.from('billing_provider_events').insert({
    provider: eventInboxKey,
    event_id: eventId,
    event_type: eventType,
    status: 'processing',
  });
  if (!error) return true;
  if (error.code !== '23505' && !/duplicate|already exists/i.test(error.message || '')) {
    throw new Error('Could not claim PayPal event');
  }
  const { data, error: lookupError } = await db.from('billing_provider_events')
    .select('status,created_at').eq('provider', eventInboxKey).eq('event_id', eventId).maybeSingle();
  if (lookupError || !data) throw new Error('Could not read PayPal event receipt');
  if (data.status === 'processed' || data.status === 'skipped') return false;
  const createdAt = typeof data.created_at === 'string' ? Date.parse(data.created_at) : Number.NaN;
  if (data.status === 'failed' || (data.status === 'processing' && Number.isFinite(createdAt) && Date.now() - createdAt > 15 * 60 * 1000)) {
    const { data: reclaimed, error: reclaimError } = await db.from('billing_provider_events')
      .update({ status: 'processing', error: null, processed_at: null, created_at: new Date().toISOString(), event_type: eventType })
      .eq('provider', eventInboxKey).eq('event_id', eventId).eq('status', data.status).eq('created_at', data.created_at)
      .select('event_id').maybeSingle();
    if (reclaimError || !reclaimed) throw new Error('PayPal event is already being processed');
    return true;
  }
  throw new Error('PayPal event is already being processed');
}

async function finishEvent(eventId: string, status: 'processed' | 'skipped', error?: string) {
  const { error: updateError } = await db.from('billing_provider_events').update({
    status,
    error: error ? error.slice(0, 2000) : null,
    processed_at: new Date().toISOString(),
  }).eq('provider', eventInboxKey).eq('event_id', eventId);
  if (updateError) throw new Error('Could not finish PayPal event receipt');
}

async function failEvent(eventId: string, error: unknown) {
  await db.from('billing_provider_events').update({
    status: 'failed',
    error: error instanceof Error ? error.message.slice(0, 2000) : 'PayPal webhook failed',
  }).eq('provider', eventInboxKey).eq('event_id', eventId);
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let receivedEventId = '';
  try {
    const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');
    if (!webhookId) return new Response('Webhook not configured', { status: 503 });
    const headers = ['paypal-transmission-id','paypal-transmission-time','paypal-transmission-sig','paypal-cert-url','paypal-auth-algo'];
    if (headers.some((name) => !req.headers.get(name))) return new Response('Missing signature', { status: 400 });
    const event = asRecord(await req.json());
    const verification = asRecord(await paypalRequest('/v1/notifications/verify-webhook-signature','POST',{
      transmission_id: req.headers.get(headers[0]), transmission_time: req.headers.get(headers[1]),
      transmission_sig: req.headers.get(headers[2]), cert_url: req.headers.get(headers[3]), auth_algo: req.headers.get(headers[4]),
      webhook_id: webhookId, webhook_event: event,
    }));
    if (verification.verification_status !== 'SUCCESS') return new Response('Invalid signature', { status: 400 });
    const eventId = typeof event.id === 'string' ? event.id : '';
    const eventType = typeof event.event_type === 'string' ? event.event_type : '';
    if (!eventId || !eventType) return new Response('Invalid event', { status: 400 });
    receivedEventId = eventId;
    const claimed = await claimEvent(eventId, eventType);
    if (!claimed) return new Response('OK');
    const resource = asRecord(event.resource);
    let subscriptionId = eventType.startsWith('BILLING.SUBSCRIPTION.')
      ? (typeof resource.id === 'string' ? resource.id : '')
      : (typeof resource.billing_agreement_id === 'string' ? resource.billing_agreement_id : '');
    // Refund notifications can contain a refund resource rather than the original sale.
    if (!subscriptionId && eventType === 'PAYMENT.SALE.REFUNDED' && typeof resource.sale_id === 'string') {
      const sale = asRecord(await paypalRequest(`/v1/payments/sale/${encodeURIComponent(resource.sale_id)}`));
      subscriptionId = typeof sale.billing_agreement_id === 'string' ? sale.billing_agreement_id : '';
    }
    if (subscriptionId) {
      const { data, error } = await db.from('paypal_checkouts').select('request_id').eq('subscription_id',subscriptionId).maybeSingle();
      if (error) throw new Error('Webhook checkout lookup failed');
      // App-bound subscriptions not created by this website have no entitlement mapping.
      if (data) await syncPayPalSubscription(db,subscriptionId,undefined,eventId);
    }
    await finishEvent(eventId, subscriptionId ? 'processed' : 'skipped', subscriptionId ? undefined : 'No mapped subscription');
    return new Response('OK');
  } catch (error) {
    if (receivedEventId) await failEvent(receivedEventId, error);
    console.error('PayPal webhook failed:', error instanceof Error ? error.message : 'Unknown error');
    return new Response('Retry delivery', { status: 500 });
  }
});
