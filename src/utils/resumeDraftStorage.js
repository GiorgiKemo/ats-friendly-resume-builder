const DRAFT_PREFIX = 'resume_section_draft_v2';

// Section-entry drafts can contain a candidate's contact details and career
// history.  The resume id is not enough to isolate them: new resumes all use
// the same id, and a stale/forged id must never make another account's draft
// visible.  Requiring the authenticated owner also makes the safe behavior
// explicit for utility callers that do not have account context.
const normalizeOwnerId = (ownerId) => typeof ownerId === 'string' && ownerId.trim()
  ? encodeURIComponent(ownerId.trim())
  : '';

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage || null; }
  catch { return null; }
};

const buildDraftKey = (resumeId, sectionKey, scope = 'new', ownerId) => {
  const owner = normalizeOwnerId(ownerId);
  if (!owner) return null;
  const normalizedResumeId = encodeURIComponent(resumeId || 'new');
  const normalizedSection = encodeURIComponent(sectionKey || 'unknown');
  const normalizedScope = encodeURIComponent(scope || 'new');
  return `${DRAFT_PREFIX}:${owner}:${normalizedResumeId}:${normalizedSection}:${normalizedScope}`;
};

export const loadResumeSectionDraft = (resumeId, sectionKey, scope = 'new', ownerId) => {
  const storage = getStorage();
  if (!storage) return null;
  const key = buildDraftKey(resumeId, sectionKey, scope, ownerId);
  if (!key) return null;

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to load section draft:', error);
    return null;
  }
};

export const saveResumeSectionDraft = (resumeId, sectionKey, scope = 'new', value, ownerId) => {
  const storage = getStorage();
  if (!storage) return;
  const key = buildDraftKey(resumeId, sectionKey, scope, ownerId);
  if (!key) return;

  try {
    storage.setItem(
      key,
      JSON.stringify(value)
    );
  } catch (error) {
    console.warn('Failed to save section draft:', error);
  }
};

export const clearResumeSectionDraft = (resumeId, sectionKey, scope = 'new', ownerId) => {
  const storage = getStorage();
  if (!storage) return;
  const key = buildDraftKey(resumeId, sectionKey, scope, ownerId);
  if (!key) return;

  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn('Failed to clear section draft:', error);
  }
};

export const hasResumeSectionDraft = (resumeId, sectionKey, ownerId) => {
  const storage = getStorage();
  if (!storage) return false;
  const owner = normalizeOwnerId(ownerId);
  if (!owner) return false;

  try {
    const normalizedResumeId = encodeURIComponent(resumeId || 'new');
    const normalizedSection = encodeURIComponent(sectionKey || 'unknown');
    const sectionPrefix = `${DRAFT_PREFIX}:${owner}:${normalizedResumeId}:${normalizedSection}:`;

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(sectionPrefix)) {
        const raw = storage.getItem(key);
        if (raw && raw !== 'null' && raw !== '{}') {
          return true;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to inspect section drafts:', error);
  }

  return false;
};
