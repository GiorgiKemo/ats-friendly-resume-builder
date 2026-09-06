import { canonicalJobUrl } from './resume-handoff.js';

export const CAMPAIGN_STORAGE_KEY = 'resumeatsApplicationCampaign';
export const CAMPAIGN_TTL_MS = 8 * 60 * 60 * 1000;
export const CAMPAIGN_ALARM = 'resumeats-campaign-watchdog';

export function applicationKey(value) {
  const url = new URL(canonicalJobUrl(value));
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

// Incoming discovery data must never reset a completed or unresolved attempt.
export function mergeApplicationQueue(existing = [], incoming = []) {
  const result = [...existing];
  const keys = new Set(existing.map(job => { try { return applicationKey(job.url); } catch { return job.id; } }));
  const ids = new Set(existing.map(job => job.id));
  for (const job of incoming) {
    if (!job || typeof job.id !== 'string' || !job.id || ids.has(job.id)) continue;
    let key;
    try { key = applicationKey(job.url); } catch { continue; }
    if (keys.has(key)) continue;
    keys.add(key); ids.add(job.id);
    result.push({ ...job, status: 'queued', submittedAt: null, lastError: null, tabId: null });
  }
  return result;
}

export function createCampaign({ ownerId, appTabId, appOrigin, resumeId, expectedRevision, mode, limit, confirmed }, jobs, now = Date.now()) {
  if (confirmed !== true || !['prepare', 'submit'].includes(mode)) throw new Error('Confirm how this campaign may use your profile and resume.');
  if (!ownerId || !Number.isInteger(appTabId) || !resumeId || !Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('Choose a saved resume version and reconnect ResumeATS.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Choose a daily application limit between 1 and 50.');
  if (!jobs.some(job => job.status === 'queued')) throw new Error('No new jobs are queued. Completed and unresolved applications are preserved.');
  return {
    id: crypto.randomUUID(), ownerId, appTabId, appOrigin,
    resumeId, expectedRevision, mode, limit,
    jobIds: jobs.filter(job => job.status === 'queued').map(job => job.id),
    createdAt: now, expiresAt: now + CAMPAIGN_TTL_MS,
  };
}

export function campaignCanRun(campaign, state, now = Date.now()) {
  return Boolean(campaign && campaign.expiresAt > now && campaign.ownerId === state.profile?.candidate?.userId && state.campaign?.id === campaign.id);
}

export function attemptsToday(queue, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  return queue.filter(job => job.attemptedAt?.slice(0, 10) === day).length;
}

export function summarizeCampaign(campaign) {
  if (!campaign) return null;
  const { id, mode, limit, createdAt, expiresAt, resumeId, expectedRevision, resumeTitle } = campaign;
  return { id, mode, limit, createdAt, expiresAt, resumeId, expectedRevision, resumeTitle };
}
