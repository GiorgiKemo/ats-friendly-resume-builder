// supabase/functions/gmail-scan/index.ts
// Scans connected Gmail inboxes for replies to auto-apply emails.
// Uses OpenRouter primary and Groq fallback AI to classify replies as interview, rejection, follow_up, or generic.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';
import { resolveAllowedModel } from '../_shared/aiAccess.ts';
import { isSingleEmailAddress } from '../_shared/emailSafety.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || GROQ_MODEL;
const OPENROUTER_SITE_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://resumeats.cv';
const OPENROUTER_APP_TITLE = Deno.env.get('OPENROUTER_APP_TITLE') || 'ResumeATS';
const OPENROUTER_REASONING_EFFORT = Deno.env.get('OPENROUTER_REASONING_EFFORT') || 'minimal';
const AI_PROVIDER_ORDER = ['openrouter', 'groq'] as const;
const MAX_AI_PROVIDER_CALLS_PER_CLASSIFICATION = Math.max(
  1,
  Number(Boolean(OPENROUTER_API_KEY)) + Number(Boolean(GROQ_API_KEY)),
);
const MAX_APPLIED_JOBS = 500;
const MAX_CONTACT_EMAILS = 100;
const MAX_MESSAGES_PER_CONNECTION = 100;
const MAX_MESSAGE_BODY_CHARS = 20_000;

const isProd = Deno.env.get('NODE_ENV') !== 'development';
const log = (...args: unknown[]) => { if (!isProd) console.log('[gmail-scan]', ...args); };

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const firstRpcRow = <T>(data: T | T[] | null | undefined): T | null => (
  Array.isArray(data) ? data[0] || null : data || null
);

type GmailScanClaim =
  | { allowed: true; scanId: string }
  | { allowed: false; reason: string };

async function claimGmailScan(supabase: ReturnType<typeof adminClient>, userId: string): Promise<GmailScanClaim> {
  const { data, error } = await supabase.rpc('claim_gmail_scan', { p_user_id: userId });
  if (error) throw new Error('Could not claim Gmail scan budget');
  const claim = firstRpcRow(data as { allowed?: boolean; scan_id?: string; reason?: string } | Array<{ allowed?: boolean; scan_id?: string; reason?: string }>);
  if (!claim || claim.allowed !== true || typeof claim.scan_id !== 'string') {
    return { allowed: false, reason: typeof claim?.reason === 'string' ? claim.reason : 'budget_exhausted' };
  }
  return { allowed: true, scanId: claim.scan_id };
}

async function reserveGmailScanWork(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  scanId: string,
  messages: number,
  aiCalls: number,
) {
  const { data, error } = await supabase.rpc('reserve_gmail_scan_work', {
    p_user_id: userId,
    p_scan_id: scanId,
    p_messages: messages,
    p_ai_calls: aiCalls,
  });
  if (error) throw new Error('Could not reserve Gmail scan budget');
  const reservation = firstRpcRow(data as { allowed?: boolean } | Array<{ allowed?: boolean }>);
  return reservation?.allowed === true;
}

async function releaseGmailScan(supabase: ReturnType<typeof adminClient>, userId: string, scanId: string) {
  const { error } = await supabase.rpc('release_gmail_scan', { p_user_id: userId, p_scan_id: scanId });
  if (error) throw new Error('Could not release Gmail scan lease');
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

type AiProvider = typeof AI_PROVIDER_ORDER[number];

const hasAnyAiProvider = () => Boolean(OPENROUTER_API_KEY || GROQ_API_KEY);

function getAiProviderConfig(provider: AiProvider) {
  if (provider === 'openrouter') {
    return {
      apiKey: OPENROUTER_API_KEY,
      model: resolveAllowedModel(undefined, OPENROUTER_MODEL, 'OPENROUTER_ALLOWED_MODELS'),
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    };
  }

  return {
    apiKey: GROQ_API_KEY,
    model: resolveAllowedModel(undefined, GROQ_MODEL, 'GROQ_ALLOWED_MODELS'),
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
  };
}

async function callSingleAiProvider(
  provider: AiProvider,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 16,
): Promise<string> {
  const { apiKey, apiUrl, model } = getAiProviderConfig(provider);
  if (!apiKey) {
    throw new Error(`${provider} API key is missing`);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter' ? {
        'HTTP-Referer': OPENROUTER_SITE_URL,
        'X-Title': OPENROUTER_APP_TITLE,
      } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      ...(provider === 'openrouter' ? {
        reasoning: {
          effort: OPENROUTER_REASONING_EFFORT,
          exclude: true,
        },
      } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${provider} error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callAiProvider(messages: Array<{ role: string; content: string }>, maxTokens = 16): Promise<string> {
  let lastError: Error | null = null;

  for (const provider of AI_PROVIDER_ORDER) {
    try {
      return await callSingleAiProvider(provider, messages, maxTokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      lastError = error instanceof Error ? error : new Error(message);
      log(`${provider} AI unavailable; trying fallback if available:`, message);
    }
  }

  throw new Error(`AI providers unavailable: ${lastError?.message || 'unknown error'}`);
}

async function classifyReply(subject: string, body: string, company: string): Promise<string> {
  if (!hasAnyAiProvider()) return 'generic';
  try {
    const response = await callAiProvider([
      { role: 'system', content: 'Classify this email reply from a company to a job application into exactly one category: "interview" (scheduling interview/screen/assessment), "rejection" (declining/position filled), "follow_up" (asking for more info/documents), "generic" (automated receipt/unclear). Reply with ONLY the category name.' },
      { role: 'user', content: `Company: ${company}\nSubject: ${subject}\nBody: ${body.slice(0, 1500)}\n\nCategory:` },
    ]);
    const cat = response.toLowerCase().trim();
    return ['interview', 'rejection', 'follow_up', 'generic'].includes(cat) ? cat : 'generic';
  } catch { return 'generic'; }
}

function decodeBase64Url(data: string, maxChars = MAX_MESSAGE_BODY_CHARS): string {
  try {
    const bounded = data.slice(0, maxChars * 4);
    const binary = atob(bounded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))).slice(0, maxChars);
  } catch { return ''; }
}

interface GmailMsg { id: string; threadId: string; snippet: string; payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> } }

function getHeader(msg: GmailMsg, name: string): string {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function findReplyJob<T extends { id: string; company: string; contact_email?: string; gmail_thread_id?: string; gmail_message_id?: string }>(jobs: T[], msg: GmailMsg): T | undefined {
  const from = getHeader(msg, 'From').trim().toLowerCase();
  const senderEmail = from.match(/<([^<>]+)>\s*$/)?.[1] || from;
  const candidates = jobs.filter((job) => job.contact_email?.trim().toLowerCase() === senderEmail &&
    job.gmail_message_id !== msg.id);
  // Replies normally share the original outbound thread. Message IDs, not
  // thread IDs, distinguish a new reply from the email already processed.
  const inThread = candidates.filter((job) => job.gmail_thread_id === msg.threadId);
  if (inThread.length === 1) return inThread[0];
  if (inThread.length > 1) return undefined;
  const withoutThread = candidates.filter((job) => !job.gmail_thread_id);
  return withoutThread.length === 1 ? withoutThread[0] : undefined;
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

const buildGmailSearchQuery = (emails: unknown[]) => {
  const safeEmails = emails
    .filter((email): email is string => typeof email === 'string' && isSingleEmailAddress(email.trim()))
    .map((email) => email.trim().toLowerCase());
  return safeEmails.length > 0 ? `${safeEmails.map((email) => `from:${email}`).join(' OR ')} newer_than:7d` : '';
};

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
  const userId = authUser.userId;
  let scanId: string | null = null;
  let budgetExhausted = false;

  try {
    const claim = await claimGmailScan(supabase, userId);
    if (claim.allowed === false) {
      const isAlreadyRunning = claim.reason === 'already_running';
      return new Response(
        JSON.stringify({ success: false, error: isAlreadyRunning ? 'A Gmail scan is already in progress.' : 'Gmail scan budget reached. Please try again later.' }),
        { status: isAlreadyRunning ? 409 : 429, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }
    const activeScanId = claim.scanId;
    scanId = activeScanId;

    let query = supabase.from('gmail_connections').select('*').eq('is_active', true);
    if (targetUserId) query = query.eq('user_id', targetUserId);
    const { data: connections, error: connectionsError } = await query;
    if (connectionsError) throw new Error('Could not load Gmail connections');
    if (!Array.isArray(connections)) throw new Error('Could not load Gmail connections');

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No active Gmail connections', scanned: 0 }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    let totalClassified = 0;
    let failedConnections = 0;

    for (const conn of connections) {
      try {
        // Refresh token if needed
        let accessToken = conn.access_token;
        if (new Date(conn.token_expires_at) <= new Date(Date.now() + 60_000)) {
          const refreshed = await refreshAccessToken(conn.refresh_token);
          if (!refreshed) {
            const { error: disableError } = await supabase.from('gmail_connections').update({ is_active: false }).eq('id', conn.id);
            if (disableError) throw new Error('Could not disable the expired Gmail connection');
            continue;
          }
          accessToken = refreshed.accessToken;
          const { error: tokenUpdateError } = await supabase.from('gmail_connections').update({ access_token: refreshed.accessToken, token_expires_at: refreshed.expiresAt }).eq('id', conn.id);
          if (tokenUpdateError) throw new Error('Could not save the refreshed Gmail token');
        }

        // Get applied jobs for this user
        const { data: appliedJobs, error: appliedJobsError } = await supabase
          .from('auto_apply_jobs')
          .select('id, company, contact_email, title, gmail_thread_id, gmail_message_id')
          .eq('user_id', conn.user_id)
          .eq('status', 'applied')
          .limit(MAX_APPLIED_JOBS);

        if (appliedJobsError) throw new Error('Could not load applied jobs for Gmail scanning');
        if (!Array.isArray(appliedJobs) || appliedJobs.length === 0) continue;

        // Contact emails originate from external job data. Only exact single
        // addresses may enter Gmail search syntax; otherwise a crafted value
        // could broaden the inbox query with arbitrary Gmail operators.
        const contactEmails = [...new Set(appliedJobs.map(j => j.contact_email).filter(
          (email): email is string => typeof email === 'string' && isSingleEmailAddress(email.trim()),
        ).map((email) => email.trim().toLowerCase()))].slice(0, MAX_CONTACT_EMAILS);
        if (contactEmails.length === 0) continue;

        // Search Gmail for replies from these companies
        const batchSize = 10;
        let messagesFetched = 0;
        for (let i = 0; i < contactEmails.length && messagesFetched < MAX_MESSAGES_PER_CONNECTION; i += batchSize) {
          const batch = contactEmails.slice(i, i + batchSize);
          const searchQuery = buildGmailSearchQuery(batch);

          log(`Searching Gmail for ${batch.length} recruiter address${batch.length === 1 ? '' : 'es'}`);

          const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!listRes.ok) throw new Error('Gmail message search failed');
          const listData = await listRes.json();
          const messageRefs: Array<{ id: string }> = Array.isArray(listData?.messages)
            ? listData.messages.slice(0, MAX_MESSAGES_PER_CONNECTION)
            : [];

          for (const ref of messageRefs) {
            if (messagesFetched >= MAX_MESSAGES_PER_CONNECTION) break;
            if (!await reserveGmailScanWork(supabase, userId, activeScanId, 1, 0)) {
              budgetExhausted = true;
              break;
            }
            const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!msgRes.ok) throw new Error('Gmail message retrieval failed');
            messagesFetched++;

            const msg: GmailMsg = await msgRes.json();
            const subject = getHeader(msg, 'Subject');
            const body = getBody(msg);

            const matchedJob = findReplyJob(appliedJobs, msg);
            if (!matchedJob) continue;

            if (hasAnyAiProvider() && !await reserveGmailScanWork(
              supabase,
              userId,
              activeScanId,
              0,
              MAX_AI_PROVIDER_CALLS_PER_CLASSIFICATION,
            )) {
              budgetExhausted = true;
              break;
            }
            const category = await classifyReply(subject, body, matchedJob.company);
            log(`Reply from ${matchedJob.company}: ${category}`);

            const statusMap: Record<string, string> = { interview: 'interview', rejection: 'rejected', follow_up: 'replied', generic: 'replied' };

            const { data: updatedJob, error: updateError } = await supabase.from('auto_apply_jobs').update({
              status: statusMap[category] || 'replied',
              gmail_thread_id: msg.threadId,
              gmail_message_id: msg.id,
              replied_at: new Date().toISOString(),
            }).eq('id', matchedJob.id).eq('status', 'applied').select('id').maybeSingle();

            if (updateError) throw new Error('Could not save a classified Gmail reply');
            if (updatedJob) totalClassified++;
          }
          if (budgetExhausted) break;
        }
        if (budgetExhausted) break;
      } catch {
        failedConnections++;
        console.error('Error scanning a Gmail connection');
      }
    }

    if (failedConnections > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'One or more Gmail connections could not be scanned.', connections_scanned: connections.length, failed_connections: failedConnections, total_classified: totalClassified }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    if (budgetExhausted) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gmail scan budget reached. Please try again later.', connections_scanned: connections.length, total_classified: totalClassified }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, connections_scanned: connections.length, total_classified: totalClassified }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Gmail scan is temporarily unavailable.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  } finally {
    if (scanId) {
      await releaseGmailScan(supabase, userId, scanId).catch(() => log('Gmail scan lease release failed'));
    }
  }
});
