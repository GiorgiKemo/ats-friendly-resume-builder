import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { escapeEmailHtml, isSingleEmailAddress } from '../_shared/emailSafety.ts';
import { readBoundedBodyText } from '../_shared/boundedBody.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('SUPPORT_NOTIFICATION_SECRET') || '';
const brevoApiKey = Deno.env.get('BREVO_API_KEY') || '';
const senderEmail = Deno.env.get('SUPPORT_EMAIL_FROM') || Deno.env.get('SMTP_ADMIN_EMAIL') || '';
const senderName = Deno.env.get('SUPPORT_EMAIL_FROM_NAME') || 'ResumeATS Support';

type EmailOutbox = {
  outboxId: string;
  conversationId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attempt: number;
};

const createServiceClient = () => createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const jsonResponse = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const safeCode = (value: unknown, fallback: string) => {
  const code = typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9_.:-]/g, '_') : '';
  return code.slice(0, 120) || fallback;
};

const cleanSubject = (value: string) => value.replace(/[\r\n]+/g, ' ').trim().slice(0, 160) || 'Support reply';

const sendBrevo = async (item: EmailOutbox) => {
  if (!isSingleEmailAddress(item.recipientEmail)) throw new Error('recipient_invalid');
  const subject = `ResumeATS support: ${cleanSubject(item.subject)}`;
  const escapedBody = escapeEmailHtml(item.body).replace(/\r?\n/g, '<br>');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': brevoApiKey,
      'content-type': 'application/json',
      'Idempotency-Key': item.outboxId,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName.slice(0, 80) },
      to: [{ email: item.recipientEmail }],
      subject,
      headers: { 'Idempotency-Key': item.outboxId },
      htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><p>Your ResumeATS support team replied:</p><p>${escapedBody}</p><p style="color:#64748b;font-size:13px">Reply to this email if you need more help. Conversation: ${escapeEmailHtml(item.conversationId)}</p></div>`,
      textContent: `Your ResumeATS support team replied:\n\n${item.body}\n\nConversation: ${item.conversationId}`,
    }),
  });
  if (!response.ok) throw new Error(`brevo_http_${response.status}`);
  let result: Record<string, unknown> = {};
  try { result = await response.json() as Record<string, unknown>; } catch { /* response body is not required */ }
  return typeof result.messageId === 'string' ? result.messageId : null;
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-support-notification-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey || !brevoApiKey || !isSingleEmailAddress(senderEmail)) {
    return jsonResponse({ error: 'Support email delivery is not configured' }, 503);
  }

  let limit = 10;
  try {
    const raw = await readBoundedBodyText(req, 16 * 1024);
    if (raw) {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) limit = body.limit;
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  limit = Math.max(1, Math.min(25, limit));
  const client = createServiceClient();
  const workerId = `support-email:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await client.rpc('support_claim_email_outbox', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 300,
  });
  if (claimError) return jsonResponse({ error: 'Support email queue is unavailable' }, 503);

  const items = Array.isArray(claimed) ? claimed as EmailOutbox[] : [];
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const providerMessageId = await sendBrevo(item);
      const { error } = await client.rpc('support_complete_email_outbox', {
        p_outbox_id: item.outboxId,
        p_worker_id: workerId,
        p_provider_message_id: providerMessageId,
      });
      if (error) throw new Error('outbox_completion_failed');
      sent += 1;
    } catch (error) {
      await client.rpc('support_release_email_outbox', {
        p_outbox_id: item.outboxId,
        p_worker_id: workerId,
        p_retry: item.attempt < 5,
        p_error_code: safeCode(error instanceof Error ? error.message : '', 'notification_failed'),
      });
      failed += 1;
    }
  }
  return jsonResponse({ ok: true, claimed: items.length, sent, failed }, 200);
});
