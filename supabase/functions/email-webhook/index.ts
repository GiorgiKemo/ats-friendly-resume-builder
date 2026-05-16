// supabase/functions/email-webhook/index.ts
// Webhook endpoint for Brevo transactional email events.
//
// Tracks: delivered, opened, clicked, hard_bounce, soft_bounce, spam, unsubscribed
//
// Brevo Webhook setup:
//   1. Go to Brevo Dashboard → Transactional → Settings → Webhook
//   2. Set the webhook URL to:
//      https://onuxzcectniowxqtmjpg.supabase.co/functions/v1/email-webhook
//   3. Select events: delivered, opened, click, hard_bounce, soft_bounce, spam

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyBearerSecret } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const BREVO_WEBHOOK_SECRET = Deno.env.get('BREVO_WEBHOOK_SECRET') || '';

const isProd = Deno.env.get('NODE_ENV') === 'production';
const log = (...args: unknown[]) => { if (!isProd) console.log('[email-webhook]', ...args); };

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req: Request) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  if (!BREVO_WEBHOOK_SECRET) {
    console.error('[email-webhook] BREVO_WEBHOOK_SECRET is not configured');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers });
  }

  if (!verifyBearerSecret(req, BREVO_WEBHOOK_SECRET)) {
    log('Invalid webhook authorization');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  try {
    // Brevo sends webhook events as a JSON body.
    // It can be a single event object or an array of events.
    const rawBody = await req.json();
    const events: Array<Record<string, unknown>> = Array.isArray(rawBody) ? rawBody : [rawBody];

    const supabase = adminClient();
    let processed = 0;

    for (const event of events) {
      const eventType = (event.event as string || '').toLowerCase();
      const messageId = event['message-id'] as string || event.messageId as string || '';

      if (!messageId) {
        log('Skipping event without message-id:', eventType);
        continue;
      }

      log(`Event: ${eventType} for messageId: ${messageId}`);

      // Find the job by brevo_message_id
      const { data: job, error: findError } = await supabase
        .from('auto_apply_jobs')
        .select('id, status, email_opened_count')
        .eq('brevo_message_id', messageId)
        .maybeSingle();

      if (findError || !job) {
        log(`No job found for messageId ${messageId}`);
        continue;
      }

      const updates: Record<string, unknown> = {};

      switch (eventType) {
        case 'delivered':
          updates.email_delivered_at = new Date().toISOString();
          break;

        case 'opened':
        case 'unique_opened':
          updates.email_opened_count = (job.email_opened_count || 0) + 1;
          if (!event.date) {
            updates.email_opened_at = new Date().toISOString();
          }
          break;

        case 'click':
          updates.email_clicked_at = new Date().toISOString();
          break;

        case 'hard_bounce':
        case 'soft_bounce':
        case 'blocked':
          // Mark as failed if the email bounced
          if (job.status === 'applied' || job.status === 'applying') {
            updates.status = 'failed';
            updates.failure_reason = `Email ${eventType}: ${event.reason || 'Unknown'}`;
          }
          break;

        case 'spam':
        case 'unsubscribed':
          // Log but don't change status — the company marked it as spam
          log(`Email ${eventType} for job ${job.id}`);
          break;

        default:
          log(`Unknown event type: ${eventType}`);
          continue;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('auto_apply_jobs')
          .update(updates)
          .eq('id', job.id);

        if (updateError) {
          log(`Error updating job ${job.id}:`, updateError);
        } else {
          processed++;
        }
      }
    }

    log(`Processed ${processed}/${events.length} email events`);

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { status: 200, headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[email-webhook] Error:', message);
    // Return 200 to prevent Brevo from retrying on parse errors
    return new Response(JSON.stringify({ error: message }), { status: 200, headers });
  }
});
