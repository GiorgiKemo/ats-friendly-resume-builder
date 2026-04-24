// supabase/functions/gmail-disconnect/index.ts
// Disconnects Gmail — revokes Google token and deletes the record.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const isProd = Deno.env.get('NODE_ENV') === 'production';

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  if (isProd && requestOrigin && !isOriginAllowed(requestOrigin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(requestOrigin);

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors, status: 204 });
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

  const supabase = adminClient();

  try {
    const { data: conn } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', authUser.userId)
      .single();

    if (!conn) {
      return new Response(JSON.stringify({ error: 'No Gmail connection found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Revoke tokens (best effort)
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${conn.access_token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch { /* non-fatal */ }

    await supabase.from('gmail_connections').delete().eq('user_id', authUser.userId);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
});
