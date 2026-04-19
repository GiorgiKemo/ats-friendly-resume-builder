// supabase/functions/gmail-scan/index.ts
// Scans connected Gmail inboxes for replies to auto-apply emails.
// Uses Groq AI to classify replies as interview, rejection, follow_up, or generic.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile';

const isProd = Deno.env.get('NODE_ENV') === 'production';
const log = (...args: unknown[]) => { if (!isProd) console.log('[gmail-scan]', ...args); };

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { accessToken: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() };
  } catch { return null; }
}

async function callGroq(messages: Array<{ role: string; content: string }>, maxTokens = 16): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.3, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function classifyReply(subject: string, body: string, company: string): Promise<string> {
  if (!GROQ_API_KEY) return 'generic';
  try {
    const response = await callGroq([
      { role: 'system', content: 'Classify this email reply from a company to a job application into exactly one category: "interview" (scheduling interview/screen/assessment), "rejection" (declining/position filled), "follow_up" (asking for more info/documents), "generic" (automated receipt/unclear). Reply with ONLY the category name.' },
      { role: 'user', content: `Company: ${company}\nSubject: ${subject}\nBody: ${body.slice(0, 1500)}\n\nCategory:` },
    ]);
    const cat = response.toLowerCase().trim();
    return ['interview', 'rejection', 'follow_up', 'generic'].includes(cat) ? cat : 'generic';
  } catch { return 'generic'; }
}

function decodeBase64Url(data: string): string {
  try { return atob(data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; }
}

interface GmailMsg { id: string; threadId: string; snippet: string; payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> } }

function getHeader(msg: GmailMsg, name: string): string {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function getBody(msg: GmailMsg): string {
  if (msg.payload?.parts) {
    const text = msg.payload.parts.find(p => p.mimeType === 'text/plain');
    if (text?.body?.data) return decodeBase64Url(text.body.data);
    const html = msg.payload.parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return decodeBase64Url(html.body.data).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (msg.payload?.body?.data) return decodeBase64Url(msg.payload.body.data);
  return msg.snippet || '';
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  if (isProd && requestOrigin && !isOriginAllowed(requestOrigin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const cors = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors, status: 204 });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });

  let targetUserId: string | null = null;
  const authUser = await authenticateUser(req);
  if (authUser) targetUserId = authUser.userId;

  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  const supabase = adminClient();

  try {
    let query = supabase.from('gmail_connections').select('*').eq('is_active', true);
    if (targetUserId) query = query.eq('user_id', targetUserId);
    const { data: connections } = await query;

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No active Gmail connections', scanned: 0 }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    let totalClassified = 0;

    for (const conn of connections) {
      try {
        // Refresh token if needed
        let accessToken = conn.access_token;
        if (new Date(conn.token_expires_at) <= new Date(Date.now() + 60_000)) {
          const refreshed = await refreshAccessToken(conn.refresh_token);
          if (!refreshed) {
            await supabase.from('gmail_connections').update({ is_active: false }).eq('id', conn.id);
            continue;
          }
          accessToken = refreshed.accessToken;
          await supabase.from('gmail_connections').update({ access_token: refreshed.accessToken, token_expires_at: refreshed.expiresAt }).eq('id', conn.id);
        }

        // Get applied jobs for this user
        const { data: appliedJobs } = await supabase
          .from('auto_apply_jobs')
          .select('id, company, contact_email, title, gmail_thread_id')
          .eq('user_id', conn.user_id)
          .eq('status', 'applied');

        if (!appliedJobs || appliedJobs.length === 0) continue;

        const contactEmails = [...new Set(appliedJobs.map(j => j.contact_email).filter(Boolean))];
        if (contactEmails.length === 0) continue;

        // Search Gmail for replies from these companies
        const batchSize = 10;
        for (let i = 0; i < contactEmails.length; i += batchSize) {
          const batch = contactEmails.slice(i, i + batchSize);
          const searchQuery = batch.map(e => `from:${e}`).join(' OR ') + ' newer_than:7d';

          log(`Searching: ${searchQuery}`);

          const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!listRes.ok) continue;
          const listData = await listRes.json();
          const messageRefs: Array<{ id: string }> = listData.messages || [];

          for (const ref of messageRefs) {
            const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!msgRes.ok) continue;

            const msg: GmailMsg = await msgRes.json();
            const fromHeader = getHeader(msg, 'From').toLowerCase();
            const subject = getHeader(msg, 'Subject');
            const body = getBody(msg);

            const matchedJob = appliedJobs.find(j => j.contact_email && fromHeader.includes(j.contact_email.toLowerCase()));
            if (!matchedJob || matchedJob.gmail_thread_id === msg.threadId) continue;

            const category = await classifyReply(subject, body, matchedJob.company);
            log(`Reply from ${matchedJob.company}: ${category}`);

            const statusMap: Record<string, string> = { interview: 'interview', rejection: 'rejected', follow_up: 'replied', generic: 'replied' };

            await supabase.from('auto_apply_jobs').update({
              status: statusMap[category] || 'replied',
              gmail_thread_id: msg.threadId,
              gmail_message_id: msg.id,
              replied_at: new Date().toISOString(),
            }).eq('id', matchedJob.id);

            totalClassified++;
          }
        }
      } catch (err) {
        console.error(`Error scanning ${conn.email}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, connections_scanned: connections.length, total_classified: totalClassified }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
});
