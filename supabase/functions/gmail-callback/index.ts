// supabase/functions/gmail-callback/index.ts
// Handles the OAuth callback from Google — exchanges code for tokens, stores them.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySignedOAuthState } from '../_shared/oauthState.ts';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const OAUTH_STATE_SECRET = Deno.env.get('GMAIL_OAUTH_STATE_SECRET') || GOOGLE_CLIENT_SECRET;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-callback`;

const PROD_APP_URL = 'https://resumeats.cv/#/auto-apply';
const DEV_APP_URL = 'http://localhost:5174/#/auto-apply';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  let userId = '';
  let appBaseUrl = PROD_APP_URL;

  if (stateParam) {
    try {
      const decoded = await verifySignedOAuthState(
        stateParam,
        OAUTH_STATE_SECRET,
        OAUTH_STATE_MAX_AGE_MS,
      );

      if (!decoded) {
        console.error('Invalid Gmail OAuth state parameter');
      } else {
        userId = decoded.userId;
      }

      if (decoded?.origin && decoded.origin.includes('localhost')) {
        appBaseUrl = DEV_APP_URL;
      }
    } catch {
      console.error('Failed to verify Gmail OAuth state parameter');
    }
  }

  if (error) {
    return Response.redirect(`${appBaseUrl}?gmail=error&reason=${encodeURIComponent(error)}`, 302);
  }

  if (!code || !userId) {
    return Response.redirect(`${appBaseUrl}?gmail=error&reason=missing_params`, 302);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Gmail token exchange failed with status:', tokenRes.status);
      return Response.redirect(`${appBaseUrl}?gmail=error&reason=token_exchange_failed`, 302);
    }

    const tokens = await tokenRes.json();
    const accessToken: string = tokens.access_token;
    const refreshToken: string = tokens.refresh_token;
    const expiresIn: number = tokens.expires_in || 3600;
    const scope: string = tokens.scope || '';

    if (!accessToken || !refreshToken) {
      console.error('Google OAuth token response did not include required tokens');
      return Response.redirect(`${appBaseUrl}?gmail=error&reason=missing_tokens`, 302);
    }

    // Get Gmail address
    let gmailAddress = '';
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      gmailAddress = profile.email || '';
    }

    if (!gmailAddress) {
      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (gmailRes.ok) {
        const gmailProfile = await gmailRes.json();
        gmailAddress = gmailProfile.emailAddress || '';
      }
    }

    if (!gmailAddress) {
      return Response.redirect(`${appBaseUrl}?gmail=error&reason=no_email`, 302);
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store in database (upsert)
    const supabase = adminClient();
    const { error: dbError } = await supabase
      .from('gmail_connections')
      .upsert({
        user_id: userId,
        email: gmailAddress,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        scopes: scope,
        connected_at: new Date().toISOString(),
        is_active: true,
      }, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Gmail connection storage failed with code:', dbError.code || 'unknown');
      return Response.redirect(`${appBaseUrl}?gmail=error&reason=db_error`, 302);
    }

    return Response.redirect(`${appBaseUrl}?gmail=connected&email=${encodeURIComponent(gmailAddress)}`, 302);
  } catch {
    console.error('Gmail callback failed');
    return Response.redirect(`${appBaseUrl}?gmail=error&reason=internal_error`, 302);
  }
});
