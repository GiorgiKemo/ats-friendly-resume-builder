import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';

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
    const body = await req.json().catch(() => ({}));
    const message = clamp(body.message, 2000, 'Unknown client error');

    if (!message.trim()) {
      return jsonResponse({ error: 'Missing error message' }, 400, origin);
    }

    const user = await getSessionUser(req);
    const { error } = await adminClient.from('app_error_events').insert({
      user_id: user?.id || null,
      user_email: user?.email || clamp(body.userEmail, 320, ''),
      severity: normalizeSeverity(body.severity),
      source: clamp(body.source, 120, 'client'),
      message,
      stack: clamp(body.stack, 8000, ''),
      context: safeContext(body.context),
      url: clamp(body.url, 2000, ''),
      user_agent: clamp(req.headers.get('User-Agent') || body.userAgent, 1200, ''),
    });

    if (error) throw error;

    return jsonResponse({ ok: true }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not record client error';
    return jsonResponse({ ok: false, error: message }, 400, origin);
  }
});
