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

const MAX_REQUEST_BYTES = 32 * 1024;

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

const finalizeAttempt = async (attemptId: string, accepted: boolean, reason: string | null) => {
  const { data, error } = await adminClient.rpc('finalize_public_engagement_attempt', {
    p_attempt_id: attemptId,
    p_accepted: accepted,
    p_reason: reason,
  });
  if (error) throw error;
  if (data !== true) throw new Error('Public engagement attempt could not be finalized');
};

const enforceRateLimit = async (req: Request, action: PublicAction, email: string) => {
  const config = rateLimits[action];
  const ip = getClientIp(req);
  const keyHash = await hashValue(`${action}:${ip}:${email}`);
  const emailHash = await hashValue(email || 'missing-email');
  const ipHash = await hashValue(ip);
  const windowStart = new Date(Date.now() - config.windowMs).toISOString();

  const { data, error } = await adminClient.rpc('claim_public_engagement_attempt', {
    p_scope: action,
    p_key_hash: keyHash,
    p_email_hash: emailHash,
    p_ip_hash: ipHash,
    p_window_start: windowStart,
    p_max_attempts: config.maxAttempts,
    p_max_email_attempts: config.maxEmailAttempts,
    p_max_ip_attempts: config.maxIpAttempts,
    p_max_global_attempts: config.maxGlobalAttempts,
  });
  if (error) throw error;
  const claim = Array.isArray(data) ? data[0] : data;
  if (!claim || typeof claim.attempt_id !== 'string' || claim.allowed !== true) {
    throw new HttpError(429, 'Too many submissions. Please try again later.');
  }

  return { attemptId: claim.attempt_id };
};

const readJsonBody = async (req: Request) => {
  const contentLength = Number(req.headers.get('content-length') || '');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, 'Request body is too large.');
  }

  if (!req.body) return {};

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'Request body is too large.');
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpError(400, 'Invalid request body.');
  }
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
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Invalid request body.');
    }
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
      await finalizeAttempt(attempt.attemptId, true, null);
    } catch (actionError) {
      const reason = actionError instanceof HttpError ? 'rejected' : 'processing_error';
      await finalizeAttempt(attempt.attemptId, false, reason)
        .catch(() => null);
      throw actionError;
    }

    return jsonResponse(result, 200, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Could not process request';
    return jsonResponse({ ok: false, error: message }, status, origin);
  }
});
