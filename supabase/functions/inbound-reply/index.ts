// supabase/functions/inbound-reply/index.ts
// Webhook endpoint for Brevo Inbound Parsing.
//
// When a company replies to an application email, the reply goes to:
//   apply+{jobId}@resumeats.cv
//
// Brevo's inbound parsing forwards the email payload to this webhook.
// We extract the jobId from the To address and update the job status to "replied".
//
// Brevo Inbound Parsing setup:
//   1. Go to Brevo Dashboard → Transactional → Settings → Inbound Parsing
//   2. Add your domain (resumeats.cv)
//   3. Set the webhook URL to:
//      https://onuxzcectniowxqtmjpg.supabase.co/functions/v1/inbound-reply
//   4. Enable inbound parsing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyBearerSecret } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const INBOUND_WEBHOOK_SECRET = Deno.env.get('INBOUND_WEBHOOK_SECRET') || '';

const isProd = Deno.env.get('NODE_ENV') === 'production';
const log = (...args: unknown[]) => { if (!isProd) console.log('[inbound-reply]', ...args); };

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Extract the job ID from a reply-to address like:
 *   apply+550e8400-e29b-41d4-a716-446655440000@resumeats.cv
 * Returns the UUID or null.
 */
function extractJobId(email: string): string | null {
  // Match apply+{uuid}@domain
  const match = email.match(/apply\+([0-9a-f-]{36})@/i);
  return match ? match[1] : null;
}

/**
 * Parse job IDs from all recipient addresses in the payload.
 * Brevo may send the To field as a string, array, or within items.
 */
function parseJobIds(payload: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const candidates: string[] = [];

  // Brevo inbound payload fields that may contain the recipient
  const fields = ['To', 'to', 'Recipients', 'recipients', 'Recipient', 'recipient'];

  for (const field of fields) {
    const val = payload[field];
    if (typeof val === 'string') {
      candidates.push(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'string') candidates.push(item);
        else if (typeof item === 'object' && item !== null) {
          const addr = (item as Record<string, string>).Address || (item as Record<string, string>).address || (item as Record<string, string>).email || '';
          if (addr) candidates.push(addr);
        }
      }
    }
  }

  for (const addr of candidates) {
    const jobId = extractJobId(addr);
    if (jobId) ids.push(jobId);
  }

  return [...new Set(ids)];
}

serve(async (req: Request) => {
  // Allow any origin — this is called by Brevo's servers, not a browser
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

  if (!INBOUND_WEBHOOK_SECRET) {
    console.error('[inbound-reply] INBOUND_WEBHOOK_SECRET is not configured');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers });
  }

  if (!verifyBearerSecret(req, INBOUND_WEBHOOK_SECRET)) {
    log('Invalid webhook authorization');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  try {
    // Brevo sends the inbound email as JSON
    const payload = await req.json();
    log('Inbound email received:', JSON.stringify(payload).slice(0, 500));

    const jobIds = parseJobIds(payload);

    if (jobIds.length === 0) {
      log('No job ID found in recipient addresses');
      return new Response(JSON.stringify({ ok: true, matched: 0 }), { status: 200, headers });
    }

    const supabase = adminClient();
    let updated = 0;

    for (const jobId of jobIds) {
      // Only update if currently in 'applied' status (don't overwrite 'interview' etc.)
      const { data, error } = await supabase
        .from('auto_apply_jobs')
        .update({
          status: 'replied',
          replied_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('status', 'applied')
        .select('id, user_id, company, title')
        .maybeSingle();

      if (error) {
        log(`Error updating job ${jobId}:`, error);
        continue;
      }

      if (data) {
        updated++;
        log(`Job ${jobId} marked as replied: ${data.title} at ${data.company}`);

        // Also update the corresponding job_applications record if one exists
        await supabase
          .from('job_applications')
          .update({
            status: 'screening',
            response_at: new Date().toISOString(),
            notes: `Company replied to auto-apply email on ${new Date().toLocaleDateString()}`,
          })
          .eq('user_id', data.user_id)
          .ilike('company', data.company)
          .eq('status', 'applied');
      }
    }

    log(`Processed inbound email: ${updated}/${jobIds.length} jobs updated`);

    return new Response(
      JSON.stringify({ ok: true, matched: jobIds.length, updated }),
      { status: 200, headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[inbound-reply] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});
