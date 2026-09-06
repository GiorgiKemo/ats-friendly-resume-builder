// supabase/functions/_shared/cors.ts
const isProd = Deno.env.get('NODE_ENV') !== 'development';

const parseAdditionalOrigins = () =>
  (Deno.env.get('CORS_ADDITIONAL_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const getAllowedOrigins = () => [
  Deno.env.get('CORS_ORIGIN_PROD'),
  Deno.env.get('CORS_ORIGIN'),
  'https://resumeats.cv',
  'https://www.resumeats.cv',
  'https://ats-friendly-resume-builder-pi.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  ...parseAdditionalOrigins(),
].filter(Boolean) as string[];

export const isOriginAllowed = (origin: string | null) => {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
};

export const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = getAllowedOrigins();
  const corsOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : (allowedOrigins[0] || (isProd ? '' : '*'));

  return {
    ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-type, x-request-timeout',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

// Backwards-compatible default headers (no request origin)
export const corsHeaders = getCorsHeaders(null);

// Shared auth helper: verifies the JWT and returns the user or null.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function authenticateUser(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
  const supabasePublicKey = Deno.env.get('SB_PUBLISHABLE_KEY') ||
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    Deno.env.get('ANON_KEY') ||
    '';
  if (!supabaseUrl || !supabasePublicKey) return null;

  const supabase = createClient(supabaseUrl, supabasePublicKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id };
}
