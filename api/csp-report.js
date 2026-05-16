import { createClient } from '@supabase/supabase-js';

const MAX_REPORT_BYTES = 32 * 1024;

const clamp = (value, maxLength, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
};

const safeJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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
  if (req.method !== 'POST') {
    res.status(204).send();
    return;
  }

  const contentLength = Number(req.headers['content-length'] || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    res.status(204).send();
    return;
  }

  const parsed = safeJson(req.body);
  const report = parsed['csp-report'] || parsed.body || parsed;
  const directive = clamp(report['violated-directive'] || report.effectiveDirective, 160, 'unknown');
  const blockedUri = clamp(report['blocked-uri'] || report.blockedURL, 1000, '');
  const documentUri = clamp(report['document-uri'] || report.documentURL, 1000, '');
  const originalPolicy = clamp(report['original-policy'], 4000, '');
  const supabase = getSupabaseAdmin();

  if (supabase) {
    try {
      await supabase.from('app_error_events').insert({
        severity: 'warning',
        source: 'csp-report',
        message: `CSP violation: ${directive}`,
        stack: '',
        context: {
          directive,
          blockedUri,
          documentUri,
          originalPolicy,
          disposition: report.disposition || '',
          referrer: report.referrer || '',
        },
        url: documentUri,
        user_agent: clamp(req.headers['user-agent'], 1200, ''),
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to persist CSP report:', error?.message || error);
      }
    }
  }

  res.status(204).send();
}
