/**
 * Job Inbox dedupe helpers for Edge Functions (mirrors src/utils/jobInboxDedupe.js).
 */

export const CREATE_APPLICATION_CATEGORIES = new Set([
  'application_sent',
  'application_receipt',
]);

export const STATUS_UPGRADE_CATEGORIES = new Set([
  'reply',
  'interview',
  'rejection',
  'offer',
  'application_receipt',
]);

const STATUS_RANK: Record<string, number> = {
  saved: 0,
  applied: 1,
  screening: 2,
  interview: 3,
  offer: 4,
  rejected: 5,
  withdrawn: 5,
};

const CATEGORY_TO_STATUS: Record<string, string> = {
  application_sent: 'applied',
  application_receipt: 'applied',
  reply: 'screening',
  interview: 'interview',
  rejection: 'rejected',
  offer: 'offer',
};

export const HIGH_CONFIDENCE_THRESHOLD = 0.75;

export function normalizeInboxPart(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDedupeKey(company: unknown, position: unknown): string | null {
  const c = normalizeInboxPart(company);
  const p = normalizeInboxPart(position);
  if (!c || !p) return null;
  return `${c}|${p}`;
}

export function categoryToStatus(category: string): string | null {
  return CATEGORY_TO_STATUS[category] || null;
}

export function shouldCreateApplication(category: string): boolean {
  return CREATE_APPLICATION_CATEGORIES.has(category);
}

export function isHighConfidence(confidence: unknown): boolean {
  const n = Number(confidence);
  return Number.isFinite(n) && n >= HIGH_CONFIDENCE_THRESHOLD;
}

export function mergeStatus(
  currentStatus: string | null | undefined,
  category: string,
  opts: { confidence?: number; force?: boolean } = {},
): string | null {
  const { confidence = 1, force = false } = opts;
  if (!force && !isHighConfidence(confidence)) return null;
  if (!STATUS_UPGRADE_CATEGORIES.has(category) && category !== 'application_sent') return null;

  const next = categoryToStatus(category);
  if (!next) return null;

  const current = currentStatus || 'saved';
  if (current === next) return null;

  const currentRank = STATUS_RANK[current] ?? 0;
  const nextRank = STATUS_RANK[next] ?? 0;

  if (current === 'offer' && next === 'rejected') return null;
  if ((current === 'rejected' || current === 'withdrawn') && nextRank < STATUS_RANK.rejected) {
    return null;
  }
  if (next === 'rejected') {
    if (['applied', 'screening', 'interview', 'saved'].includes(current)) return 'rejected';
    return null;
  }
  if (nextRank <= currentRank) return null;
  return next;
}

export type AppRow = {
  id: string;
  company: string;
  position: string;
  status: string;
  dedupe_key?: string | null;
  gmail_thread_id?: string | null;
  applied_at?: string | null;
  response_at?: string | null;
};

export function findMatchingApplication(
  applications: AppRow[],
  opts: { gmailThreadId?: string | null; dedupeKey?: string | null; company?: string | null } = {},
): AppRow | null {
  const apps = Array.isArray(applications) ? applications : [];
  const { gmailThreadId, dedupeKey, company } = opts;

  if (gmailThreadId) {
    const byThread = apps.filter((a) => a.gmail_thread_id === gmailThreadId);
    if (byThread.length === 1) return byThread[0];
    if (byThread.length > 1 && dedupeKey) {
      const narrowed = byThread.filter((a) => a.dedupe_key === dedupeKey);
      if (narrowed.length === 1) return narrowed[0];
    }
  }
  if (dedupeKey) {
    const byKey = apps.filter((a) => a.dedupe_key === dedupeKey);
    if (byKey.length === 1) return byKey[0];
    if (byKey.length > 1) return byKey[0];
    return null;
  }
  const companyNorm = normalizeInboxPart(company);
  if (companyNorm) {
    const byCompany = apps.filter((a) => normalizeInboxPart(a.company) === companyNorm);
    if (byCompany.length === 1) return byCompany[0];
  }
  return null;
}

export function computeHuntStats(applications: AppRow[] = []) {
  const apps = Array.isArray(applications) ? applications : [];
  const submitted = apps.filter((a) => a.status !== 'saved');
  const gotReply = submitted.filter(
    (a) => a.response_at || ['screening', 'interview', 'offer', 'rejected'].includes(a.status),
  ).length;
  const interviews = submitted.filter((a) => a.status === 'interview' || a.status === 'offer').length;
  const waiting = submitted.filter((a) => a.status === 'applied').length;
  const rejections = submitted.filter((a) => a.status === 'rejected').length;
  const offers = submitted.filter((a) => a.status === 'offer').length;
  const withdrawn = submitted.filter((a) => a.status === 'withdrawn').length;
  const saved = apps.filter((a) => a.status === 'saved').length;
  const totalApplied = submitted.length;

  return {
    totalApplied,
    gotReply,
    interviews,
    waiting,
    rejections,
    offers,
    withdrawn,
    saved,
    replyRate: totalApplied ? Math.round((gotReply / totalApplied) * 100) : 0,
    interviewRate: totalApplied ? Math.round((interviews / totalApplied) * 100) : 0,
  };
}

export const VALID_CATEGORIES = [
  'application_sent',
  'application_receipt',
  'reply',
  'interview',
  'rejection',
  'offer',
  'recruiter_outreach',
  'noise',
  'unknown',
] as const;

export type InboxCategory = typeof VALID_CATEGORIES[number];

export function parseClassifierResponse(raw: string): { category: InboxCategory; confidence: number; company: string; position: string; reason: string } {
  const text = (raw || '').trim();
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const categoryRaw = String(parsed.category || 'unknown').toLowerCase().trim();
      const category = (VALID_CATEGORIES as readonly string[]).includes(categoryRaw)
        ? categoryRaw as InboxCategory
        : 'unknown';
      const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
      return {
        category,
        confidence,
        company: typeof parsed.company === 'string' ? parsed.company.trim() : '',
        position: typeof parsed.position === 'string' ? parsed.position.trim() : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 300) : '',
      };
    }
  } catch {
    // fall through
  }
  const lower = text.toLowerCase();
  for (const cat of VALID_CATEGORIES) {
    if (lower.includes(cat)) {
      return { category: cat, confidence: 0.6, company: '', position: '', reason: 'keyword fallback' };
    }
  }
  return { category: 'unknown', confidence: 0.3, company: '', position: '', reason: 'unparsed' };
}
