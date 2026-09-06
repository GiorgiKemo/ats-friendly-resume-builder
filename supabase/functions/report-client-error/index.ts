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

const sanitizeTelemetryUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const route = url.hash.slice(1).split(/[?#&]/, 1)[0];
    const safeRoute = /^\/[a-zA-Z0-9/_-]*$/.test(route) ? `#${route}` : '';
    return `${url.origin}${url.pathname}${safeRoute}`;
  } catch {
    return '';
  }
};

const sanitizeTelemetryText = (value: string): string => (
  value.replace(/https?:\/\/[^\s<>"'`]+/gi, sanitizeTelemetryUrl)
);

const sanitizeTelemetryValue = (value: unknown): unknown => {
  if (typeof value === 'string') return sanitizeTelemetryText(value);
  if (Array.isArray(value)) return value.map(sanitizeTelemetryValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeTelemetryValue(entry)]));
  }
  return value;
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
    const parsed = sanitizeTelemetryValue(JSON.parse(JSON.stringify(value)));
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

const finalizeAttempt = async (attemptId: string, accepted: boolean, reason: string | null) => {
  const { data, error } = await adminClient.rpc('finalize_public_engagement_attempt', {
    p_attempt_id: attemptId,
    p_accepted: accepted,
    p_reason: reason,
  });
  if (error) throw error;
  if (data !== true) throw new Error('Client error attempt could not be finalized');
};

const enforceRateLimit = async (req: Request, user: { id: string } | null) => {
  const ip = getClientIp(req);
  const key = user?.id ? `user:${user.id}` : `ip:${ip}`;
  const keyHash = await hashValue(`${ERROR_REPORT_SCOPE}:${key}`);
  const ipHash = await hashValue(ip);
  const windowStart = new Date(Date.now() - ERROR_REPORT_WINDOW_MS).toISOString();

  const { data, error } = await adminClient.rpc('claim_public_engagement_attempt', {
    p_scope: ERROR_REPORT_SCOPE,
    p_key_hash: keyHash,
    p_email_hash: 'not-applicable',
    p_ip_hash: ipHash,
    p_window_start: windowStart,
    p_max_attempts: ERROR_REPORT_MAX_ATTEMPTS,
    p_max_ip_attempts: ERROR_REPORT_MAX_IP_ATTEMPTS,
  });
  if (error) throw error;
  const claim = Array.isArray(data) ? data[0] : data;
  if (!claim || typeof claim.attempt_id !== 'string' || claim.allowed !== true) {
    throw new HttpError(429, 'Too many error reports. Please try again later.');
  }

  return { attemptId: claim.attempt_id };
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
    const message = clamp(sanitizeTelemetryText(typeof body.message === 'string' ? body.message : 'Unknown client error'), 2000);

    if (!message.trim()) {
      return jsonResponse({ error: 'Missing error message' }, 400, origin);
    }

    const user = await getSessionUser(req);
    const attempt = await enforceRateLimit(req, user);
    const { error } = await adminClient.from('app_error_events').insert({
      user_id: user?.id || null,
      user_email: user?.email || '',
      severity: normalizeSeverity(body.severity),
      source: clamp(sanitizeTelemetryText(typeof body.source === 'string' ? body.source : 'client'), 120),
      message,
      stack: clamp(sanitizeTelemetryText(typeof body.stack === 'string' ? body.stack : ''), 8000),
      context: safeContext(body.context),
      url: clamp(sanitizeTelemetryUrl(body.url), 2000),
      user_agent: clamp(sanitizeTelemetryText(req.headers.get('User-Agent') || (typeof body.userAgent === 'string' ? body.userAgent : '')), 1200),
    });

    if (error) throw error;

    await finalizeAttempt(attempt.attemptId, true, null);

    return jsonResponse({ ok: true }, 200, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof HttpError ? error.message : 'Could not record client error';
    return jsonResponse({ ok: false, error: message }, status, origin);
  }
});
