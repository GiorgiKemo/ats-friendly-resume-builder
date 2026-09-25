// supabase/functions/job-inbox-scan/index.ts
// Scans connected Gmail for job-hunt mail, stores durable events, and updates
// job_applications with application-level dedupe (never count emails as apps).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';
import {
  hasAnalyticsConsent,
  recordAiGenerationEvent,
  resolveAllowedModel,
} from '../_shared/aiAccess.ts';
import { readBoundedResponseText } from '../_shared/aiRequestValidation.ts';
import {
  AppRow,
  buildDedupeKey,
  computeHuntStats,
  findMatchingApplication,
  mergeStatus,
  parseClassifierResponse,
  shouldCreateApplication,
} from '../_shared/jobInboxDedupe.ts';

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
const OPENROUTER_SITE_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://www.resumeats.cv';
const OPENROUTER_APP_TITLE = Deno.env.get('OPENROUTER_APP_TITLE') || 'ResumeATS';
const OPENROUTER_REASONING_EFFORT = Deno.env.get('OPENROUTER_REASONING_EFFORT') || 'minimal';
const AI_PROVIDER_ORDER = ['openrouter', 'groq'] as const;
const MAX_AI_PROVIDER_CALLS = Math.max(1, Number(Boolean(OPENROUTER_API_KEY)) + Number(Boolean(GROQ_API_KEY)));
const MAX_MESSAGES = 80;
const MAX_MESSAGE_BODY_CHARS = 20_000;
const SEARCH_NEWER_THAN = 'newer_than:30d';

const isProd = Deno.env.get('NODE_ENV') !== 'development';
const log = (...args: unknown[]) => { if (!isProd) console.log('[job-inbox-scan]', ...args); };

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const firstRpcRow = <T>(data: T | T[] | null | undefined): T | null => (
  Array.isArray(data) ? data[0] || null : data || null
);

async function claimGmailScan(supabase: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await supabase.rpc('claim_gmail_scan', { p_user_id: userId });
  if (error) throw new Error('Could not claim Gmail scan budget');
  const claim = firstRpcRow(data as { allowed?: boolean; scan_id?: string; reason?: string } | Array<{ allowed?: boolean; scan_id?: string; reason?: string }>);
  if (!claim || claim.allowed !== true || typeof claim.scan_id !== 'string') {
    return { allowed: false as const, reason: typeof claim?.reason === 'string' ? claim.reason : 'budget_exhausted' };
  }
  return { allowed: true as const, scanId: claim.scan_id };
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

async function abortGmailScan(supabase: ReturnType<typeof adminClient>, userId: string, scanId: string) {
  const { error } = await supabase.rpc('abort_gmail_scan', { p_user_id: userId, p_scan_id: scanId });
  if (error) {
    // Fall back to a normal release if the abort migration is not applied yet.
    await releaseGmailScan(supabase, userId, scanId);
  }
}

const claimDeniedMessage = (reason: string | undefined) => {
  switch (reason) {
    case 'already_running':
      return 'A Gmail scan is already in progress. Wait a moment and try again.';
    case 'cooldown':
      return 'Please wait a few minutes before scanning again.';
    case 'daily_scan_limit':
      return 'Daily Gmail scan limit reached. Try again tomorrow.';
    case 'daily_message_limit':
    case 'daily_ai_limit':
    case 'budget_exhausted':
      return 'Gmail scan budget reached. Please try again later.';
    default:
      return 'Gmail scan is temporarily limited. Please try again later.';
  }
};

class ScanRequestError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ScanRequestError';
    this.status = status;
  }
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
  } catch {
    return null;
  }
}

type AiProvider = typeof AI_PROVIDER_ORDER[number];
type AiAnalyticsContext = { userId: string; consented: boolean };

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
  maxTokens = 220,
): Promise<string> {
  const { apiKey, apiUrl, model } = getAiProviderConfig(provider);
  if (!apiKey) throw new Error(`${provider} API key is missing`);

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
      temperature: 0.2,
      max_tokens: maxTokens,
      ...(provider === 'openrouter' ? {
        reasoning: { effort: OPENROUTER_REASONING_EFFORT, exclude: true },
      } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${provider} error ${res.status}`);
  const data = JSON.parse(await readBoundedResponseText(res)) as Record<string, unknown>;
  const choice = Array.isArray(data.choices) ? data.choices[0] as { message?: { content?: string } } : null;
  return choice?.message?.content?.trim() || '';
}

async function callAiProvider(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 220,
  analyticsContext?: AiAnalyticsContext,
): Promise<string> {
  const attemptId = analyticsContext ? crypto.randomUUID() : '';
  const startedAt = Date.now();
  if (attemptId && analyticsContext) {
    await recordAiGenerationEvent({
      consented: analyticsContext.consented,
      attemptId,
      userId: analyticsContext.userId,
      eventName: 'ai_generation_started',
      feature: 'job_inbox_classification',
      provider: 'fallback_chain',
    });
  }

  let lastError: Error | null = null;
  for (const provider of AI_PROVIDER_ORDER) {
    try {
      const response = await callSingleAiProvider(provider, messages, maxTokens);
      if (attemptId && analyticsContext) {
        await recordAiGenerationEvent({
          consented: analyticsContext.consented,
          attemptId,
          userId: analyticsContext.userId,
          eventName: 'ai_generation_completed',
          feature: 'job_inbox_classification',
          provider,
          model: getAiProviderConfig(provider).model,
          durationMs: Date.now() - startedAt,
        });
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log(`${provider} unavailable:`, lastError.message);
    }
  }

  if (attemptId && analyticsContext) {
    await recordAiGenerationEvent({
      consented: analyticsContext.consented,
      attemptId,
      userId: analyticsContext.userId,
      eventName: 'ai_generation_failed',
      feature: 'job_inbox_classification',
      provider: 'fallback_chain',
      durationMs: Date.now() - startedAt,
      failureCode: 'provider_unavailable',
    });
  }
  throw new Error(`AI providers unavailable: ${lastError?.message || 'unknown'}`);
}

function decodeBase64Url(data: string, maxChars = MAX_MESSAGE_BODY_CHARS): string {
  try {
    const bounded = data.slice(0, maxChars * 4);
    const binary = atob(bounded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))).slice(0, maxChars);
  } catch {
    return '';
  }
}

interface GmailMsg {
  id: string;
  threadId: string;
  snippet: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> }>;
  };
}

function getHeader(msg: GmailMsg, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractEmail(headerValue: string): string {
  const from = (headerValue || '').trim().toLowerCase();
  return from.match(/<([^<>]+)>\s*$/)?.[1] || from;
}

function getBody(msg: GmailMsg): string {
  const collect = (parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: unknown }>): string => {
    if (!Array.isArray(parts)) return '';
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      const nested = collect(part.parts as typeof parts);
      if (nested) return nested;
    }
    return '';
  };
  const fromParts = collect(msg.payload?.parts);
  if (fromParts) return fromParts;
  if (msg.payload?.body?.data) return decodeBase64Url(msg.payload.body.data);
  return msg.snippet || '';
}

function buildInboxSearchQuery(companies: string[]): string {
  const terms = [
    '("thank you for applying" OR "thanks for applying" OR "application received" OR "we received your application")',
    '(interview OR "phone screen" OR "next steps" OR calendly OR "schedule a call")',
    '("unfortunately" OR "not moving forward" OR "other candidates" OR "position has been filled")',
    '(offer OR "compensation package" OR "pleased to offer")',
  ];
  const companyClause = companies
    .slice(0, 15)
    .map((c) => `"${c.replace(/"/g, '')}"`)
    .filter(Boolean);
  if (companyClause.length) {
    terms.push(`(${companyClause.join(' OR ')})`);
  }
  return `(${terms.join(' OR ')}) ${SEARCH_NEWER_THAN}`;
}

async function classifyInboxMessage(
  subject: string,
  body: string,
  knownCompanies: string[],
  analyticsContext?: AiAnalyticsContext,
) {
  if (!hasAnyAiProvider()) {
    return parseClassifierResponse('{"category":"unknown","confidence":0.2,"company":"","position":"","reason":"no AI"}');
  }
  const response = await callAiProvider([
    {
      role: 'system',
      content: `You classify job-hunt emails for a job seeker. Reply with ONLY JSON:
{"category":"application_sent|application_receipt|reply|interview|rejection|offer|recruiter_outreach|noise|unknown","confidence":0.0-1.0,"company":"string","position":"string","reason":"short"}
Rules:
- application_sent: user applied / submitted resume
- application_receipt: company/ATS confirms application received
- reply: company asks a question or requests info (not interview)
- interview: invites to screen/interview/assessment scheduling
- rejection: declined / filled / moved forward with others
- offer: job offer
- recruiter_outreach: cold inbound not tied to an application the user sent
- noise: newsletters, LinkedIn digests, unrelated
Never invent a company. Prefer empty company/position over guesses.`,
    },
    {
      role: 'user',
      content: `Known companies: ${knownCompanies.slice(0, 30).join(', ') || '(none)'}\nSubject: ${subject}\nBody: ${body.slice(0, 1500)}\n\nJSON:`,
    },
  ], 220, analyticsContext);
  return parseClassifierResponse(response);
}

function heuristicDirection(fromEmail: string, connectedEmail: string): 'inbound' | 'outbound' {
  const from = (fromEmail || '').toLowerCase();
  const me = (connectedEmail || '').toLowerCase();
  if (me && from === me) return 'outbound';
  return 'inbound';
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  if (isProd && requestOrigin && !isOriginAllowed(requestOrigin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const cors = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors, status: 204 });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const authUser = await authenticateUser(req);
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const supabase = adminClient();
  const userId = authUser.userId;
  const aiAnalyticsContext = { userId, consented: hasAnalyticsConsent(req) };
  let scanId: string | null = null;
  let budgetExhausted = false;
  let scanFailed = false;

  try {
    const claim = await claimGmailScan(supabase, userId);
    if (claim.allowed === false) {
      const isAlreadyRunning = claim.reason === 'already_running';
      const isCooldown = claim.reason === 'cooldown';
      return new Response(
        JSON.stringify({
          success: false,
          reason: claim.reason || 'budget_exhausted',
          error: claimDeniedMessage(claim.reason),
        }),
        {
          status: isAlreadyRunning ? 409 : isCooldown ? 429 : 429,
          headers: { 'Content-Type': 'application/json', ...cors },
        },
      );
    }
    scanId = claim.scanId;

    const { data: connections, error: connectionsError } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (connectionsError) throw new Error('Could not load Gmail connections');
    if (!connections?.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active Gmail connections', scanned: 0, newEvents: 0, createdApplications: 0, updatedApplications: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    const { data: existingApps, error: appsError } = await supabase
      .from('job_applications')
      .select('id, company, position, status, dedupe_key, gmail_thread_id, applied_at, response_at, previous_status')
      .eq('user_id', userId);
    if (appsError) throw new Error('Could not load applications');

    let applications: AppRow[] = Array.isArray(existingApps) ? [...existingApps] : [];
    const knownCompanies = [...new Set(applications.map((a) => a.company).filter(Boolean))];

    let scanned = 0;
    let newEvents = 0;
    let createdApplications = 0;
    let updatedApplications = 0;
    const statusChanges: Array<{ applicationId: string; from: string; to: string; eventId: string }> = [];

    for (const conn of connections) {
      let accessToken = conn.access_token as string;
      if (new Date(conn.token_expires_at) <= new Date(Date.now() + 60_000)) {
        const refreshed = await refreshAccessToken(conn.refresh_token);
        if (!refreshed) {
          await supabase.from('gmail_connections').update({ is_active: false }).eq('id', conn.id);
          throw new ScanRequestError('Gmail access expired. Disconnect and connect Gmail again.', 401);
        }
        accessToken = refreshed.accessToken;
        await supabase.from('gmail_connections').update({
          access_token: refreshed.accessToken,
          token_expires_at: refreshed.expiresAt,
        }).eq('id', conn.id);
      }

      const searchQuery = buildInboxSearchQuery(knownCompanies);
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${MAX_MESSAGES}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!listRes.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
          await supabase.from('gmail_connections').update({ is_active: false }).eq('id', conn.id);
          throw new ScanRequestError('Gmail access was denied. Disconnect and connect Gmail again.', 401);
        }
        throw new ScanRequestError('Gmail inbox search failed. Please try again in a moment.', 502);
      }
      const listData = await listRes.json();
      const messageRefs: Array<{ id: string }> = Array.isArray(listData?.messages) ? listData.messages : [];

      for (const ref of messageRefs) {
        if (scanned >= MAX_MESSAGES) break;
        if (!await reserveGmailScanWork(supabase, userId, scanId, 1, 0)) {
          budgetExhausted = true;
          break;
        }

        // Skip already-processed messages
        const { data: existingEvent } = await supabase
          .from('job_inbox_events')
          .select('id')
          .eq('user_id', userId)
          .eq('gmail_message_id', ref.id)
          .maybeSingle();
        if (existingEvent) {
          scanned += 1;
          continue;
        }

        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!msgRes.ok) {
          if (msgRes.status === 401 || msgRes.status === 403) {
            await supabase.from('gmail_connections').update({ is_active: false }).eq('id', conn.id);
            throw new ScanRequestError('Gmail access was denied. Disconnect and connect Gmail again.', 401);
          }
          throw new ScanRequestError('Could not read a Gmail message. Please try again.', 502);
        }
        scanned += 1;

        const msg: GmailMsg = await msgRes.json();
        const subject = getHeader(msg, 'Subject');
        const body = getBody(msg);
        const fromEmail = extractEmail(getHeader(msg, 'From'));
        const toEmail = extractEmail(getHeader(msg, 'To'));
        const direction = heuristicDirection(fromEmail, conn.email);
        const internalDate = msg.internalDate
          ? new Date(Number(msg.internalDate)).toISOString()
          : new Date().toISOString();

        if (hasAnyAiProvider() && !await reserveGmailScanWork(supabase, userId, scanId, 0, MAX_AI_PROVIDER_CALLS)) {
          budgetExhausted = true;
          break;
        }

        let classified;
        try {
          classified = await classifyInboxMessage(subject, body, knownCompanies, aiAnalyticsContext);
        } catch {
          classified = parseClassifierResponse('{"category":"unknown","confidence":0.2}');
        }

        // Outbound apply-like mail without AI certainty
        if (direction === 'outbound' && classified.category === 'unknown') {
          const lower = `${subject} ${body}`.toLowerCase();
          if (/\b(application|resume|cv|applying|attached)\b/.test(lower)) {
            classified = {
              ...classified,
              category: 'application_sent',
              confidence: Math.max(classified.confidence, 0.7),
              reason: classified.reason || 'outbound apply heuristic',
            };
          }
        }

        const companyGuess = classified.company || '';
        const positionGuess = classified.position || '';
        const dedupeKey = buildDedupeKey(companyGuess, positionGuess);

        let match = findMatchingApplication(applications, {
          gmailThreadId: msg.threadId,
          dedupeKey,
          company: companyGuess || null,
        });

        let statusApplied = false;
        let previousStatus: string | null = null;
        let applicationId: string | null = match?.id || null;

        if (!match && shouldCreateApplication(classified.category) && dedupeKey && companyGuess && positionGuess) {
          const { data: inserted, error: insertError } = await supabase
            .from('job_applications')
            .insert({
              user_id: userId,
              company: companyGuess,
              position: positionGuess,
              status: 'applied',
              dedupe_key: dedupeKey,
              gmail_thread_id: msg.threadId,
              source: 'inbox',
              applied_at: internalDate,
              last_email_at: internalDate,
            })
            .select('id, company, position, status, dedupe_key, gmail_thread_id, applied_at, response_at, previous_status')
            .maybeSingle();

          if (insertError && insertError.code === '23505') {
            // Unique violation — load existing
            const { data: existing } = await supabase
              .from('job_applications')
              .select('id, company, position, status, dedupe_key, gmail_thread_id, applied_at, response_at, previous_status')
              .eq('user_id', userId)
              .eq('dedupe_key', dedupeKey)
              .maybeSingle();
            if (existing) {
              match = existing;
              applicationId = existing.id;
              if (!applications.some((a) => a.id === existing.id)) applications.push(existing);
            }
          } else if (insertError) {
            throw new Error('Could not create application from inbox event');
          } else if (inserted) {
            applications.push(inserted);
            match = inserted;
            applicationId = inserted.id;
            createdApplications += 1;
            knownCompanies.push(inserted.company);
          }
        }

        if (match) {
          applicationId = match.id;
          const nextStatus = mergeStatus(match.status, classified.category, {
            confidence: classified.confidence,
          });
          const updates: Record<string, unknown> = {
            last_email_at: internalDate,
          };
          if (!match.gmail_thread_id && msg.threadId) updates.gmail_thread_id = msg.threadId;
          if (!match.dedupe_key && dedupeKey) updates.dedupe_key = dedupeKey;

          if (nextStatus) {
            previousStatus = match.status;
            updates.status = nextStatus;
            updates.previous_status = match.status;
            if (['screening', 'interview', 'offer', 'rejected'].includes(nextStatus) && !match.response_at) {
              updates.response_at = internalDate;
            }
            if (nextStatus !== 'saved' && !match.applied_at) {
              updates.applied_at = internalDate;
            }
            statusApplied = true;
          }

          const { data: updated, error: updateError } = await supabase
            .from('job_applications')
            .update(updates)
            .eq('id', match.id)
            .eq('user_id', userId)
            .select('id, company, position, status, dedupe_key, gmail_thread_id, applied_at, response_at, previous_status')
            .maybeSingle();
          if (updateError) throw new Error('Could not update application from inbox event');
          if (updated) {
            const idx = applications.findIndex((a) => a.id === updated.id);
            if (idx >= 0) applications[idx] = updated;
            if (statusApplied) {
              updatedApplications += 1;
            }
          }
        }

        const { data: eventRow, error: eventError } = await supabase
          .from('job_inbox_events')
          .insert({
            user_id: userId,
            gmail_message_id: msg.id,
            gmail_thread_id: msg.threadId,
            direction,
            from_email: fromEmail.slice(0, 320),
            to_email: toEmail.slice(0, 320),
            subject: subject.slice(0, 500),
            snippet: (msg.snippet || body).slice(0, 500),
            internal_date: internalDate,
            category: classified.category,
            confidence: classified.confidence,
            application_id: applicationId,
            dedupe_key: dedupeKey,
            company_guess: companyGuess.slice(0, 200) || null,
            position_guess: positionGuess.slice(0, 200) || null,
            classifier_reason: (classified.reason || '').slice(0, 300) || null,
            raw_classifier: classified,
            status_applied: statusApplied,
            previous_application_status: previousStatus,
          })
          .select('id')
          .maybeSingle();

        if (eventError) {
          if (eventError.code === '23505') {
            // Race: another scan inserted the same message
            continue;
          }
          throw new Error('Could not store inbox event');
        }

        newEvents += 1;
        if (statusApplied && applicationId && previousStatus && eventRow?.id) {
          statusChanges.push({
            applicationId,
            from: previousStatus,
            to: String((applications.find((a) => a.id === applicationId) || match)?.status || ''),
            eventId: eventRow.id,
          });
        }
      }

      if (budgetExhausted) break;
    }

    const stats = computeHuntStats(applications);

    if (budgetExhausted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Gmail scan budget reached. Please try again later.',
          scanned,
          newEvents,
          createdApplications,
          updatedApplications,
          statusChanges,
          stats,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned,
        newEvents,
        createdApplications,
        updatedApplications,
        statusChanges,
        stats,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  } catch (error) {
    scanFailed = true;
    log('scan failed', error instanceof Error ? error.message : error);
    if (error instanceof ScanRequestError) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: error.status, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }
    return new Response(
      JSON.stringify({ error: 'Job Inbox scan is temporarily unavailable.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  } finally {
    if (scanId) {
      if (scanFailed) {
        await abortGmailScan(supabase, userId, scanId).catch(() => log('lease abort failed'));
      } else {
        await releaseGmailScan(supabase, userId, scanId).catch(() => log('lease release failed'));
      }
    }
  }
});
