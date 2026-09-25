/**
 * Job Inbox pure helpers — application-level dedupe and hunt stats.
 * Counts applications (company+role), never raw emails.
 */

export const INBOX_CATEGORIES = [
  'application_sent',
  'application_receipt',
  'reply',
  'interview',
  'rejection',
  'offer',
  'recruiter_outreach',
  'noise',
  'unknown',
];

/** Categories that create a new application when none matches. */
export const CREATE_APPLICATION_CATEGORIES = new Set([
  'application_sent',
  'application_receipt',
]);

/** Categories that may upgrade an existing application's status. */
export const STATUS_UPGRADE_CATEGORIES = new Set([
  'reply',
  'interview',
  'rejection',
  'offer',
  'application_receipt',
]);

const STATUS_RANK = {
  saved: 0,
  applied: 1,
  screening: 2,
  interview: 3,
  offer: 4,
  // Terminal outcomes — only apply when current is not already terminal at same/higher priority
  rejected: 5,
  withdrawn: 5,
};

const CATEGORY_TO_STATUS = {
  application_sent: 'applied',
  application_receipt: 'applied',
  reply: 'screening',
  interview: 'interview',
  rejection: 'rejected',
  offer: 'offer',
};

const HIGH_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Normalize free-text company / position for stable dedupe keys.
 */
export function normalizeInboxPart(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build company|position dedupe key. Returns null if either part is empty.
 */
export function buildDedupeKey(company, position) {
  const c = normalizeInboxPart(company);
  const p = normalizeInboxPart(position);
  if (!c || !p) return null;
  return `${c}|${p}`;
}

export function categoryToStatus(category) {
  return CATEGORY_TO_STATUS[category] || null;
}

export function shouldCreateApplication(category) {
  return CREATE_APPLICATION_CATEGORIES.has(category);
}

export function shouldUpgradeStatus(category) {
  return STATUS_UPGRADE_CATEGORIES.has(category);
}

export function isHighConfidence(confidence) {
  const n = Number(confidence);
  return Number.isFinite(n) && n >= HIGH_CONFIDENCE_THRESHOLD;
}

/**
 * Merge inbound AI category into current application status.
 * Never downgrades pipeline progress. Rejection/withdrawn only apply when
 * current is not already offer (offer wins over rejection noise).
 * Returns null when no change should be written.
 */
export function mergeStatus(currentStatus, category, { confidence = 1, force = false } = {}) {
  if (!force && !isHighConfidence(confidence)) return null;
  if (!shouldUpgradeStatus(category) && category !== 'application_sent') return null;

  const next = categoryToStatus(category);
  if (!next) return null;

  const current = currentStatus || 'saved';
  if (current === next) return null;

  const currentRank = STATUS_RANK[current] ?? 0;
  const nextRank = STATUS_RANK[next] ?? 0;

  // Never undo an offer with a rejection.
  if (current === 'offer' && next === 'rejected') return null;
  // Never move withdrawn/rejected back into active pipeline via weak categories.
  if ((current === 'rejected' || current === 'withdrawn') && nextRank < STATUS_RANK.rejected) {
    return null;
  }
  // Only upgrade (or move to terminal rejection from applied/screening/interview).
  if (next === 'rejected') {
    if (['applied', 'screening', 'interview', 'saved'].includes(current)) return 'rejected';
    return null;
  }
  if (nextRank <= currentRank) return null;
  return next;
}

/**
 * Find best matching application for an inbox event.
 * Prefer thread id, then exact dedupe key, then company-only when unique.
 */
export function findMatchingApplication(applications, { gmailThreadId, dedupeKey, company } = {}) {
  const apps = Array.isArray(applications) ? applications : [];
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
    if (byKey.length > 1) return byKey[0]; // unique index should prevent this
    // Dedupe key known but no match — do NOT fall back to company-only
    // (same company, different role must stay separate).
    return null;
  }
  const companyNorm = normalizeInboxPart(company);
  if (companyNorm) {
    const byCompany = apps.filter((a) => normalizeInboxPart(a.company) === companyNorm);
    if (byCompany.length === 1) return byCompany[0];
  }
  return null;
}

/**
 * Apply a classified event onto an in-memory applications list (for tests / dry-run).
 * Mutates nothing; returns { applications, created, updated, skipped }.
 */
export function applyInboxEvent(applications, event) {
  const list = (applications || []).map((a) => ({ ...a }));
  const category = event.category || 'unknown';
  const dedupeKey = event.dedupe_key || buildDedupeKey(event.company_guess, event.position_guess);
  const confidence = event.confidence ?? 0;

  let match = event.application_id
    ? list.find((a) => a.id === event.application_id) || null
    : findMatchingApplication(list, {
      gmailThreadId: event.gmail_thread_id,
      dedupeKey,
      company: event.company_guess,
    });

  if (!match && shouldCreateApplication(category) && dedupeKey) {
    const created = {
      id: event.synthetic_id || `app-${dedupeKey}`,
      company: event.company_guess || 'Unknown company',
      position: event.position_guess || 'Unknown role',
      status: 'applied',
      dedupe_key: dedupeKey,
      gmail_thread_id: event.gmail_thread_id || null,
      source: 'inbox',
      applied_at: event.internal_date || new Date().toISOString(),
      response_at: null,
      last_email_at: event.internal_date || null,
    };
    list.push(created);
    return { applications: list, created: created, updated: null, skipped: false };
  }

  if (!match) {
    return { applications: list, created: null, updated: null, skipped: true };
  }

  const nextStatus = mergeStatus(match.status, category, { confidence: confidence });
  const idx = list.findIndex((a) => a.id === match.id);
  const updated = {
    ...list[idx],
    gmail_thread_id: list[idx].gmail_thread_id || event.gmail_thread_id || null,
    last_email_at: event.internal_date || list[idx].last_email_at || null,
    dedupe_key: list[idx].dedupe_key || dedupeKey || null,
  };

  if (nextStatus) {
    updated.previous_status = match.status;
    updated.status = nextStatus;
    if (['screening', 'interview', 'offer', 'rejected'].includes(nextStatus) && !updated.response_at) {
      updated.response_at = event.internal_date || new Date().toISOString();
    }
    if (nextStatus !== 'saved' && !updated.applied_at) {
      updated.applied_at = event.internal_date || new Date().toISOString();
    }
  }

  list[idx] = updated;
  return {
    applications: list,
    created: null,
    updated: nextStatus ? updated : null,
    skipped: !nextStatus && !shouldCreateApplication(category),
  };
}

/**
 * Reduce a sequence of inbox events into applications with correct dedupe.
 */
export function reduceInboxEvents(events, seedApplications = []) {
  let applications = (seedApplications || []).map((a) => ({ ...a }));
  let createdCount = 0;
  let updatedCount = 0;
  for (const event of events || []) {
    const result = applyInboxEvent(applications, event);
    applications = result.applications;
    if (result.created) createdCount += 1;
    if (result.updated) updatedCount += 1;
  }
  return { applications, createdCount, updatedCount };
}

/**
 * Hunt statistics — always over applications, never over email events.
 */
export function computeHuntStats(applications = []) {
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

export function mapStatsFromRpc(row) {
  if (!row) {
    return computeHuntStats([]);
  }
  return {
    totalApplied: Number(row.total_applied) || 0,
    gotReply: Number(row.got_reply) || 0,
    interviews: Number(row.interviews) || 0,
    waiting: Number(row.waiting) || 0,
    rejections: Number(row.rejections) || 0,
    offers: Number(row.offers) || 0,
    withdrawn: Number(row.withdrawn) || 0,
    saved: Number(row.saved) || 0,
    replyRate: Number(row.reply_rate) || 0,
    interviewRate: Number(row.interview_rate) || 0,
  };
}

export const INBOX_BUCKETS = {
  needs_reply: (event) => event.category === 'reply',
  interviews: (event) => event.category === 'interview',
  waiting: (app) => app.status === 'applied',
  rejections: (event) => event.category === 'rejection' || event.status === 'rejected',
  offers: (event) => event.category === 'offer' || event.status === 'offer',
  recruiter_outreach: (event) => event.category === 'recruiter_outreach',
  noise: (event) => event.category === 'noise',
};

export { HIGH_CONFIDENCE_THRESHOLD };
