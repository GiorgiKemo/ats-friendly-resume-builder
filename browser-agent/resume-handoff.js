// This store is intentionally session-only. Never fall back to persistent storage.
export const HANDOFF_STORAGE_KEY = 'resumeatsResumeHandoff';
export const HANDOFF_TTL_MS = 30 * 60 * 1000;
const MAX_PDF_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 1536 * 1024;

export const selectionError = (message = 'Choose a saved resume in ResumeATS for this exact job before autofilling.') => (
  Object.assign(new Error(message), { code: 'resume_selection_required' })
);

export function canonicalJobUrl(value) {
  // eslint-disable-next-line no-control-regex -- Reject URL controls rather than silently normalizing them.
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020]/.test(value)) throw selectionError('The job URL is not supported.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw selectionError('The job URL is not supported.');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}${url.hash}`;
}

// eslint-disable-next-line no-control-regex -- Untrusted metadata must not contain control characters.
const boundedText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const validRevision = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
export const handoffMetadata = (record) => ({
  handoffId: record.handoffId, ownerId: record.ownerId, jobKey: record.jobKey,
  jobSnapshot: record.jobSnapshot, createdAt: record.createdAt, expiresAt: record.expiresAt,
  ...(record.selection ? { status: 'ready', resume: record.selection.resume } : { status: 'review_required' }),
});

export async function validateSavedResumeArtifact(response, record, resumeId, expectedRevision) {
  if (!response || new TextEncoder().encode(JSON.stringify(response)).byteLength > MAX_RESPONSE_BYTES) throw selectionError('The prepared resume response is too large.');
  if (response.status !== 'ready' || response.handoffId !== record.handoffId || response.jobKey !== record.jobKey
    || response.ownerId !== record.ownerId || response.resume?.id !== resumeId
    || response.resume?.revision !== expectedRevision || !validRevision(expectedRevision)
    || !boundedText(response.resume?.title, 300)) throw selectionError('The saved resume identity or version changed. Choose it again.');
  const document = response.document;
  if (!document || document.mimeType !== 'application/pdf'
    || !boundedText(document.filename, 128) || !/\.pdf$/i.test(document.filename)
    || /[/\\:*?"<>|]/.test(document.filename)
    || !boundedText(document.rendererVersion, 64)
    || !Number.isInteger(document.byteLength) || document.byteLength < 5 || document.byteLength > MAX_PDF_BYTES
    || typeof document.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(document.sha256)
    || document.artifactId !== `sha256:${document.sha256}`
    || typeof document.base64 !== 'string' || document.base64.length > 1398104
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(document.base64)) {
    throw selectionError('ResumeATS returned an invalid PDF. Choose the saved resume again.');
  }
  const binary = atob(document.base64);
  if (binary.length !== document.byteLength || btoa(binary) !== document.base64 || !binary.startsWith('%PDF-')) throw selectionError('The selected PDF is damaged. Choose it again.');
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== document.sha256) throw selectionError('The selected PDF did not pass its integrity check.');
  // No arbitrary app-provided fields survive into storage or an employer message.
  return {
    resume: { id: resumeId, revision: expectedRevision, title: response.resume.title },
    document: {
      artifactId: document.artifactId, mimeType: document.mimeType, filename: document.filename,
      byteLength: document.byteLength, sha256, base64: document.base64, rendererVersion: document.rendererVersion,
    },
  };
}

export function createResumeHandoffStore({ storage, now = Date.now, randomUUID = () => crypto.randomUUID() }) {
  let writes = Promise.resolve();
  let epoch = 0;
  const requireStorage = () => {
    if (!storage?.get || !storage?.set || !storage?.remove) throw selectionError('This browser cannot keep a resume safely for this session. Update your browser or attach the PDF manually.');
  };
  const serialize = (operation) => {
    const pending = writes.then(operation);
    writes = pending.catch(() => {});
    return pending;
  };
  const read = async () => {
    requireStorage();
    const value = (await storage.get(HANDOFF_STORAGE_KEY))?.[HANDOFF_STORAGE_KEY];
    if (!value) return null;
    let validUrl = false;
    try { validUrl = canonicalJobUrl(value.targetUrl) === value.jobKey && new URL(value.appOrigin).origin === value.appOrigin; } catch { /* invalid stored record */ }
    if (value.version !== 1 || !boundedText(value.handoffId, 128) || !boundedText(value.sessionNonce, 128)
      || !boundedText(value.ownerId, 128) || !Number.isInteger(value.tabId) || !Number.isInteger(value.appTabId)
      || !Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt)
      || value.createdAt > now() || value.expiresAt <= now() || value.expiresAt - value.createdAt !== HANDOFF_TTL_MS
      || !value.jobSnapshot || !validUrl) return null;
    return value;
  };
  const assertCurrent = async (record) => {
    const current = await read();
    if (!current || current.handoffId !== record.handoffId || current.sessionNonce !== record.sessionNonce) throw selectionError('This resume selection expired or was replaced. Choose it again.');
    return current;
  };
  const save = async (record) => {
    try { await storage.set({ [HANDOFF_STORAGE_KEY]: record }); }
    catch { throw selectionError('This browser could not keep the PDF in session memory. Choose a smaller PDF or attach it manually.'); }
  };
  return {
    read, assertCurrent,
    expire() {
      return serialize(async () => {
        if (!storage?.get || !storage?.remove) return;
        const current = (await storage.get(HANDOFF_STORAGE_KEY))?.[HANDOFF_STORAGE_KEY];
        if (current && (!Number.isFinite(current.expiresAt) || current.expiresAt <= now())) await storage.remove(HANDOFF_STORAGE_KEY);
      });
    },
    async begin({ ownerId, tabId, appTabId, appOrigin, targetUrl, jobSnapshot, campaignId }, assertSession = () => {}) {
      const capturedEpoch = epoch;
      if (!boundedText(ownerId, 128) || !Number.isInteger(tabId) || !Number.isInteger(appTabId)) throw selectionError();
      const createdAt = now();
      const record = {
        version: 1, handoffId: randomUUID(), sessionNonce: randomUUID(), ownerId, tabId, appTabId, appOrigin,
        targetUrl, jobKey: canonicalJobUrl(targetUrl), createdAt, expiresAt: createdAt + HANDOFF_TTL_MS,
        ...(campaignId ? { campaignId } : {}),
        jobSnapshot: {
          url: targetUrl,
          title: String(jobSnapshot?.title || 'Active job').slice(0, 300),
          company: String(jobSnapshot?.company || '').slice(0, 300),
          description: String(jobSnapshot?.description || '').slice(0, 30000),
          location: String(jobSnapshot?.location || '').slice(0, 300),
          provider: String(jobSnapshot?.provider || 'generic').slice(0, 64),
        },
      };
      await serialize(async () => {
        requireStorage(); assertSession();
        if (capturedEpoch !== epoch) throw selectionError('Your session changed. Choose the resume again.');
        await save(record);
        assertSession();
      });
      return record;
    },
    async commit(record, selection, assertSession = () => {}) {
      const capturedEpoch = epoch;
      return serialize(async () => {
        const current = await assertCurrent(record);
        assertSession();
        if (capturedEpoch !== epoch) throw selectionError();
        if (current.selection) {
          if (current.selection.resume.id !== selection.resume.id || current.selection.resume.revision !== selection.resume.revision) throw selectionError('This handoff already has a different saved version. Start a new selection.');
          return current;
        }
        const next = { ...current, selection };
        await save(next); assertSession();
        return next;
      });
    },
    async cancel(record) {
      return serialize(async () => {
        const current = await read();
        if (current?.handoffId === record.handoffId && current.sessionNonce === record.sessionNonce) await storage.remove(HANDOFF_STORAGE_KEY);
      });
    },
    invalidate() {
      epoch += 1;
      return serialize(async () => { if (storage?.remove) await storage.remove(HANDOFF_STORAGE_KEY); });
    },
  };
}
