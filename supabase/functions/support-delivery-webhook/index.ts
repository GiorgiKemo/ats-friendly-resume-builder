import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { verifyBearerSecret } from '../_shared/security.ts';
import { BodyTooLargeError, readBoundedBodyText } from '../_shared/boundedBody.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const webhookSecret = Deno.env.get('BREVO_WEBHOOK_SECRET') || '';
const outboxIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerEvents = new Map([
  ['delivered', 'delivered'],
  ['hardbounce', 'hard_bounce'],
  ['softbounce', 'soft_bounce'],
  ['blocked', 'blocked'],
  ['invalid', 'invalid'],
  ['deferred', 'deferred'],
  ['spam', 'spam'],
  ['unsubscribed', 'unsubscribed'],
]);

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const getString = (event: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const hasControlCharacters = (value: string) => {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
};

const normalizeProviderEvent = (value: string) => providerEvents.get(value.toLowerCase().replace(/[_\s-]/g, ''));

const eventTime = (event: Record<string, unknown>) => {
  const timestamp = event.ts_event ?? event.ts;
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!webhookSecret || !verifyBearerSecret(req, webhookSecret)) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Support delivery mapping is not configured' }, 503);

  let events: Record<string, unknown>[];
  try {
    const rawBody = JSON.parse(await readBoundedBodyText(req, 256 * 1024));
    events = Array.isArray(rawBody) ? rawBody as Record<string, unknown>[] : [rawBody as Record<string, unknown>];
    if (events.length > 100 || events.some((event) => !event || typeof event !== 'object' || Array.isArray(event))) {
      return jsonResponse({ error: 'Invalid webhook payload' }, 422);
    }
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? jsonResponse({ error: 'Payload too large' }, 413)
      : jsonResponse({ error: 'Invalid webhook payload' }, 422);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let recorded = 0;
  let duplicates = 0;
  let unmatched = 0;
  let ignored = 0;

  for (const event of events) {
    const eventType = normalizeProviderEvent(getString(event, 'event'));
    if (!eventType) {
      ignored += 1;
      continue;
    }

    const outboxId = getString(event, 'X-Mailin-custom', 'x-mailin-custom');
    const providerMessageId = getString(event, 'message-id', 'messageId');
    const occurredAt = eventTime(event);
    if (!outboxIdPattern.test(outboxId) || !providerMessageId || providerMessageId.length > 200 || hasControlCharacters(providerMessageId) || !occurredAt) {
      unmatched += 1;
      continue;
    }

    const { data, error } = await client.rpc('support_record_email_delivery_event', {
      p_outbox_id: outboxId,
      p_provider_message_id: providerMessageId,
      p_event_type: eventType,
      p_occurred_at: occurredAt,
    });
    if (error || !data || typeof data !== 'object') {
      return jsonResponse({ error: 'Support delivery event could not be recorded' }, 503);
    }
    const result = data as Record<string, unknown>;
    if (result.matched !== true) unmatched += 1;
    else if (result.recorded === true) recorded += 1;
    else duplicates += 1;
  }

  return jsonResponse({ ok: true, recorded, duplicates, unmatched, ignored });
});
