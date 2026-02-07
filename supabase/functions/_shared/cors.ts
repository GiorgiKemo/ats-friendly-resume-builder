// supabase/functions/_shared/cors.ts
const isProd = Deno.env.get('NODE_ENV') === 'production';
const allowedOrigins = [
  Deno.env.get('CORS_ORIGIN_PROD'),
  Deno.env.get('CORS_ORIGIN'),
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean) as string[];

export const isOriginAllowed = (origin: string | null) => {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
};

export const getCorsHeaders = (origin: string | null) => {
  const corsOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : (allowedOrigins[0] || (isProd ? '' : '*'));

  return {
    ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

// Backwards-compatible default headers (no request origin)
export const corsHeaders = getCorsHeaders(null);
