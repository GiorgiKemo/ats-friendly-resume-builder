import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { paypalRequest, syncPayPalSubscription } from '../_shared/paypal.ts';
const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');
    if (!webhookId) return new Response('Webhook not configured', { status: 503 });
    const headers = ['paypal-transmission-id','paypal-transmission-time','paypal-transmission-sig','paypal-cert-url','paypal-auth-algo'];
    if (headers.some((name) => !req.headers.get(name))) return new Response('Missing signature', { status: 400 });
    const event = await req.json();
    const verification = await paypalRequest('/v1/notifications/verify-webhook-signature','POST',{
      transmission_id: req.headers.get(headers[0]), transmission_time: req.headers.get(headers[1]),
      transmission_sig: req.headers.get(headers[2]), cert_url: req.headers.get(headers[3]), auth_algo: req.headers.get(headers[4]),
      webhook_id: webhookId, webhook_event: event,
    });
    if (verification.verification_status !== 'SUCCESS') return new Response('Invalid signature', { status: 400 });
    let subscriptionId = event.event_type?.startsWith('BILLING.SUBSCRIPTION.') ? event.resource?.id : event.resource?.billing_agreement_id;
    // Refund notifications can contain a refund resource rather than the original sale.
    if (!subscriptionId && event.event_type === 'PAYMENT.SALE.REFUNDED' && event.resource?.sale_id) {
      const sale = await paypalRequest(`/v1/payments/sale/${encodeURIComponent(event.resource.sale_id)}`);
      subscriptionId = sale.billing_agreement_id;
    }
    if (subscriptionId) {
      const { data, error } = await db.from('paypal_checkouts').select('request_id').eq('subscription_id',subscriptionId).maybeSingle();
      if (error) throw new Error('Webhook checkout lookup failed');
      // App-bound subscriptions not created by this website have no entitlement mapping.
      if (data) await syncPayPalSubscription(db,subscriptionId);
    }
    return new Response('OK');
  } catch (error) {
    console.error('PayPal webhook failed:', error instanceof Error ? error.message : 'Unknown error');
    return new Response('Retry delivery', { status: 500 });
  }
});
