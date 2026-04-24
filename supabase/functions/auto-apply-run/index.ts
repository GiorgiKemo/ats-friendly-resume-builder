// supabase/functions/auto-apply-run/index.ts
// Edge function that runs one auto-apply cycle:
//   1. Load user preferences + resume
//   2. Search for matching jobs via Bright Data LinkedIn and/or JSearch
//   3. Score & filter matches with AI (Groq)
//   4. Queue jobs for browser-side apply, or optionally send outreach emails
//   5. Log everything to the database

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isOriginAllowed, authenticateUser } from '../_shared/cors.ts';
import { sendViaGmail } from '../_shared/gmailSend.ts';

// ── Environment ──────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') ||
  '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile';
const JSEARCH_API_KEY = Deno.env.get('JSEARCH_API_KEY') || '';
const BRIGHT_DATA_API_TOKEN = Deno.env.get('BRIGHT_DATA_API_TOKEN') || Deno.env.get('BRIGHT_DATA_TOKEN') || '';
const BRIGHT_DATA_LINKEDIN_DATASET_ID = Deno.env.get('BRIGHT_DATA_LINKEDIN_DATASET_ID') || 'gd_lpfll7v5hcqtkxl6l';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
const SENDER_EMAIL = Deno.env.get('AUTO_APPLY_SENDER_EMAIL') || 'apply@resumeats.cv';
const SENDER_NAME_DEFAULT = 'ResumeATS';
// Inbound reply-to domain — replies to apply+{jobId}@resumeats.cv trigger the webhook
const REPLY_DOMAIN = Deno.env.get('AUTO_APPLY_REPLY_DOMAIN') || 'resumeats.cv';

const isProd = Deno.env.get('NODE_ENV') === 'production';
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

async function callGroq(messages: Array<{ role: string; content: string }>, maxTokens = 1024): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
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
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BRIGHT_DATA_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: [input] }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log(`Bright Data LinkedIn error for "${query}":`, res.status, errorText);
      return [];
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
    log(`Bright Data LinkedIn fetch error for "${query}":`, err);
    return [];
  }
}

// ── Job Search ───────────────────────────────────────────────────────────

/**
 * Search for a single page of jobs from JSearch.
 * Returns parsed jobs for the given query + page number.
 */
async function searchJobsPage(prefs: JobPreferences, query: string, page: number): Promise<DiscoveredJob[]> {
  const jobs: DiscoveredJob[] = [];
  const locationParam = prefs.locations.length > 0 ? prefs.locations[0] : '';
  const remoteParam = prefs.remote_preference === 'remote' ? '&remote_jobs_only=true' : '';
  const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}${locationParam ? `+in+${encodeURIComponent(locationParam)}` : ''}${remoteParam}&page=${page}&num_pages=1&date_posted=month`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': JSEARCH_API_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });

    if (!res.ok) {
      log(`JSearch API error for "${query}" page ${page}:`, res.status);
      return [];
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
    log(`JSearch fetch error for "${query}" page ${page}:`, err);
  }

  return jobs;
}

function getMockJobs(prefs: JobPreferences): DiscoveredJob[] {
  const titles = prefs.job_titles.length > 0 ? prefs.job_titles : ['Software Engineer'];
  const locations = prefs.locations.length > 0 ? prefs.locations : ['Remote'];

  const companies = [
    { name: 'TechFlow Inc', email: 'careers@techflow.example.com' },
    { name: 'CloudBase Systems', email: 'jobs@cloudbase.example.com' },
    { name: 'DataPulse AI', email: 'hiring@datapulse.example.com' },
    { name: 'NexGen Solutions', email: 'hr@nexgen.example.com' },
    { name: 'Quantum Labs', email: 'talent@quantumlabs.example.com' },
    { name: 'Pinnacle Software', email: 'apply@pinnacle.example.com' },
  ];

  return companies
    .filter((c) => !prefs.excluded_companies.some((ex: string) => c.name.toLowerCase().includes(ex.toLowerCase())))
    .map((company, i) => ({
      title: titles[i % titles.length],
      company: company.name,
      location: locations[i % locations.length],
      salary_range: `$${80000 + i * 15000} - $${120000 + i * 15000}`,
      job_url: `https://example.com/jobs/${i + 1}`,
      contact_email: company.email,
      job_description: `We are looking for a ${titles[i % titles.length]} to join our team. Required skills: ${prefs.skills.join(', ') || 'JavaScript, React, Node.js'}. This is a ${prefs.remote_preference || 'hybrid'} position located in ${locations[i % locations.length]}.`,
      source: 'mock',
      external_job_id: `mock-${Date.now()}-${i}`,
      employer_website: `https://${company.name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
    }));
}

// ── AI Scoring & Cover Letter ────────────────────────────────────────────

async function scoreJob(job: DiscoveredJob, prefs: JobPreferences, resumeText: string): Promise<number> {
  if (!GROQ_API_KEY) return 75;

  try {
    const response = await callGroq([
      {
        role: 'system',
        content: 'You are a job matching expert. Score how well a job posting matches a candidate on a scale of 0-100. Consider: title match, skills overlap, location/remote compatibility, experience level, industry relevance. Reply with ONLY a number 0-100.',
      },
      {
        role: 'user',
        content: `CANDIDATE: Titles: ${prefs.job_titles.join(', ')} | Skills: ${prefs.skills.join(', ')} | Locations: ${prefs.locations.join(', ')} | Remote: ${prefs.remote_preference} | Level: ${prefs.experience_level} | Industries: ${prefs.industries.join(', ') || 'Any'}${resumeText ? ` | Resume: ${resumeText.slice(0, 500)}` : ''}

JOB: ${job.title} at ${job.company} | ${job.location} | ${job.salary_range} | ${job.job_description.slice(0, 800)}

Score:`,
      },
    ], 16);

    const score = parseInt(response.replace(/\D/g, ''), 10);
    return isNaN(score) ? 60 : Math.min(100, Math.max(0, score));
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
  if (!GROQ_API_KEY) return '';

  try {
    return await callGroq([
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
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=10&type=generic`,
      { headers: { accept: 'application/json' } }
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ResumeATS/1.0)',
          'Accept': 'text/html',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!res.ok) continue;

      const html = await res.text();
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
        log(`Scraped email from ${url}: ${hiringEmails[0]}`);
        return hiringEmails[0];
      }

      // If no hiring email, return any email on the domain
      const domainEmails = found.filter((e) => e.toLowerCase().endsWith(`@${domain}`) || e.toLowerCase().endsWith(`@www.${domain}`));
      if (domainEmails.length > 0) {
        log(`Scraped domain email from ${url}: ${domainEmails[0]}`);
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
 * Verify a specific email address exists using a free verification API.
 * Uses the Disify API (free, no key needed) to check deliverability.
 * Returns true if the email is deliverable, false if not.
 */
async function verifyEmailExists(email: string): Promise<boolean> {
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
 * then verify the specific email address exists before returning it.
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

    log(`${domain} has MX records — verifying specific addresses`);
  } catch {
    log(`DNS lookup failed for ${domain}`);
    return null;
  }

  // Try common hiring email patterns — verify each one exists
  for (const prefix of HIRING_PREFIXES) {
    const candidate = `${prefix}@${domain}`;
    const exists = await verifyEmailExists(candidate);
    if (exists) {
      log(`Verified email exists: ${candidate}`);
      return candidate;
    }
    log(`Email not found: ${candidate}`);
  }

  log(`No valid email found for ${domain} after checking all patterns`);
  return null;
}

/**
 * Use AI to extract an email from the job description if one is mentioned.
 */
async function aiExtractEmail(jobDescription: string): Promise<string | null> {
  if (!GROQ_API_KEY) return null;

  try {
    const response = await callGroq([
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

    // Validate it looks like an email
    const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0] : null;
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
 *   4. Common pattern guessing with DNS MX verification
 */
async function discoverEmail(job: DiscoveredJob): Promise<string | null> {
  // Already has an email
  if (job.contact_email) return job.contact_email;

  // 1. Check if the job description mentions an email directly
  const aiEmail = await aiExtractEmail(job.job_description);
  if (aiEmail) {
    const verified = await verifyEmailExists(aiEmail);
    if (verified) {
      log(`AI found verified email: ${aiEmail}`);
      return aiEmail;
    }
    log(`AI found email ${aiEmail} but it failed verification — skipping`);
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
    const verified = await verifyEmailExists(hunterEmail);
    if (verified) {
      log(`Hunter.io found verified email: ${hunterEmail}`);
      return hunterEmail;
    }
    log(`Hunter.io found ${hunterEmail} but it failed verification`);
  }

  // 4. Scrape careers/contact pages
  const scrapedEmail = await scrapeForEmail(domain);
  if (scrapedEmail) {
    const verified = await verifyEmailExists(scrapedEmail);
    if (verified) {
      log(`Scraped verified email: ${scrapedEmail}`);
      return scrapedEmail;
    }
    log(`Scraped ${scrapedEmail} but it failed verification`);
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
    log(`[DRY RUN] Would send email to ${toEmail} (reply-to: apply+${jobId}@${REPLY_DOMAIN})`);
    return `dry-run-${jobId}`;
  }

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
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; line-height: 1.6; color: #333;">
            ${coverLetter.split('\n').filter((l: string) => l.trim()).map((p: string) => `<p style="margin: 0 0 12px 0;">${p}</p>`).join('')}
            ${userReplyEmail ? `<p style="font-size: 13px; color: #666; margin-top: 16px;">You can also reach me at: <a href="mailto:${userReplyEmail}">${userReplyEmail}</a></p>` : ''}
          </div>
        `,
        textContent: coverLetter + (userReplyEmail ? `\n\nYou can also reach me at: ${userReplyEmail}` : ''),
        headers: {
          'X-Auto-Apply-Job-Id': jobId,
          charset: 'utf-8',
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      log(`Brevo API error: ${res.status} ${errorText}`);
      return null;
    }

    const data = await res.json();
    const messageId = data.messageId || null;
    log(`Email sent to ${toEmail}, messageId: ${messageId}`);
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(jobUrl, {
      method: 'HEAD', // HEAD is faster — no body downloaded
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResumeATS/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    // 404 or 410 = job removed/expired
    if (res.status === 404 || res.status === 410) {
      log(`Job URL returned ${res.status} — expired: ${jobUrl}`);
      return false;
    }

    return true;
  } catch {
    // Timeout or network error — give benefit of doubt
    return true;
  }
}

/**
 * Generate a simple but clean PDF from resume JSON data, server-side.
 * Uses raw PDF spec — no external library needed.
 * Returns base64-encoded PDF string.
 */
function generateResumePdfFromData(resume: Record<string, unknown>): string {
  const pi = resume.personal_info as Record<string, string> | undefined;
  const work = resume.work_experience as Array<Record<string, string>> | undefined;
  const education = resume.education as Array<Record<string, string>> | undefined;
  const skills = resume.skills as Array<Record<string, unknown>> | undefined;
  const projects = resume.projects as Array<Record<string, string>> | undefined;

  // Build plain text content for the PDF
  const lines: string[] = [];

  // Header
  if (pi?.fullName) lines.push(pi.fullName.toUpperCase());
  if (pi?.jobTitle) lines.push(pi.jobTitle);
  const contactParts: string[] = [];
  if (pi?.email) contactParts.push(pi.email);
  if (pi?.phone) contactParts.push(pi.phone);
  if (pi?.location) contactParts.push(pi.location);
  if (pi?.linkedin) contactParts.push(pi.linkedin);
  if (contactParts.length > 0) lines.push(contactParts.join(' | '));
  lines.push('');

  // Work Experience
  if (Array.isArray(work) && work.length > 0) {
    lines.push('WORK EXPERIENCE');
    lines.push('---');
    for (const w of work) {
      lines.push(`${w.jobTitle || ''} at ${w.company || ''}${w.startDate ? ` (${w.startDate} - ${w.endDate || 'Present'})` : ''}`);
      if (w.description) {
        // Split description into bullet points
        const bullets = w.description.split(/[\n•-]/).map((b: string) => b.trim()).filter(Boolean);
        for (const b of bullets) lines.push(`  * ${b}`);
      }
      lines.push('');
    }
  }

  // Education
  if (Array.isArray(education) && education.length > 0) {
    lines.push('EDUCATION');
    lines.push('---');
    for (const e of education) {
      lines.push(`${e.degree || ''} ${e.fieldOfStudy || ''} - ${e.school || ''}${e.startDate ? ` (${e.startDate} - ${e.endDate || 'Present'})` : ''}`);
      if (e.description) lines.push(`  ${e.description}`);
      lines.push('');
    }
  }

  // Skills
  if (Array.isArray(skills) && skills.length > 0) {
    lines.push('SKILLS');
    lines.push('---');
    const skillNames = skills.map((s) => (typeof s === 'string' ? s : (s as Record<string, string>).name || (s as Record<string, string>).skill || '')).filter(Boolean);
    lines.push(skillNames.join(', '));
    lines.push('');
  }

  // Projects
  if (Array.isArray(projects) && projects.length > 0) {
    lines.push('PROJECTS');
    lines.push('---');
    for (const p of projects) {
      lines.push(`${p.name || p.title || ''}${p.url ? ` - ${p.url}` : ''}`);
      if (p.description) lines.push(`  ${p.description}`);
      lines.push('');
    }
  }

  const text = lines.join('\n');

  // Generate minimal valid PDF (text-only, clean and parseable by ATS)
  // This creates a proper PDF 1.4 document
  const pdfLines = text.split('\n');
  const fontSize = 10;
  const lineHeight = 14;
  const marginLeft = 50;
  const marginTop = 750;
  const pageWidth = 612; // Letter size
  const pageHeight = 792;

  // Build PDF text operations
  let yPos = marginTop;
  let textOps = '';

  for (const line of pdfLines) {
    if (yPos < 50) break; // Stop if we run out of page

    const escaped = line
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, ''); // Strip non-ASCII for PDF safety

    if (line === '---') {
      // Draw a line
      textOps += `${marginLeft} ${yPos - 2} m ${pageWidth - marginLeft} ${yPos - 2} l S\n`;
      yPos -= lineHeight;
    } else if (line === line.toUpperCase() && line.length > 2 && !line.includes('|') && !line.includes('*')) {
      // Section header or name — bold-ish (larger font)
      const headerSize = line === pdfLines[0] ? 16 : 12;
      textOps += `BT /F1 ${headerSize} Tf ${marginLeft} ${yPos} Td (${escaped}) Tj ET\n`;
      yPos -= lineHeight + (headerSize > 12 ? 4 : 2);
    } else if (line.trim() === '') {
      yPos -= lineHeight / 2;
    } else {
      textOps += `BT /F1 ${fontSize} Tf ${marginLeft} ${yPos} Td (${escaped}) Tj ET\n`;
      yPos -= lineHeight;
    }
  }

  // Assemble PDF structure
  const stream = textOps;
  const streamLength = stream.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamLength} >>
stream
${stream}endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000282 00000 n
0000000${(338 + streamLength).toString().padStart(4, '0')} 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;

  // Base64 encode
  const encoder = new TextEncoder();
  const bytes = encoder.encode(pdf);
  const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

async function loadResumeSnapshot(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  resumeId: string,
): Promise<Record<string, unknown> | null> {
  const { data: resumeMeta, error: resumeError } = await supabase
    .from('resumes')
    .select('id, user_id, title, description, selected_template, selected_font, is_public, created_at, updated_at')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (resumeError) {
    throw resumeError;
  }

  if (!resumeMeta) {
    return null;
  }

  const { data: resumeContent, error: contentError } = await supabase
    .from('resume_content')
    .select('personal_info, work_experience, education, skills, certifications, projects, additional_sections')
    .eq('resume_id', resumeId)
    .maybeSingle();

  if (contentError) {
    throw contentError;
  }

  return {
    ...resumeMeta,
    ...(resumeContent || {}),
  };
}

function resumeToText(resume: Record<string, unknown>): string {
  const parts: string[] = [];
  const pi = resume.personal_info as Record<string, string> | undefined;
  if (pi?.fullName) parts.push(`Name: ${pi.fullName}`);
  if (pi?.jobTitle) parts.push(`Title: ${pi.jobTitle}`);

  const work = resume.work_experience as Array<Record<string, string>> | undefined;
  if (Array.isArray(work)) {
    for (const w of work.slice(0, 3)) {
      parts.push(`${w.jobTitle || ''} at ${w.company || ''}: ${w.description || ''}`);
    }
  }

  const skills = resume.skills as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(skills)) {
    const flat = skills.map((s) => s.name || s.skill || '').filter(Boolean);
    if (flat.length > 0) parts.push(`Skills: ${flat.join(', ')}`);
  }

  const projects = resume.projects as Array<Record<string, string>> | undefined;
  if (Array.isArray(projects)) {
    for (const project of projects.slice(0, 2)) {
      parts.push(`${project.title || 'Project'}: ${project.description || ''}`);
    }
  }

  const certifications = resume.certifications as Array<Record<string, string>> | undefined;
  if (Array.isArray(certifications)) {
    for (const cert of certifications.slice(0, 3)) {
      parts.push(`Certification: ${cert.name || ''} ${cert.issuer ? `(${cert.issuer})` : ''}`.trim());
    }
  }

  return parts.join('\n').slice(0, 1500);
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
  } catch {
    requestBody = {};
  }

  const discoverOnly = requestBody.discover_only !== false;
  const userId = authUser.userId;
  const supabase = adminClient();

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('auto_apply_runs')
    .insert({ user_id: userId, status: 'running' })
    .select()
    .single();

  if (runError || !run) {
    return new Response(JSON.stringify({ error: 'Failed to create run record' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const runId = run.id;

  try {
    // 1. Load preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('job_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError || !prefs) {
      throw new Error('Job preferences not found. Please configure your preferences first.');
    }

    if (!prefs.is_active && !discoverOnly) {
      throw new Error('Auto-apply is paused. Please activate it first.');
    }

    // 2. Check daily limit
    const today = new Date().toISOString().split('T')[0];
    const { count: appliedToday } = await supabase
      .from('auto_apply_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['applied', 'replied', 'interview'])
      .gte('applied_at', `${today}T00:00:00Z`);

    const remaining = discoverOnly
      ? prefs.daily_limit
      : prefs.daily_limit - (appliedToday || 0);
    if (remaining <= 0) {
      throw new Error(discoverOnly
        ? `No discovery slots available. Increase your daily limit above ${prefs.daily_limit}.`
        : `Daily limit of ${prefs.daily_limit} applications reached.`);
    }

    // 3. Load resume
    let resumeText = '';
    if (prefs.default_resume_id) {
      const resume = await loadResumeSnapshot(supabase, userId, prefs.default_resume_id);

      if (resume) resumeText = resumeToText(resume);
    }

    // 3b. Load Gmail connection only for outreach-style runs
    const { data: gmailConn } = discoverOnly ? { data: null } : await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    let useGmail = !!(gmailConn?.access_token && gmailConn?.refresh_token);
    if (!discoverOnly && useGmail) {
      log(`Gmail connected: ${gmailConn.email} — sending via Gmail`);
    } else if (!discoverOnly) {
      log('No Gmail connection — sending via Brevo');
    }

    // 4. Build seen-jobs set for deduplication
    const { data: existingJobs } = await supabase
      .from('auto_apply_jobs')
      .select('external_job_id')
      .eq('user_id', userId);

    const seenIds = new Set((existingJobs || []).map((j: { external_job_id: string }) => j.external_job_id));

    // 5. Main loop — keep searching & applying until daily limit is filled
    const MIN_MATCH_SCORE = 75;
    const MAX_PAGES_PER_QUERY = 5; // Max pages to paginate per job title
    const MAX_TOTAL_API_CALLS = 15; // Safety cap on total JSearch API calls
    let applied = 0;
    let acceptedCount = 0;
    let skipped = 0;
    let failed = 0;
    let totalDiscovered = 0;
    let totalApiCalls = 0;
    const senderName = prefs.sender_name || SENDER_NAME_DEFAULT;
    const userReplyEmail = prefs.reply_to_email || '';
    const queries = prefs.job_titles.length > 0 ? prefs.job_titles : ['Software Engineer'];
    if (discoverOnly) {
      useGmail = false;
      log('Discover-only run active - jobs will be queued for browser autofill only');
    }

    // Use mock data only when no live discovery provider is configured
    if (!JSEARCH_API_KEY && !BRIGHT_DATA_API_TOKEN) {
      log('No JSearch or Bright Data API key set - using mock discovery data');
      log('JSEARCH_API_KEY not set — using mock data');
      const mockJobs = getMockJobs(prefs as JobPreferences);
      for (const job of mockJobs) {
        if (acceptedCount >= remaining) break;
        if (seenIds.has(job.external_job_id)) continue;
        seenIds.add(job.external_job_id);
        totalDiscovered++;
        // Mock jobs all count as accepted matches
        acceptedCount++;
      }
    } else {
      // Real search loop: iterate through queries and pages
      for (const query of queries) {
        if (acceptedCount >= remaining) break;

        for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
          if (acceptedCount >= remaining || totalApiCalls >= MAX_TOTAL_API_CALLS) break;

          log(`Searching "${query}" page ${page} (${discoverOnly ? 'queued' : 'applied'}: ${acceptedCount}/${remaining})...`);
          let pageJobs: DiscoveredJob[] = [];

          if (page === 1 && BRIGHT_DATA_API_TOKEN && totalApiCalls < MAX_TOTAL_API_CALLS) {
            const linkedInJobs = await searchLinkedInJobsByKeyword(prefs as JobPreferences, query);
            pageJobs = pageJobs.concat(linkedInJobs);
            totalApiCalls++;
          }

          if (JSEARCH_API_KEY && totalApiCalls < MAX_TOTAL_API_CALLS) {
            const jsearchJobs = await searchJobsPage(prefs as JobPreferences, query, page);
            pageJobs = pageJobs.concat(jsearchJobs);
            totalApiCalls++;
          } else if (!JSEARCH_API_KEY && page > 1) {
            break;
          }

          if (pageJobs.length === 0) {
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
            if (acceptedCount >= remaining) break;

            // Check if job posting is still active
            const jobActive = await isJobStillActive(job.job_url);
            if (!jobActive) {
              log(`Skipping expired job: ${job.title} @ ${job.company}`);
              skipped++;
              continue;
            }

            // Score the job
            const matchScore = await scoreJob(job, prefs as JobPreferences, resumeText);
            log(`${job.title} @ ${job.company}: score ${matchScore}`);

            // Skip if below minimum match score (don't save to DB — no point showing these)
            if (matchScore < MIN_MATCH_SCORE) {
              skipped++;
              continue;
            }

            // Insert job to get ID for unique reply-to address
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

            if (job.contact_email) {
              const emailSubject = `Application for ${job.title} - ${senderName}`;
              // Only show "reach me at" for Brevo emails (different sender), not Gmail (same address)
              const showReachMe = !useGmail && userReplyEmail;
              const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; line-height: 1.6; color: #333;">
                  ${coverLetter.split('\n').filter((l: string) => l.trim()).map((p: string) => `<p style="margin: 0 0 12px 0;">${p}</p>`).join('')}
                  ${showReachMe ? `<p style="font-size: 13px; color: #666; margin-top: 16px;">You can also reach me at: <a href="mailto:${userReplyEmail}">${userReplyEmail}</a></p>` : ''}
                </div>`;

              // Try to fetch resume PDF from Supabase Storage
              let resumePdfBase64: string | undefined;
              const resumeFilename = `${senderName.replace(/[^a-zA-Z0-9 ]/g, '_').replace(/_+/g, '_')}_Resume.pdf`;
              if (prefs.default_resume_id) {
                const storagePath = `${userId}/${prefs.default_resume_id}.pdf`;
                log(`Looking for resume PDF at: resumes/${storagePath}`);
                try {
                  const { data: pdfData, error: pdfError } = await supabase.storage
                    .from('resumes')
                    .download(storagePath);
                  if (pdfError) {
                    log(`Resume PDF not found: ${pdfError.message}`);
                  } else if (pdfData) {
                    const buffer = await pdfData.arrayBuffer();
                    const bytes = new Uint8Array(buffer);
                    const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
                    resumePdfBase64 = btoa(binary);
                    log(`Resume PDF found (${bytes.length} bytes), will attach as ${resumeFilename}`);
                  }
                } catch (err) {
                  log(`Resume PDF fetch error: ${err}`);
                }
              }

              // Fallback: generate PDF from resume data if none in storage
              if (!resumePdfBase64 && prefs.default_resume_id) {
                try {
                  const resumeData = await loadResumeSnapshot(supabase, userId, prefs.default_resume_id);

                  if (resumeData) {
                    resumePdfBase64 = generateResumePdfFromData(resumeData);
                    log('Generated PDF from resume data (fallback)');
                  }
                } catch (err) {
                  log(`PDF generation fallback error: ${err}`);
                }
              }

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

                log(emailSent ? `Gmail sent to ${job.contact_email}` : `Gmail failed: ${result.error}`);
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
            const failureReason = !job.contact_email ? 'No contact email found' : (!emailSent ? 'Email sending failed' : null);

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
    await supabase
      .from('auto_apply_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        jobs_discovered: totalDiscovered,
        jobs_applied: applied,
        jobs_skipped: skipped,
        jobs_failed: failed,
      })
      .eq('id', runId);

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
    console.error('[auto-apply] Run failed:', message);

    await supabase
      .from('auto_apply_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', runId);

    return new Response(
      JSON.stringify({ error: message, run_id: runId }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  }
});
