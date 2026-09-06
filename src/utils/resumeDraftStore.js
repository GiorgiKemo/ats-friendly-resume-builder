const PREFIX = 'resume_draft_v2_';
const validRevision = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const normalizeOwnerId = (value) => typeof value === 'string' && value.trim() ? value.trim() : '';
const createWriterId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* Use the local fallback below. */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

/** @returns {Storage | null} */
const browserStorage = (name) => {
  try { return typeof window === 'undefined' ? null : window[name]; }
  catch { return null; }
};

// A new writer is created for each provider lifetime, even when a duplicated tab
// inherits sessionStorage. Existing recovery records are never another tab's
// writable draft. Their timestamps are for display, not conflict resolution.
/** @param {{ ownerId?: string, storage?: Storage | null, sessionStorage?: Storage | null, writerId?: string }} options */
export const createResumeDraftStore = ({
  ownerId,
  storage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
  writerId = createWriterId(),
} = {}) => {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const scope = (resumeId) => `${PREFIX}${encodeURIComponent(normalizedOwnerId)}_${encodeURIComponent(resumeId || 'new')}_`;
  const ownKey = (resumeId) => `${scope(resumeId)}${writerId}`;
  const pointerKey = (resumeId) => `resume_draft_pointer_${scope(resumeId)}`;
  const memory = new Map();

  const read = (key, resumeId, legacy = false) => {
    if (!normalizedOwnerId || !key) return null;
    try {
      const parsed = JSON.parse(storage?.getItem(key) || 'null');
      if (!parsed?.resume || typeof parsed.resume !== 'object' || Array.isArray(parsed.resume)) return null;
      if ((parsed.resume.id || '') !== (resumeId || '')) return null;
      if (!legacy && (parsed.schemaVersion !== 2 || parsed.ownerId !== normalizedOwnerId || parsed.resumeId !== (resumeId || ''))) return null;
      if (legacy && parsed.ownerId && parsed.ownerId !== normalizedOwnerId) return null;
      return {
        ...parsed,
        key,
        ownerId: normalizedOwnerId,
        resumeId: resumeId || '',
        baseRevision: !legacy && validRevision(parsed.baseRevision) ? parsed.baseRevision : null,
        editedAt: Number.isFinite(parsed.editedAt) ? parsed.editedAt : Number(parsed.updatedAt) || 0,
      };
    } catch { return null; }
  };

  const save = (resume, { editedAt = Date.now(), baseRevision = resume?.revision } = {}) => {
    if (!normalizedOwnerId || !resume || typeof resume !== 'object') return false;
    const resumeId = resume.id || '';
    const key = ownKey(resumeId);
    const record = {
      schemaVersion: 2, ownerId: normalizedOwnerId, resumeId,
      baseRevision: validRevision(baseRevision) ? baseRevision : null,
      resume, editedAt,
    };
    // Serialization also snapshots nested values, so later edits cannot mutate
    // the saved recovery point through a shared object reference.
    try {
      const encoded = JSON.stringify(record);
      memory.set(key, { ...JSON.parse(encoded), key });
      storage?.setItem(key, encoded);
      sessionStorage?.setItem(pointerKey(resumeId), key);
      return Boolean(storage);
    } catch { return false; }
  };

  const load = (resumeId) => {
    const key = ownKey(resumeId);
    const current = memory.get(key) || read(key, resumeId);
    if (current) return current;
    let previousKey;
    try { previousKey = sessionStorage?.getItem(pointerKey(resumeId)); }
    catch { return null; }
    if (!previousKey?.startsWith(scope(resumeId))) return null;
    const previous = read(previousKey, resumeId);
    if (!previous) return null;
    // Fork before any edit or successful-save cleanup. The previous writer may
    // still be active in the tab from which this one was duplicated.
    save(previous.resume, previous);
    return memory.get(key) || previous;
  };

  const list = (resumeId) => {
    if (!normalizedOwnerId) return [];
    const records = [];
    try {
      for (let index = 0; index < (storage?.length || 0); index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(scope(resumeId)) || key === ownKey(resumeId)) continue;
        const record = read(key, resumeId);
        if (record) records.push(record);
      }
      // Preserve pre-versioning drafts for explicit recovery only. Their
      // original server revision is unknown, regardless of the wall clock.
      const legacyKey = resumeId ? `resume_draft_${resumeId}` : `resume_draft_new_${normalizedOwnerId}`;
      const legacy = read(legacyKey, resumeId, true);
      if (legacy) records.push(legacy);
    } catch { /* Storage may be unavailable; editing must still work. */ }
    return records.sort((left, right) => right.editedAt - left.editedAt);
  };

  const clear = (resumeId) => {
    const key = ownKey(resumeId);
    memory.delete(key);
    try {
      storage?.removeItem(key);
      if (sessionStorage?.getItem(pointerKey(resumeId)) === key) sessionStorage.removeItem(pointerKey(resumeId));
    } catch { /* Do not turn successful server saves into failed saves. */ }
  };

  const removeRecovery = (key, resumeId) => {
    const legacyKey = resumeId ? `resume_draft_${resumeId}` : `resume_draft_new_${normalizedOwnerId}`;
    if (!normalizedOwnerId || (key !== legacyKey && !key?.startsWith(scope(resumeId)))) return false;
    if (!read(key, resumeId, key === legacyKey)) return false;
    try { storage?.removeItem(key); return true; }
    catch { return false; }
  };

  return { save, load, list, clear, removeRecovery };
};
