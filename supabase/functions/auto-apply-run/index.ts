// supabase/functions/auto-apply-run/index.ts
// Edge function that runs one auto-apply cycle:
//   1. Load user preferences + resume
//   2. Search for matching jobs via Bright Data LinkedIn and/or JSearch
//   3. Score & filter matches with AI (OpenRouter primary, Groq fallback)
//   4. Queue jobs for browser-side apply, or optionally send outreach emails
//   5. Log everything to the database

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';
import { sendViaGmail } from '../_shared/gmailSend.ts';
import { resolveAllowedModel } from '../_shared/aiAccess.ts';
import { buildApplicationEmailHtml, isSingleEmailAddress } from '../_shared/emailSafety.ts';
import { fetchPublicWebpage, UnsafeWebDestinationError } from '../_shared/publicWebFetch.ts';
import {
  assertResumePackageCurrent,
  createResumeAttachmentPackage,
  getPublicKey,
  loadOwnedResumeSnapshot,
  loadResumeFontData,
} from './resumeAttachment.ts';
import { buildResumeTextLines } from '../_shared/resume/exportText.js';

// ── Environment ──────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || GROQ_MODEL;
const OPENROUTER_SITE_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://resumeats.cv';
const OPENROUTER_APP_TITLE = Deno.env.get('OPENROUTER_APP_TITLE') || 'ResumeATS';
const OPENROUTER_REASONING_EFFORT = Deno.env.get('OPENROUTER_REASONING_EFFORT') || 'minimal';
const AI_PROVIDER_ORDER = ['openrouter', 'groq'] as const;
const JSEARCH_API_KEY = Deno.env.get('JSEARCH_API_KEY') || '';
const BRIGHT_DATA_API_TOKEN = Deno.env.get('BRIGHT_DATA_API_TOKEN') || Deno.env.get('BRIGHT_DATA_TOKEN') || '';
const BRIGHT_DATA_LINKEDIN_DATASET_ID = Deno.env.get('BRIGHT_DATA_LINKEDIN_DATASET_ID') || 'gd_lpfll7v5hcqtkxl6l';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
const SENDER_EMAIL = Deno.env.get('AUTO_APPLY_SENDER_EMAIL') || 'apply@resumeats.cv';
const SENDER_NAME_DEFAULT = 'ResumeATS';
// Inbound reply-to domain — replies to apply+{jobId}@resumeats.cv trigger the webhook
const REPLY_DOMAIN = Deno.env.get('AUTO_APPLY_REPLY_DOMAIN') || 'resumeats.cv';

const isProd = Deno.env.get('NODE_ENV') !== 'development';
const log = (...args: unknown[]) => { if (!isProd) console.log('[auto-apply]', ...args); };

// ── Types ────────────────────────────────────────────────────────────────
interface JobPreferences {
  id: string;
  user_id: string;
  job_titles: string[];
  skills: string[];
  locations: string[];
  remote_preference: string;
  experience_level: string;
  salary_min: number | null;
  salary_max: number | null;
  industries: string[];
  excluded_companies: string[];
  is_active: boolean;
  daily_limit: number;
  speed: string;
  sender_name: string | null;
  reply_to_email: string | null;
  default_resume_id: string | null;
}

interface DiscoveredJob {
  title: string;
  company: string;
  location: string;
  salary_range: string;
  job_url: string;
  contact_email: string;
  job_description: string;
  source: string;
  external_job_id: string;
  employer_website: string;
}

interface AutoApplyRunRequestBody {
  user_id?: string;
  discover_only?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AiProvider = typeof AI_PROVIDER_ORDER[number];

const hasAnyAiProvider = () => Boolean(OPENROUTER_API_KEY || GROQ_API_KEY);

const capPreferenceStrings = (value: unknown, maxItems: number, maxLength: number) =>
  (Array.isArray(value) ? value : [])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);

const normalizeSalaryPreference = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100_000_000
    ? Math.round(numeric)
    : null;
};

/**
 * Convert a provider salary label into an annual numeric range when its unit
 * is clear enough to compare with the user's annual salary preferences. Hourly
 * labels stay unknown rather than pretending that a currency/unit conversion
 * is exact across countries and contracts.
 */
const parseAnnualSalaryRange = (value: unknown): { min: number; max: number } | null => {
  const text = `${value ?? ''}`.trim().toLowerCase();
  if (!text || /\b(?:hour|hourly|hr)\b/.test(text)) return null;

  const matches = [...text.matchAll(/(?:[$€£]\s*)?(\d+(?:[.,]\d+)*)(?:\s*(k|thousand|m|million)\b)?/gi)];
  const values = matches
    .map((match) => {
      const base = Number.parseFloat(match[1].replace(/,/g, ''));
      if (!Number.isFinite(base)) return null;
      const suffix = (match[2] || '').toLowerCase();
      const multiplier = suffix === 'k' || suffix === 'thousand'
        ? 1_000
        : suffix === 'm' || suffix === 'million'
          ? 1_000_000
          : 1;
      return base * multiplier;
    })
    .filter((number): number is number => number !== null && number >= 0 && number <= 100_000_000);

  if (values.length === 0) return null;
  const periodMultiplier = /\b(?:month|monthly)\b/.test(text)
    ? 12
    : /\b(?:week|weekly)\b/.test(text)
      ? 52
      : /\b(?:day|daily)\b/.test(text)
        ? 260
        : 1;
  const annualValues = values.map((number) => number * periodMultiplier);
  return { min: Math.min(...annualValues), max: Math.max(...annualValues) };
};

const salaryMatchesPreferences = (salaryRange: unknown, salaryMin: unknown, salaryMax: unknown): boolean => {
  const minimum = normalizeSalaryPreference(salaryMin);
  const maximum = normalizeSalaryPreference(salaryMax);
  if (minimum === null && maximum === null) return true;
  if (minimum !== null && maximum !== null && minimum > maximum) return false;

  const parsed = parseAnnualSalaryRange(salaryRange);
  // Unknown provider compensation stays discoverable. The user can review it,
  // while a known, non-overlapping range is filtered deterministically.
  if (!parsed) return true;
  if (minimum !== null && parsed.max < minimum) return false;
  if (maximum !== null && parsed.min > maximum) return false;
  return true;
};

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
  maxTokens = 1024,
): Promise<string> {
  const { apiKey, apiUrl, model } = getAiProviderConfig(provider);
  if (!apiKey) {
    throw new Error(`${provider} API key is missing`);
  }

  const res = await fetch(apiUrl, {
    signal: AbortSignal.timeout(15000),
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
      temperature: 0.7,
      max_tokens: maxTokens,
      ...(provider === 'openrouter' ? {
        reasoning: {
          effort: OPENROUTER_REASONING_EFFORT,
          exclude: true,
        },
      } : {}),
    }),
  });

  if (!res.ok) {
    // Provider error bodies can echo prompt/profile fragments. Keep the
    // diagnostic bounded to a status code and never retain that response text.
    throw new Error(`${provider} API error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callAiProvider(messages: Array<{ role: string; content: string }>, maxTokens = 1024): Promise<string> {
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

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapRemotePreferenceToLinkedIn(remotePreference: string): string | undefined {
  switch (remotePreference) {
    case 'remote':
      return 'yes';
    case 'onsite':
      return 'no';
    default:
      return undefined;
  }
}

function mapExperienceLevelToLinkedIn(experienceLevel: string): string | undefined {
  switch (experienceLevel) {
    case 'entry':
      return 'entry-level';
    case 'mid':
      return 'mid-senior';
    case 'senior':
      return 'director';
    case 'lead':
      return 'director';
    case 'executive':
      return 'executive';
    default:
      return undefined;
  }
}

async function searchLinkedInJobsByKeyword(prefs: JobPreferences, query: string): Promise<DiscoveredJob[]> {
  if (!BRIGHT_DATA_API_TOKEN) {
    return [];
  }

  const locationParam = prefs.locations.length > 0 ? prefs.locations[0] : 'Remote';
  const input: Record<string, unknown> = {
    location: locationParam,
    keyword: query,
    selective_search: true,
    time_range: 'past_month',
  };

  const remote = mapRemotePreferenceToLinkedIn(prefs.remote_preference);
  if (remote) {
    input.remote = remote;
  }

  const experienceLevel = mapExperienceLevelToLinkedIn(prefs.experience_level);
  if (experienceLevel) {
    input.experience_level = experienceLevel;
  }

  const requestUrl = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${encodeURIComponent(BRIGHT_DATA_LINKEDIN_DATASET_ID)}&include_errors=true&type=discover_new&discover_by=keyword&format=json`;

  try {
    const res = await fetch(requestUrl, {
      signal: AbortSignal.timeout(20000),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BRIGHT_DATA_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: [input] }),
    });

    if (!res.ok) {
      throw new Error(`LinkedIn search provider returned HTTP ${res.status}`);
    }

    const payload = await res.json();
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

    return rows
      .map((job: Record<string, unknown>) => {
        const companyName = `${job.company_name || job.company || ''}`.trim();
        if (companyName && prefs.excluded_companies.some((company: string) => companyName.toLowerCase().includes(company.toLowerCase()))) {
          return null;
        }

        const rawUrl = `${job.apply_link || job.url || job.job_url || job.input_url || ''}`.trim();
        const externalId = `${job.job_posting_id || job.title_id || rawUrl || ''}`.trim();
        if (!rawUrl || !externalId) {
          return null;
        }

        return {
          title: `${job.job_title || job.title || query}`.trim(),
          company: companyName || 'LinkedIn Company',
          location: `${job.job_location || job.location || locationParam}`.trim(),
          salary_range: `${job.job_base_pay_range || job.base_salary || ''}`.trim(),
          job_url: rawUrl,
          contact_email: '',
          job_description: stripHtml(`${job.job_description_formatted || job.job_summary || ''}`).slice(0, 3000),
          source: 'linkedin_brightdata',
          external_job_id: `linkedin:${externalId}`,
          employer_website: `${job.company_url || ''}`.trim(),
        } satisfies DiscoveredJob;
      })
      .filter(Boolean) as DiscoveredJob[];
  } catch (err) {
    log('LinkedIn search request failed:', err instanceof Error ? err.name : 'Unknown error');
    throw new Error('LinkedIn job search is unavailable or timed out. Please try again.');
  }
}

// ── Job Search ───────────────────────────────────────────────────────────

/**
 * Search for a single page of jobs from JSearch.
 * Returns parsed jobs for the given query + page number.
 */
async function searchJobsPage(prefs: JobPreferences, query: string, page: number): Promise<DiscoveredJob[]> {
  const jobs: DiscoveredJob[] = [];
  if (!JSEARCH_API_KEY) return jobs;
  const locationParam = prefs.locations.length > 0 ? prefs.locations[0] : '';
  const remoteParam = prefs.remote_preference === 'remote' ? '&remote_jobs_only=true' : '';
  const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}${locationParam ? `+in+${encodeURIComponent(locationParam)}` : ''}${remoteParam}&page=${page}&num_pages=1&date_posted=month`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'X-RapidAPI-Key': JSEARCH_API_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });

    if (!res.ok) {
      throw new Error(`Job search provider returned HTTP ${res.status}`);
    }

    const data = await res.json();
    for (const job of (data.data || [])) {
      const companyLower = (job.employer_name || '').toLowerCase();
      if (prefs.excluded_companies.some((c: string) => companyLower.includes(c.toLowerCase()))) continue;

      jobs.push({
        title: job.job_title || '',
        company: job.employer_name || '',
        location: job.job_city
          ? `${job.job_city}, ${job.job_state || ''} ${job.job_country || ''}`.trim()
          : job.job_country || 'Remote',
        salary_range: job.job_min_salary && job.job_max_salary
          ? `$${job.job_min_salary.toLocaleString()} - $${job.job_max_salary.toLocaleString()}`
          : '',
        job_url: job.job_apply_link || job.job_google_link || '',
        contact_email: '',
        job_description: (job.job_description || '').slice(0, 3000),
        source: 'jsearch',
        external_job_id: job.job_id || '',
        employer_website: job.employer_website || '',
      });
    }
  } catch (err) {
    log('Job search request failed:', err instanceof Error ? err.name : 'Unknown error');
    throw new Error('Job search is unavailable or timed out. Please try again.');
  }

  return jobs;
}

// ── AI Scoring & Cover Letter ────────────────────────────────────────────

const normalizeScoringText = (value: unknown) => `${value ?? ''}`
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const scoringTokens = (value: unknown) => normalizeScoringText(value)
  .split(' ')
  .filter((token) => token.length > 1);

const hasScoringPhrase = (haystack: string, phrase: unknown) => {
  const normalizedPhrase = normalizeScoringText(phrase);
  return Boolean(normalizedPhrase && (` ${haystack} `).includes(` ${normalizedPhrase} `));
};

const deterministicJobScore = (job: DiscoveredJob, prefs: JobPreferences): number => {
  const jobTitle = normalizeScoringText(job.title);
  const jobText = normalizeScoringText([
    job.title,
    job.company,
    job.location,
    job.job_description,
  ].filter(Boolean).join(' '));

  const titleFits = (Array.isArray(prefs.job_titles) ? prefs.job_titles : [])
    .map((title) => {
      const target = normalizeScoringText(title);
      if (!target) return 0;
      if (jobTitle === target || hasScoringPhrase(` ${jobTitle} `, target)) return 1;
      const targetTokens = scoringTokens(target);
      if (targetTokens.length === 0) return 0;
      return targetTokens.filter((token) => scoringTokens(jobTitle).includes(token)).length / targetTokens.length;
    });
  const titleFit = titleFits.length ? Math.max(...titleFits) : 0;

  const skills = (Array.isArray(prefs.skills) ? prefs.skills : []).map((skill) => normalizeScoringText(skill)).filter(Boolean);
  const skillFit = skills.length
    ? skills.filter((skill) => hasScoringPhrase(jobText, skill)).length / skills.length
    : 0.5;

  const remoteMarker = /\bremote\b|\bwork from home\b|\bdistributed\b/.test(jobText);
  const hybridMarker = /\bhybrid\b/.test(jobText);
  let locationFit = prefs.remote_preference === 'remote'
    ? (remoteMarker ? 1 : 0)
    : prefs.remote_preference === 'onsite'
      ? (remoteMarker ? 0 : 1)
      : prefs.remote_preference === 'hybrid'
        ? (hybridMarker ? 1 : remoteMarker ? 0.5 : 0.35)
        : 0.67;
  const locations = (Array.isArray(prefs.locations) ? prefs.locations : []).map((location) => normalizeScoringText(location)).filter(Boolean);
  if (locations.length > 0 && locations.some((location) => hasScoringPhrase(jobText, location))) {
    locationFit = Math.min(1, locationFit + 0.25);
  }

  const levelMarkers: Record<string, string[]> = {
    entry: ['entry', 'junior', 'intern', 'associate'],
    mid: ['mid', 'intermediate'],
    senior: ['senior', 'lead', 'principal', 'staff'],
    executive: ['director', 'vice president', 'vp', 'chief', 'executive'],
  };
  const requestedMarkers = levelMarkers[prefs.experience_level] || [];
  const otherMarkers = Object.entries(levelMarkers)
    .filter(([level]) => level !== prefs.experience_level)
    .flatMap(([, markers]) => markers);
  const levelFit = requestedMarkers.some((marker) => hasScoringPhrase(jobText, marker))
    ? 1
    : otherMarkers.some((marker) => hasScoringPhrase(jobText, marker))
      ? 0.2
      : 0.5;

  const industries = (Array.isArray(prefs.industries) ? prefs.industries : []).map((industry) => normalizeScoringText(industry)).filter(Boolean);
  const industryFit = industries.length
    ? (industries.some((industry) => hasScoringPhrase(jobText, industry)) ? 1 : 0)
    : 0.5;

  return Math.min(100, Math.max(0, Math.round(
    titleFit * 45
    + skillFit * 25
    + locationFit * 15
    + levelFit * 10
    + industryFit * 5,
  )));
};

const parseAiJobScore = (value: string): number | null => {
  const firstNumber = value.match(/-?\d{1,3}/)?.[0];
  if (!firstNumber) return null;
  const score = Number(firstNumber);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
};

async function scoreJob(job: DiscoveredJob, prefs: JobPreferences, resumeText: string): Promise<number> {
  // A missing provider must never masquerade as a successful 75-point AI
  // decision. Keep discovery available with a conservative, explainable local
  // score while avoiding the old "everything passes" behavior.
  if (!hasAnyAiProvider()) return deterministicJobScore(job, prefs);

  try {
    const response = await callAiProvider([
      {
        role: 'system',
        content: 'You are a job matching expert. Score how well a job posting matches a candidate on a scale of 0-100. Consider: title match, skills overlap, location/remote compatibility, experience level, industry relevance. Reply with ONLY a number 0-100.',
      },
      {
        role: 'user',
        content: `CANDIDATE: Titles: ${prefs.job_titles.join(', ')} | Skills: ${prefs.skills.join(', ')} | Locations: ${prefs.locations.join(', ')} | Remote: ${prefs.remote_preference} | Level: ${prefs.experience_level} | Salary: ${prefs.salary_min || prefs.salary_max ? `$${prefs.salary_min || '0'}-${prefs.salary_max || 'open'}` : 'Any'} | Industries: ${prefs.industries.join(', ') || 'Any'}${resumeText ? ` | Resume: ${resumeText.slice(0, 500)}` : ''}

JOB: ${job.title} at ${job.company} | ${job.location} | ${job.salary_range} | ${job.job_description.slice(0, 800)}

Score:`,
      },
    ], 16);

    const score = parseAiJobScore(response);
    return score === null ? 60 : score;
  } catch (err) {
    log('Score error:', err);
    return 60;
  }
}

async function generateCoverLetter(
  job: DiscoveredJob,
  prefs: JobPreferences,
  resumeText: string,
  senderName: string
): Promise<string> {
  if (!hasAnyAiProvider()) return '';

  try {
    return await callAiProvider([
      {
        role: 'system',
        content: 'You are a professional cover letter writer. Write a concise, personalized cover letter (200-300 words). Be professional but genuine. No overly formal or generic phrases. Focus on specific value the candidate brings. End with "Best regards," followed by the candidate name on a new line. Do NOT add any text after the candidate name.',
      },
      {
        role: 'user',
        content: `Write a cover letter for:

CANDIDATE: ${senderName} | Skills: ${prefs.skills.join(', ')} | Level: ${prefs.experience_level}
${resumeText ? `Resume: ${resumeText.slice(0, 800)}` : ''}

JOB: ${job.title} at ${job.company} | ${job.location}
Description: ${job.job_description.slice(0, 1000)}

Write the cover letter:`,
      },
    ], 1024);
  } catch (err) {
    log('Cover letter generation error:', err);
    return '';
  }
}

// ── Email Discovery ──────────────────────────────────────────────────────

const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY') || '';

/**
 * Extract the company domain from employer_website URL or company name.
 * e.g. "https://www.leidos.com/careers" → "leidos.com"
 *      "COGNITIVE MEDICAL SYSTEMS INC" → "cognitivemedical.com" (best guess)
 */
function extractDomain(job: DiscoveredJob): string | null {
  // Try employer_website first
  if (job.employer_website) {
    try {
      const url = new URL(job.employer_website.startsWith('http') ? job.employer_website : `https://${job.employer_website}`);
      return url.hostname.replace(/^www\./, '');
    } catch {
      // fall through
    }
  }

  // Try to extract from job_url (skip linkedin, indeed, glassdoor, ziprecruiter, google)
  if (job.job_url) {
    try {
      const url = new URL(job.job_url);
      const host = url.hostname.replace(/^www\./, '');
      const skipDomains = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'google.com', 'monster.com', 'careerbuilder.com', 'dice.com', 'rapidapi.com'];
      if (!skipDomains.some((d) => host.includes(d))) {
        return host;
      }
    } catch {
      // fall through
    }
  }

  // Last resort: guess from company name
  const cleaned = job.company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|solutions|systems|services|technologies|tech)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  return cleaned ? `${cleaned}.com` : null;
}

/** Common email prefixes used by companies for hiring/careers. */
const HIRING_PREFIXES = ['careers', 'jobs', 'hiring', 'recruiting', 'hr', 'talent', 'apply', 'recruitment', 'people', 'employment'];

/**
 * Try Hunter.io API to find a company's hiring email.
 * Returns the best email or null.
 */
async function hunterSearch(domain: string): Promise<string | null> {
  if (!HUNTER_API_KEY) return null;

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&type=generic`,
      {
        headers: {
          accept: 'application/json',
          // Keep the provider credential out of URLs, proxy logs and error
          // breadcrumbs. Hunter accepts X-API-KEY for the same request.
          'X-API-KEY': HUNTER_API_KEY,
        },
      }
    );

    if (!res.ok) {
      log(`Hunter.io error for ${domain}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const emails: Array<{ value: string; type: string; confidence: number }> = data?.data?.emails || [];

    // Prefer generic emails with hiring-related prefixes
    for (const prefix of HIRING_PREFIXES) {
      const match = emails.find((e) => e.value.toLowerCase().startsWith(`${prefix}@`));
      if (match) return match.value;
    }

    // Fall back to any generic email with highest confidence
    const generic = emails
      .filter((e) => e.type === 'generic')
      .sort((a, b) => b.confidence - a.confidence);

    if (generic.length > 0) return generic[0].value;

    // Fall back to the general domain pattern from Hunter
    const pattern = data?.data?.pattern;
    if (pattern) {
      return `careers@${domain}`;
    }

    return null;
  } catch (err) {
    log('Hunter.io fetch error:', err);
    return null;
  }
}

/**
 * Try to scrape the company careers page for an email address.
 * Fetches the homepage or /careers page and looks for email patterns.
 */
async function scrapeForEmail(domain: string): Promise<string | null> {
  const urls = [
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://${domain}/contact`,
    `https://www.${domain}/careers`,
    `https://www.${domain}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetchPublicWebpage(url);

      if (!res.ok) continue;

      const html = res.text;
      // Extract emails using regex
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const found = [...new Set(html.match(emailRegex) || [])];

      // Filter to likely hiring emails, exclude images/assets
      const hiringEmails = found.filter((e) => {
        const lower = e.toLowerCase();
        // Skip obvious non-hiring emails
        if (lower.includes('.png') || lower.includes('.jpg') || lower.includes('.svg')) return false;
        if (lower.includes('noreply') || lower.includes('no-reply')) return false;
        if (lower.includes('support') || lower.includes('sales') || lower.includes('info@')) return false;
        // Prefer hiring-related
        return HIRING_PREFIXES.some((p) => lower.startsWith(p + '@')) || lower.includes(domain);
      });

      if (hiringEmails.length > 0) {
        log(`Scraped a candidate hiring email from ${url}`);
        return hiringEmails[0];
      }

      // If no hiring email, return any email on the domain
      const domainEmails = found.filter((e) => e.toLowerCase().endsWith(`@${domain}`) || e.toLowerCase().endsWith(`@www.${domain}`));
      if (domainEmails.length > 0) {
        log(`Scraped a candidate domain email from ${url}`);
        return domainEmails[0];
      }
    } catch {
      // Timeout or network error — try next URL
      continue;
    }
  }

  return null;
}

/**
 * Screen syntax, DNS and disposable-domain signals using Disify.
 * This does not prove that the mailbox exists, accepts mail, or belongs to HR.
 */
async function screenEmailDomain(email: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://disify.com/api/email/${encodeURIComponent(email)}`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return false;

    const data = await res.json();
    // disify returns: { format: true, disposable: false, dns: true, ... }
    // We care about format + dns being true and disposable being false
    return data.format === true && data.dns === true && data.disposable === false;
  } catch {
    // If verification fails, don't use the email — better to skip than bounce
    return false;
  }
}

/**
 * Generate candidate emails using common patterns, verify domain MX records,
 * then screen address syntax/domain signals. This unused helper is not an
 * approved source of application recipients: domain checks cannot verify a mailbox.
 */
async function _guessAndVerifyEmail(domain: string): Promise<string | null> {
  // First verify the domain has MX records (can receive email at all)
  try {
    const dnsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    const dnsData = await dnsRes.json();

    if (!dnsData.Answer || dnsData.Answer.length === 0) {
      log(`No MX records for ${domain} — skipping`);
      return null;
    }

    log(`${domain} has MX records — screening address format`);
  } catch {
    log(`DNS lookup failed for ${domain}`);
    return null;
  }

  // Legacy unused guesser: these checks cannot prove a mailbox exists.
  for (const prefix of HIRING_PREFIXES) {
    const candidate = `${prefix}@${domain}`;
    const exists = await screenEmailDomain(candidate);
    if (exists) {
      log(`Address passed domain screening: ${candidate}`);
      return candidate;
    }
    log(`Address failed domain screening: ${candidate}`);
  }

  log(`No valid email found for ${domain} after checking all patterns`);
  return null;
}

/**
 * Use AI to extract an email from the job description if one is mentioned.
 */
async function aiExtractEmail(jobDescription: string): Promise<string | null> {
  if (!hasAnyAiProvider()) return null;

  try {
    const response = await callAiProvider([
      {
        role: 'system',
        content: 'Extract the hiring/application email address from this job posting. If there is an email address for submitting applications or contacting HR, reply with ONLY that email address. If there is no email address, reply with exactly "NONE".',
      },
      {
        role: 'user',
        content: jobDescription.slice(0, 2000),
      },
    ], 64);

    const cleaned = response.trim().toLowerCase();
    if (cleaned === 'none' || cleaned.length < 5 || !cleaned.includes('@')) return null;

    if (!isSingleEmailAddress(cleaned)) return null;
    // Treat model output as a selector, never a source of recipient addresses.
    const sourceEmails: string[] = jobDescription.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    return sourceEmails.some((email) => email.toLowerCase() === cleaned) ? cleaned : null;
  } catch {
    return null;
  }
}

/**
 * Full email discovery pipeline for a job.
 * Tries multiple strategies in order of reliability:
 *   1. AI extraction from job description (most reliable if email exists in text)
 *   2. Hunter.io API lookup (if configured)
 *   3. Careers page scraping
 */
async function discoverEmail(job: DiscoveredJob): Promise<string | null> {
  // Already has an email
  if (job.contact_email) return job.contact_email;

  // 1. Check if the job description mentions an email directly
  const aiEmail = await aiExtractEmail(job.job_description);
  if (aiEmail) {
    const verified = await screenEmailDomain(aiEmail);
    if (verified) {
      log('Source-posted email passed domain screening');
      return aiEmail;
    }
    log('Source-posted email failed domain screening — skipping');
  }

  // 2. Extract company domain
  const domain = extractDomain(job);
  if (!domain) {
    log(`Could not determine domain for ${job.company}`);
    return null;
  }

  log(`Discovering email for ${job.company} (domain: ${domain})`);

  // 3. Try Hunter.io
  const hunterEmail = await hunterSearch(domain);
  if (hunterEmail) {
    const verified = await screenEmailDomain(hunterEmail);
    if (verified) {
      log('Hunter.io email passed domain screening');
      return hunterEmail;
    }
    log('Hunter.io email failed domain screening');
  }

  // 4. Scrape careers/contact pages
  const scrapedEmail = await scrapeForEmail(domain);
  if (scrapedEmail) {
    const verified = await screenEmailDomain(scrapedEmail);
    if (verified) {
      log('Scraped email passed domain screening');
      return scrapedEmail;
    }
    log('Scraped email failed domain screening');
  }

  // 5. Skip guessing — only use emails we actually found
  // Guessing careers@domain.com causes too many bounces
  log(`No verified email found for ${job.company} — skipping (no guessing)`);

  log(`No email found for ${job.company}`);
  return null;
}

// ── Brevo Email Sending ──────────────────────────────────────────────────

/**
 * Send an application email via Brevo's transactional API.
 * Uses a unique reply-to address: apply+{jobId}@resumeats.cv
 * so inbound replies can be correlated back to the job.
 *
 * Returns the Brevo messageId on success, or null on failure.
 */
async function sendApplicationEmail(
  toEmail: string,
  senderName: string,
  userReplyEmail: string,
  subject: string,
  coverLetter: string,
  jobId: string,
): Promise<string | null> {
  if (!BREVO_API_KEY) {
    log('Application email not sent: Brevo is not configured');
    return null;
  }
  if (!isSingleEmailAddress(toEmail) || !coverLetter.trim()) return null;

  // The unique reply-to address for inbound parsing
  const uniqueReplyTo = `apply+${jobId}@${REPLY_DOMAIN}`;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: SENDER_EMAIL },
        to: [{ email: toEmail }],
        replyTo: { email: uniqueReplyTo, name: senderName },
        subject,
        htmlContent: buildApplicationEmailHtml(coverLetter, userReplyEmail),
        textContent: coverLetter + (userReplyEmail ? `\n\nYou can also reach me at: ${userReplyEmail}` : ''),
        headers: {
          'X-Auto-Apply-Job-Id': jobId,
          charset: 'utf-8',
        },
      }),
    });

    if (!res.ok) {
      log(`Brevo API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const messageId = data.messageId || null;
    log(`Email sent successfully${messageId ? ' with provider receipt' : ''}`);
    return messageId;
  } catch (err) {
    log('Brevo send error:', err);
    return null;
  }
}

// ── Utility ──────────────────────────────────────────────────────────────

function _getScoreThreshold(speed: string): number {
  switch (speed) {
    case 'conservative': return 75;
    case 'moderate': return 55;
    case 'aggressive': return 35;
    default: return 55;
  }
}

/**
 * Quick check if a job posting URL is still live.
 * Returns false if the page returns 404/410 (job removed/expired).
 * Returns true if reachable or if we can't determine (gives benefit of doubt).
 */
async function isJobStillActive(jobUrl: string): Promise<boolean> {
  if (!jobUrl) return true; // No URL to check — assume active

  try {
    const res = await fetchPublicWebpage(jobUrl, 'HEAD');

    // 404 or 410 = job removed/expired
    if (res.status === 404 || res.status === 410) {
      log(`Job posting returned ${res.status} — expired`);
      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof UnsafeWebDestinationError) return false;
    // Timeout or network error — give benefit of doubt
    return true;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const originAllowed = isOriginAllowed(requestOrigin);
  if (isProd && requestOrigin && !originAllowed) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(requestOrigin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors, status: 204 });
  }

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

  let requestBody: AutoApplyRunRequestBody = {};
  try {
    requestBody = await req.json();
    if (!requestBody || Array.isArray(requestBody) || typeof requestBody !== 'object' ||
      (requestBody.discover_only !== undefined && typeof requestBody.discover_only !== 'boolean')) {
      throw new Error('Invalid request');
    }
  } catch {
    return new Response(JSON.stringify({ error: 'A valid JSON request is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const discoverOnly = requestBody.discover_only !== false;
  if (!JSEARCH_API_KEY && !BRIGHT_DATA_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'Job discovery is not configured. You can still import a job URL using the browser extension.' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const userId = authUser.userId;
  const supabase = adminClient();
  const authorization = req.headers.get('Authorization') || '';
  const publicKey = getPublicKey();

  // Admission and job budgets are server-owned and locked atomically in SQL.
  const { data: claimData, error: runError } = await supabase.rpc('claim_auto_apply_run', {
    p_user_id: userId,
    p_discover_only: discoverOnly,
  });
  const claim = Array.isArray(claimData) ? claimData[0] : claimData;
  if (runError || !claim) {
    return new Response(JSON.stringify({ error: 'Could not verify the auto-apply run budget. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  if (!claim.allowed) {
    const messages: Record<string, string> = {
      already_running: 'An auto-apply run is already in progress. Wait for it to finish.',
      cooldown: 'Please wait a minute before starting another discovery run.',
      daily_run_limit: 'Today\'s discovery-run limit has been reached. Try again tomorrow.',
      daily_job_limit: 'Today\'s job processing limit has been reached. Try again tomorrow.',
      preferences_missing: 'Configure your job preferences before starting a run.',
      paused: 'Auto-apply is paused. Activate it or use discovery-only mode.',
    };
    return new Response(JSON.stringify({ error: messages[claim.reason] || 'Auto-apply is unavailable for this account.', reason: claim.reason }), {
      status: claim.reason === 'already_running' ? 409 : ['cooldown', 'daily_run_limit', 'daily_job_limit'].includes(claim.reason) ? 429 : 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const runId = claim.run_id;
  const remaining = claim.remaining;

  try {
    // 1. Load preferences
    const { data: rawPrefs, error: prefsError } = await supabase
      .from('job_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError || !rawPrefs) {
      throw new Error('Job preferences not found. Please configure your preferences first.');
    }

    // Preferences are user-editable rows. Bound every free-form list before it
    // reaches provider URLs, prompts, matching or exclusion checks, even if an
    // older client bypassed the current form limits.
    const prefs = {
      ...rawPrefs,
      job_titles: capPreferenceStrings(rawPrefs.job_titles, 20, 120),
      skills: capPreferenceStrings(rawPrefs.skills, 40, 80),
      locations: capPreferenceStrings(rawPrefs.locations, 20, 120),
      industries: capPreferenceStrings(rawPrefs.industries, 20, 120),
      excluded_companies: capPreferenceStrings(rawPrefs.excluded_companies, 40, 120),
      salary_min: normalizeSalaryPreference(rawPrefs.salary_min),
      salary_max: normalizeSalaryPreference(rawPrefs.salary_max),
    };

    if (!prefs.is_active && !discoverOnly) {
      throw new Error('Auto-apply is paused. Please activate it first.');
    }

    const jobTitles = prefs.job_titles;
    if (jobTitles.length === 0) {
      throw Object.assign(new Error('Add at least one job title before starting a run.'), { code: 'PREFERENCES_INCOMPLETE' });
    }

    // 3. Load one authenticated, versioned resume snapshot. Outreach runs
    // require a saved resume before any discovery or paid generation begins;
    // discovery-only runs may still be used without selecting one.
    if (!discoverOnly && !prefs.default_resume_id) {
      throw Object.assign(new Error('Select and save a resume before sending outreach.'), { code: 'RESUME_REQUIRED' });
    }

    if (!discoverOnly && !hasAnyAiProvider()) {
      throw Object.assign(new Error('AI matching and cover-letter generation are unavailable. Use discovery-only mode or try again later.'), {
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    let resumeText = '';
    let resumeSnapshot: Record<string, unknown> | null = null;
    let resumePackage: Record<string, unknown> | null = null;
    if (prefs.default_resume_id) {
      resumeSnapshot = await loadOwnedResumeSnapshot({
        createClient,
        supabaseUrl: SUPABASE_URL,
        publicKey,
        authorization,
        resumeId: prefs.default_resume_id,
        userId,
      });
      resumeText = buildResumeTextLines(resumeSnapshot).join('\n');

      if (!discoverOnly) {
        try {
          const fontData = await loadResumeFontData();
          resumePackage = await createResumeAttachmentPackage({ snapshot: resumeSnapshot, fontData });
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') throw error;
          throw Object.assign(new Error('The saved resume could not be prepared for outreach. Please retry or download DOCX.'), { code: 'RESUME_ATTACHMENT_UNAVAILABLE' });
        }
      }
    }

    // 3b. Load Gmail connection only for outreach-style runs
    const { data: gmailConn } = discoverOnly ? { data: null } : await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    let useGmail = !!(gmailConn?.access_token && gmailConn?.refresh_token);
    if (!discoverOnly && !useGmail && !BREVO_API_KEY) {
      throw new Error('Email outreach is unavailable. Connect Gmail or use discovery-only mode.');
    }
    if (!discoverOnly && useGmail) {
      log('Gmail connected — sending via Gmail');
    } else if (!discoverOnly) {
      log('No Gmail connection — sending via Brevo');
    }

    // 4. Build seen-jobs set for deduplication
    const { data: existingJobs } = await supabase
      .from('auto_apply_jobs')
      .select('external_job_id')
      .eq('user_id', userId);

    const seenIds = new Set((existingJobs || []).map((j: { external_job_id: string }) => j.external_job_id));

    // 5. Main loop — keep searching & applying until daily limit is filled.
    // The user-selected speed controls the minimum match threshold. Without
    // an AI provider, keep the deterministic fallback conservative so a fast
    // discovery run cannot turn into an over-broad queue.
    const configuredThreshold = _getScoreThreshold(prefs.speed);
    const MIN_MATCH_SCORE = hasAnyAiProvider() ? configuredThreshold : Math.max(60, configuredThreshold);
    const MAX_PAGES_PER_QUERY = 5; // Max pages to paginate per job title
    const MAX_TOTAL_API_CALLS = 15; // Safety cap on total JSearch API calls
    const MAX_SCORED_JOBS = 50;
    // Leave time for in-flight provider requests and the final database update.
    const discoveryDeadline = Date.now() + 80000;
    let applied = 0;
    let acceptedCount = 0;
    let skipped = 0;
    let failed = 0;
    let totalDiscovered = 0;
    let totalApiCalls = 0;
    let scoredJobs = 0;
    const senderName = prefs.sender_name || SENDER_NAME_DEFAULT;
    const userReplyEmail = prefs.reply_to_email || '';
    const queries = jobTitles;
    if (discoverOnly) {
      useGmail = false;
      log('Discover-only run active - jobs will be queued for browser autofill only');
    }

    {
      // Real search loop: iterate through queries and pages
      searchQueries: for (const query of queries) {
        if (acceptedCount >= remaining || scoredJobs >= MAX_SCORED_JOBS || totalApiCalls >= MAX_TOTAL_API_CALLS || (discoverOnly && Date.now() >= discoveryDeadline)) break;

        for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
          if (acceptedCount >= remaining || totalApiCalls >= MAX_TOTAL_API_CALLS || (discoverOnly && Date.now() >= discoveryDeadline)) break;

          log(`Searching "${query}" page ${page} (${discoverOnly ? 'queued' : 'applied'}: ${acceptedCount}/${remaining})...`);
          let pageJobs: DiscoveredJob[] = [];
          let searchError: unknown;

          if (page === 1 && BRIGHT_DATA_API_TOKEN && totalApiCalls < MAX_TOTAL_API_CALLS) {
            try {
              pageJobs = pageJobs.concat(await searchLinkedInJobsByKeyword(prefs as JobPreferences, query));
            } catch (error) {
              searchError = error;
            }
            totalApiCalls++;
          }

          if (JSEARCH_API_KEY && totalApiCalls < MAX_TOTAL_API_CALLS) {
            try {
              pageJobs = pageJobs.concat(await searchJobsPage(prefs as JobPreferences, query, page));
            } catch (error) {
              searchError = error;
            }
            totalApiCalls++;
          } else if (!JSEARCH_API_KEY && page > 1) {
            break;
          }

          if (pageJobs.length === 0) {
            if (searchError) throw searchError;
            log(`No more results for "${query}" — moving to next query`);
            break;
          }

          // Filter duplicates
          const newJobs = pageJobs.filter((j) => j.external_job_id && !seenIds.has(j.external_job_id));
          for (const j of newJobs) seenIds.add(j.external_job_id);
          totalDiscovered += newJobs.length;

          log(`Page ${page}: ${pageJobs.length} results, ${newJobs.length} new`);

          // Process each new job
          for (const job of newJobs) {
            if (acceptedCount >= remaining || scoredJobs >= MAX_SCORED_JOBS || (discoverOnly && Date.now() >= discoveryDeadline)) break searchQueries;

            // Check if job posting is still active
            const jobActive = await isJobStillActive(job.job_url);
            if (!jobActive) {
              log(`Skipping expired job: ${job.title} @ ${job.company}`);
              skipped++;
              continue;
            }

            if (!salaryMatchesPreferences(job.salary_range, prefs.salary_min, prefs.salary_max)) {
              log(`Skipping out-of-range job: ${job.title} @ ${job.company}`);
              skipped++;
              continue;
            }

            // Score the job
            scoredJobs++;
            const matchScore = await scoreJob(job, prefs as JobPreferences, resumeText);
            log(`${job.title} @ ${job.company}: score ${matchScore}`);

            // Skip if below minimum match score (don't save to DB — no point showing these)
            if (matchScore < MIN_MATCH_SCORE) {
              skipped++;
              continue;
            }

            // Insert job to get ID for unique reply-to address
            const { data: slotAllowed, error: slotError } = await supabase.rpc('reserve_auto_apply_job_slot', {
              p_user_id: userId,
              p_run_id: runId,
            });
            if (slotError) throw new Error('Could not verify the daily job processing budget.');
            if (!slotAllowed) break searchQueries;
            const { data: insertedJob, error: insertError } = await supabase
              .from('auto_apply_jobs')
              .insert({
                user_id: userId,
                title: job.title,
                company: job.company,
                location: job.location,
                salary_range: job.salary_range,
                job_url: job.job_url,
                contact_email: job.contact_email,
                job_description: job.job_description,
                match_score: matchScore,
                status: discoverOnly ? 'queued' : 'applying',
                source: job.source,
                external_job_id: job.external_job_id,
              })
              .select('id')
              .single();

            if (insertError || !insertedJob) {
              log('Insert error:', insertError);
              failed++;
              continue;
            }

            const jobId = insertedJob.id;

            if (discoverOnly) {
              acceptedCount++;
              log(`+ Queued ${acceptedCount}/${remaining}: ${job.title} @ ${job.company}`);
              continue;
            }

            // Discover contact email
            const contactEmail = await discoverEmail(job);
            if (contactEmail) {
              job.contact_email = contactEmail;
              await supabase.from('auto_apply_jobs').update({ contact_email: contactEmail }).eq('id', jobId);
            }

            // Generate cover letter
            const coverLetter = await generateCoverLetter(job, prefs as JobPreferences, resumeText, senderName);

            // Send email via Gmail (if connected) or Brevo (fallback)
            let emailSent = false;
            let brevoMessageId: string | null = null;
            let gmailMessageId: string | null = null;
            let gmailThreadId: string | null = null;
            let sentVia = 'brevo';

            if (isSingleEmailAddress(job.contact_email) && coverLetter.trim()) {
              const emailSubject = `Application for ${job.title} - ${senderName}`;
              // Only show "reach me at" for Brevo emails (different sender), not Gmail (same address)
              const showReachMe = !useGmail && userReplyEmail;
              const htmlContent = buildApplicationEmailHtml(coverLetter, showReachMe ? userReplyEmail : '');

              // Re-read the same caller-bound snapshot RPC immediately before
              // a provider call and compare its identity/revision. The bytes
              // and text still come from the immutable package captured at
              // setup.
              try {
                if (!resumeSnapshot || !resumePackage || !prefs.default_resume_id) {
                  throw Object.assign(new Error('A saved resume attachment is required before sending outreach.'), { code: 'RESUME_ATTACHMENT_UNAVAILABLE' });
                }
                const currentResumeSnapshot = await loadOwnedResumeSnapshot({
                  createClient,
                  supabaseUrl: SUPABASE_URL,
                  publicKey,
                  authorization,
                  resumeId: prefs.default_resume_id,
                  userId,
                });
                assertResumePackageCurrent(resumePackage, currentResumeSnapshot);
              } catch (error) {
                const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'RESUME_ATTACHMENT_UNAVAILABLE';
                try {
                  await supabase.from('auto_apply_jobs').update({
                    status: 'failed',
                    failure_reason: code === 'RESUME_SNAPSHOT_CHANGED'
                      ? 'The saved resume changed before sending; no email was sent.'
                      : 'The saved resume attachment was unavailable; no email was sent.',
                  }).eq('id', jobId);
                } catch {
                  log(`Could not mark job ${jobId} failed after resume preparation error`);
                }
                failed++;
                throw error;
              }

              const resumePdfBase64 = useGmail ? String(resumePackage.attachmentBase64) : undefined;
              const resumeFilename = useGmail ? String(resumePackage.attachmentFilename) : undefined;

              if (useGmail && gmailConn) {
                // Send via Gmail API
                const result = await sendViaGmail({
                  accessToken: gmailConn.access_token,
                  refreshToken: gmailConn.refresh_token,
                  tokenExpiresAt: gmailConn.token_expires_at,
                  fromEmail: gmailConn.email,
                  toEmail: job.contact_email,
                  subject: emailSubject,
                  htmlContent,
                  textContent: coverLetter,
                  attachmentBase64: resumePdfBase64,
                  attachmentFilename: resumePdfBase64 ? resumeFilename : undefined,
                });

                emailSent = result.success;
                gmailMessageId = result.messageId || null;
                gmailThreadId = result.threadId || null;
                sentVia = 'gmail';

                // Update tokens if refreshed
                if (result.newAccessToken) {
                  gmailConn.access_token = result.newAccessToken;
                  gmailConn.token_expires_at = result.newExpiresAt || gmailConn.token_expires_at;
                  await supabase.from('gmail_connections').update({
                    access_token: result.newAccessToken,
                    token_expires_at: result.newExpiresAt,
                  }).eq('id', gmailConn.id);
                }

                log(emailSent ? 'Gmail sent successfully' : `Gmail failed: ${result.error}`);
              } else {
                // Send via Brevo
                brevoMessageId = await sendApplicationEmail(
                  job.contact_email,
                  senderName,
                  userReplyEmail,
                  emailSubject,
                  coverLetter,
                  jobId,
                );
                emailSent = brevoMessageId !== null;
              }
            }

            // Update job record
            const status = emailSent ? 'applied' : 'failed';
            const failureReason = !isSingleEmailAddress(job.contact_email)
              ? 'No valid contact email found'
              : !coverLetter.trim() ? 'Cover letter generation failed' : (!emailSent ? 'Email sending failed' : null);

            await supabase
              .from('auto_apply_jobs')
              .update({
                status,
                cover_letter: coverLetter,
                applied_at: status === 'applied' ? new Date().toISOString() : null,
                email_sent_at: emailSent ? new Date().toISOString() : null,
                brevo_message_id: brevoMessageId,
                gmail_message_id: gmailMessageId,
                gmail_thread_id: gmailThreadId,
                sent_via: sentVia,
                failure_reason: failureReason,
              })
              .eq('id', jobId);

            if (status === 'applied') {
              acceptedCount++;
              applied++;
              log(`✓ Applied ${applied}/${remaining}: ${job.title} @ ${job.company} → ${job.contact_email}`);
            } else {
              failed++;
            }
          }
        }
      }
    }

    // 6. Update run record
    const { error: completionError } = await supabase
      .from('auto_apply_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        jobs_discovered: totalDiscovered,
        jobs_applied: applied,
        jobs_skipped: skipped,
        jobs_failed: failed,
      })
      .eq('id', runId)
      .eq('user_id', userId);
    if (completionError) throw new Error('Jobs were processed, but the run summary could not be saved. Refresh your job list before starting another run.');

    log(`Run complete: ${discoverOnly ? `${acceptedCount} queued` : `${applied} applied`}, ${skipped} skipped, ${failed} failed (searched ${totalApiCalls} discovery calls)`);

    return new Response(
      JSON.stringify({
        success: true,
        discover_only: discoverOnly,
        run_id: runId,
        jobs_discovered: totalDiscovered,
        jobs_applied: applied,
        jobs_queued: discoverOnly ? acceptedCount : 0,
        jobs_skipped: skipped,
        jobs_failed: failed,
        discovery_calls: totalApiCalls,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const code = err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : undefined;
    console.error('[auto-apply] Run failed:', message);

    const { error: failureUpdateError } = await supabase
      .from('auto_apply_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', runId)
      .eq('user_id', userId);
    if (failureUpdateError) console.error('[auto-apply] Could not persist the failed run status.');

    return new Response(
      JSON.stringify({ error: message, code, run_id: runId }),
      { status: code === 'RESUME_SNAPSHOT_CHANGED' ? 409 : code?.startsWith('RESUME_') || code === 'PREFERENCES_INCOMPLETE' ? 422 : code === 'AI_PROVIDER_UNAVAILABLE' ? 503 : 500, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  } finally {
    try {
      const { error: releaseError } = await supabase.rpc('release_auto_apply_run', { p_user_id: userId, p_run_id: runId });
      if (releaseError) console.error('[auto-apply] Could not release run lease; it will expire automatically.');
    } catch {
      console.error('[auto-apply] Run lease release unavailable; it will expire automatically.');
    }
  }
});
