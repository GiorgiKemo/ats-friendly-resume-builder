import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { getClientIp, hashValue } from '../_shared/security.ts';

type PublicAction = 'subscribeNewsletter' | 'submitContactInquiry';

type RateLimitConfig = {
  maxAttempts: number;
  maxEmailAttempts: number;
  maxIpAttempts: number;
  maxGlobalAttempts: number;
  windowMs: number;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const rateLimits: Record<PublicAction, RateLimitConfig> = {
  subscribeNewsletter: {
    maxAttempts: 3,
    maxEmailAttempts: 4,
    maxIpAttempts: 10,
    maxGlobalAttempts: 300,
    windowMs: 60 * 60 * 1000,
  },
  submitContactInquiry: {
    maxAttempts: 5,
    maxEmailAttempts: 6,
    maxIpAttempts: 15,
    maxGlobalAttempts: 200,
    windowMs: 15 * 60 * 1000,
  },
};

const jsonResponse = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });

const normalizeEmail = (value = '') => value.trim().toLowerCase();

const sanitizeString = (value: unknown, maxLength: number, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
};

const assertEmail = (email: string) => {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }
};

const recordAttempt = async (
  action: PublicAction,
  keyHash: string,
  emailHash: string,
  ipHash: string,
  accepted: boolean,
  reason: string | null,
) => {
  const { error } = await adminClient.from('public_engagement_attempts').insert({
    scope: action,
    key_hash: keyHash,
    email_hash: emailHash,
    ip_hash: ipHash,
    accepted,
    reason,
  });

  if (error) throw error;
};

const countAttempts = async (
  action: PublicAction,
  column: 'key_hash' | 'email_hash' | 'ip_hash' | null,
  value: string | null,
  windowStart: string,
) => {
  let query = adminClient
    .from('public_engagement_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('scope', action)
    .gte('created_at', windowStart);

  if (column && value) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const enforceRateLimit = async (req: Request, action: PublicAction, email: string) => {
  const config = rateLimits[action];
  const ip = getClientIp(req);
  const keyHash = await hashValue(`${action}:${ip}:${email}`);
  const emailHash = await hashValue(email || 'missing-email');
  const ipHash = await hashValue(ip);
  const windowStart = new Date(Date.now() - config.windowMs).toISOString();

  const [keyCount, emailCount, ipCount, globalCount] = await Promise.all([
    countAttempts(action, 'key_hash', keyHash, windowStart),
    countAttempts(action, 'email_hash', emailHash, windowStart),
    countAttempts(action, 'ip_hash', ipHash, windowStart),
    countAttempts(action, null, null, windowStart),
  ]);

  const reason =
    keyCount >= config.maxAttempts ? 'rate_limited_key' :
      emailCount >= config.maxEmailAttempts ? 'rate_limited_email' :
        ipCount >= config.maxIpAttempts ? 'rate_limited_ip' :
          globalCount >= config.maxGlobalAttempts ? 'rate_limited_global' :
            null;

  if (reason) {
    await recordAttempt(action, keyHash, emailHash, ipHash, false, reason);
    throw new HttpError(429, 'Too many submissions. Please try again later.');
  }

  return {
    keyHash,
    emailHash,
    ipHash,
  };
};

const subscribeToNewsletter = async (payload: Record<string, unknown>) => {
  const email = normalizeEmail(sanitizeString(payload.email, 320));
  const source = sanitizeString(payload.source, 80, 'footer') || 'footer';

  assertEmail(email);

  const { error } = await adminClient.from('newsletter_subscribers').insert({
    email,
    source,
    status: 'active',
  });

  if (error && error.code !== '23505') {
    throw error;
  }

  return {
    ok: true,
    email,
    alreadySubscribed: error?.code === '23505',
  };
};

const submitContactInquiry = async (payload: Record<string, unknown>) => {
  const submission = {
    name: sanitizeString(payload.name, 200),
    email: normalizeEmail(sanitizeString(payload.email, 320)),
    subject: sanitizeString(payload.subject, 200),
    message: sanitizeString(payload.message, 5000),
    source: sanitizeString(payload.source, 80, 'website') || 'website',
  };

  assertEmail(submission.email);

  if (!submission.name || !submission.subject || !submission.message) {
    throw new HttpError(400, 'Please fill out all required fields.');
  }

  const { data, error } = await adminClient
    .from('contact_inquiries')
    .insert(submission)
    .select('id')
    .single();

  if (error) throw error;

  return {
    ok: true,
    id: data.id,
  };
};

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (!isOriginAllowed(origin)) {
    return jsonResponse({ ok: false, error: 'Origin not allowed' }, 403, origin);
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Server misconfiguration' }, 500, origin);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = sanitizeString(body.action, 80) as PublicAction;
    const payload = body.payload && typeof body.payload === 'object'
      ? body.payload as Record<string, unknown>
      : {};

    if (!Object.prototype.hasOwnProperty.call(rateLimits, action)) {
      return jsonResponse({ ok: false, error: 'Unknown public engagement action' }, 400, origin);
    }

    const email = normalizeEmail(sanitizeString(payload.email, 320));
    const attempt = await enforceRateLimit(req, action, email);

    let result: Record<string, unknown>;
    try {
      result = action === 'subscribeNewsletter'
        ? await subscribeToNewsletter(payload)
        : await submitContactInquiry(payload);
      await recordAttempt(action, attempt.keyHash, attempt.emailHash, attempt.ipHash, true, null);
    } catch (actionError) {
      const reason = actionError instanceof HttpError ? 'rejected' : 'processing_error';
      await recordAttempt(action, attempt.keyHash, attempt.emailHash, attempt.ipHash, false, reason)
        .catch(() => null);
      throw actionError;
    }

    return jsonResponse(result, 200, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Could not process request';
    return jsonResponse({ ok: false, error: message }, status, origin);
  }
});
