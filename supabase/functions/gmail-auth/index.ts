// supabase/functions/gmail-auth/index.ts
// Initiates Gmail OAuth flow — returns the Google consent URL.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';
import { createSignedOAuthState } from '../_shared/oauthState.ts';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const OAUTH_STATE_SECRET = Deno.env.get('GMAIL_OAUTH_STATE_SECRET') || GOOGLE_CLIENT_SECRET;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const isProd = Deno.env.get('NODE_ENV') !== 'development';

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  if (isProd && requestOrigin && !isOriginAllowed(requestOrigin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(requestOrigin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const authUser = await authenticateUser(req);
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (!GOOGLE_CLIENT_ID || !OAUTH_STATE_SECRET) {
    return new Response(JSON.stringify({ error: 'Gmail OAuth not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const state = await createSignedOAuthState({
    userId: authUser.userId,
    origin: requestOrigin || '',
    ts: Date.now(),
  }, OAUTH_STATE_SECRET);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return new Response(
    JSON.stringify({ url: authUrl }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
  );
});
