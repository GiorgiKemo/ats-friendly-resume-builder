import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { escapeEmailHtml, isSingleEmailAddress } from '../_shared/emailSafety.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('ADMIN_INVITATION_EMAIL_SECRET') || '';
const brevoApiKey = Deno.env.get('BREVO_API_KEY') || '';
const senderEmail = Deno.env.get('ADMIN_EMAIL_FROM') || Deno.env.get('SUPPORT_EMAIL_FROM') || Deno.env.get('SMTP_ADMIN_EMAIL') || '';
const senderName = Deno.env.get('ADMIN_EMAIL_FROM_NAME') || Deno.env.get('SUPPORT_EMAIL_FROM_NAME') || 'ResumeATS';
const appUrl = Deno.env.get('ADMIN_APP_URL') || Deno.env.get('PUBLIC_SITE_URL') || '';

type InvitationOutbox = {
  outboxId: string;
  memberId: string;
  recipientEmail: string;
  role: 'owner' | 'admin' | 'support';
  invitationExpiresAt: string;
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

const cleanRole = (value: InvitationOutbox['role']) => (
  value === 'owner' || value === 'support' ? value : 'admin'
);

const buildSignInUrl = () => {
  const parsed = new URL(appUrl);
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('admin_app_url_must_be_https');
  }
  return new URL('/signin', parsed).toString();
};

const sendBrevo = async (item: InvitationOutbox) => {
  if (!isSingleEmailAddress(item.recipientEmail)) throw new Error('recipient_invalid');
  const signInUrl = buildSignInUrl();
  const role = cleanRole(item.role);
  const expiresAt = new Date(item.invitationExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new Error('invitation_expired');
  const expiryText = expiresAt.toISOString();
  const subject = 'You have been invited to ResumeATS admin access';
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
      htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><p>You have been invited to ResumeATS admin access as <strong>${escapeEmailHtml(role)}</strong>.</p><p>Create or sign in to your ResumeATS account using this email address, then open the admin area:</p><p><a href="${escapeEmailHtml(signInUrl)}">Open ResumeATS sign in</a></p><p style="color:#64748b;font-size:13px">This invitation expires at ${escapeEmailHtml(expiryText)} UTC. If you did not expect this invitation, you can ignore this email.</p></div>`,
      textContent: `You have been invited to ResumeATS admin access as ${role}.\n\nCreate or sign in to your ResumeATS account using this email address, then open: ${signInUrl}\n\nThis invitation expires at ${expiryText} UTC. If you did not expect this invitation, you can ignore this email.`,
    }),
  });
  if (!response.ok) throw new Error(`brevo_http_${response.status}`);
  let result: Record<string, unknown> = {};
  try { result = await response.json() as Record<string, unknown>; } catch { /* provider body is optional */ }
  return typeof result.messageId === 'string' ? result.messageId : null;
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-admin-invitation-email-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey || !brevoApiKey || !isSingleEmailAddress(senderEmail) || !appUrl) {
    return jsonResponse({ error: 'Admin invitation email delivery is not configured' }, 503);
  }

  let limit = 10;
  try {
    const raw = await req.text();
    if (raw) {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) limit = body.limit;
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  limit = Math.max(1, Math.min(25, limit));
  const client = createServiceClient();
  const workerId = `admin-invite:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await client.rpc('admin_claim_invitation_email_outbox', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 300,
  });
  if (claimError) return jsonResponse({ error: 'Admin invitation queue is unavailable' }, 503);

  const items = Array.isArray(claimed) ? claimed as InvitationOutbox[] : [];
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const providerMessageId = await sendBrevo(item);
      const { error } = await client.rpc('admin_complete_invitation_email_outbox', {
        p_outbox_id: item.outboxId,
        p_worker_id: workerId,
        p_provider_message_id: providerMessageId,
      });
      if (error) throw new Error('outbox_completion_failed');
      sent += 1;
    } catch (error) {
      await client.rpc('admin_release_invitation_email_outbox', {
        p_outbox_id: item.outboxId,
        p_worker_id: workerId,
        p_retry: item.attempt < 5,
        p_error_code: safeCode(error instanceof Error ? error.message : '', 'invitation_delivery_failed'),
      });
      failed += 1;
    }
  }
  return jsonResponse({ ok: true, claimed: items.length, sent, failed }, 200);
});
