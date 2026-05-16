import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { getClientIp, hashValue } from '../_shared/security.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const anonKey = Deno.env.get('SB_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('ANON_KEY') ||
  '';

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

const ERROR_REPORT_SCOPE = 'reportClientError';
const ERROR_REPORT_WINDOW_MS = 15 * 60 * 1000;
const ERROR_REPORT_MAX_ATTEMPTS = 20;
const ERROR_REPORT_MAX_IP_ATTEMPTS = 60;
const MAX_BODY_BYTES = 32 * 1024;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const jsonResponse = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });

const clamp = (value: unknown, maxLength: number, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
};

const normalizeSeverity = (value: unknown) => {
  if (value === 'info' || value === 'warning' || value === 'error' || value === 'critical') {
    return value;
  }
  return 'error';
};

const safeContext = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const getSessionUser = async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ') || !anonKey) return null;

  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
};

const recordAttempt = async (
  keyHash: string,
  ipHash: string,
  accepted: boolean,
  reason: string | null,
) => {
  const { error } = await adminClient.from('public_engagement_attempts').insert({
    scope: ERROR_REPORT_SCOPE,
    key_hash: keyHash,
    email_hash: 'not-applicable',
    ip_hash: ipHash,
    accepted,
    reason,
  });

  if (error) throw error;
};

const enforceRateLimit = async (req: Request, user: { id: string } | null) => {
  const ip = getClientIp(req);
  const key = user?.id ? `user:${user.id}` : `ip:${ip}`;
  const keyHash = await hashValue(`${ERROR_REPORT_SCOPE}:${key}`);
  const ipHash = await hashValue(ip);
  const windowStart = new Date(Date.now() - ERROR_REPORT_WINDOW_MS).toISOString();

  const { count: keyCount, error } = await adminClient
    .from('public_engagement_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('scope', ERROR_REPORT_SCOPE)
    .eq('key_hash', keyHash)
    .gte('created_at', windowStart);

  if (error) throw error;

  const { count: ipCount, error: ipError } = await adminClient
    .from('public_engagement_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('scope', ERROR_REPORT_SCOPE)
    .eq('ip_hash', ipHash)
    .gte('created_at', windowStart);

  if (ipError) throw ipError;

  const reason =
    (keyCount || 0) >= ERROR_REPORT_MAX_ATTEMPTS ? 'rate_limited_key' :
      (ipCount || 0) >= ERROR_REPORT_MAX_IP_ATTEMPTS ? 'rate_limited_ip' :
        null;

  if (reason) {
    await recordAttempt(keyHash, ipHash, false, reason);
    throw new HttpError(429, 'Too many error reports. Please try again later.');
  }

  return { keyHash, ipHash };
};

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500, origin);
  }

  try {
    const contentLength = Number(req.headers.get('Content-Length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Payload too large' }, 413, origin);
    }

    const body = await req.json().catch(() => ({}));
    const message = clamp(body.message, 2000, 'Unknown client error');

    if (!message.trim()) {
      return jsonResponse({ error: 'Missing error message' }, 400, origin);
    }

    const user = await getSessionUser(req);
    const attempt = await enforceRateLimit(req, user);
    const { error } = await adminClient.from('app_error_events').insert({
      user_id: user?.id || null,
      user_email: user?.email || '',
      severity: normalizeSeverity(body.severity),
      source: clamp(body.source, 120, 'client'),
      message,
      stack: clamp(body.stack, 8000, ''),
      context: safeContext(body.context),
      url: clamp(body.url, 2000, ''),
      user_agent: clamp(req.headers.get('User-Agent') || body.userAgent, 1200, ''),
    });

    if (error) throw error;

    await recordAttempt(attempt.keyHash, attempt.ipHash, true, null);

    return jsonResponse({ ok: true }, 200, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Could not record client error';
    return jsonResponse({ ok: false, error: message }, status, origin);
  }
});
