import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';

const MAX_REPORT_BYTES = 32 * 1024;
const MAX_REPORTS = 10;

const clamp = (value, maxLength, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
};

const safeJson = (value) => {
  try {
    // Vercel may supply raw bytes/text or an already parsed JSON body. Check
    // actual UTF-8 payload size in every case; Content-Length is not trusted.
    const serialized = Buffer.isBuffer(value) ? value : typeof value === 'string'
      ? value : JSON.stringify(value);
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_REPORT_BYTES) return null;
    return JSON.parse(Buffer.isBuffer(serialized) ? serialized.toString('utf8') : serialized);
  } catch {
    return null;
  }
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const safeUrl = (value) => {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    // Recovery links, signed URLs and referrers can carry credentials/tokens.
    return clamp(`${url.origin}${url.pathname}`, 1000);
  } catch {
    return '';
  }
};

const safeBlockedUrl = (value) => {
  if (typeof value !== 'string') return '';
  if (['inline', 'eval', 'wasm-eval', 'self'].includes(value)) return value;
  if (/^(data|blob):/i.test(value)) return `${value.slice(0, 4).toLowerCase()}:`;
  return safeUrl(value);
};

const normalizeReport = (entry) => {
  if (!isRecord(entry)) return null;
  const legacy = isRecord(entry['csp-report']);
  const report = legacy ? entry['csp-report']
    : entry.type === 'csp-violation' && isRecord(entry.body) ? entry.body : null;
  if (!report) return null;
  const documentUri = safeUrl(report['document-uri'] || report.documentURL || (!legacy && entry.url));
  const rawDirective = report['effective-directive'] || report.effectiveDirective || report['violated-directive'];
  if (!documentUri || typeof rawDirective !== 'string') return null;
  const directive = rawDirective.trim().split(/\s/, 1)[0];
  if (!/^[a-z][a-z0-9-]{0,79}$/i.test(directive)) return null;
  return {
    directive,
    blockedUri: safeBlockedUrl(report['blocked-uri'] || report.blockedURL),
    documentUri,
    disposition: ['enforce', 'report'].includes(report.disposition) ? report.disposition : '',
    referrer: safeUrl(report.referrer),
  };
};

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SB_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
};

export default async function handler(req, res) {
  // Anonymous CSP reports have no trustworthy user identity. Keep persistence
  // off until a distributed ingress limit and retention policy are configured.
  // This opt-in is NOT itself a rate limiter; an in-process Map is insufficient.
  if (req.method !== 'POST' || process.env.CSP_REPORT_PERSISTENCE_ENABLED !== 'true') {
    res.status(204).send();
    return;
  }

  const contentLength = Number(req.headers?.['content-length'] || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    res.status(204).send();
    return;
  }

  const parsed = safeJson(req.body);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const reports = entries.length <= MAX_REPORTS ? entries.map(normalizeReport).filter(Boolean) : [];

  if (reports.length) {
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { error } = await supabase.from('app_error_events').insert(reports.map((report) => ({
          severity: 'warning',
          source: 'csp-report',
          message: `CSP violation: ${report.directive}`,
          stack: '',
          // Deliberately exclude original-policy, script samples and unknown
          // fields: those may contain nonces, tokens or application content.
          context: report,
          url: report.documentUri,
          user_agent: clamp(req.headers?.['user-agent'], 1200),
        })));
        if (error && process.env.NODE_ENV === 'development') console.warn('Failed to persist CSP report');
      }
    } catch {
      if (process.env.NODE_ENV === 'development') console.warn('Failed to persist CSP report');
    }
  }

  res.status(204).send();
}
