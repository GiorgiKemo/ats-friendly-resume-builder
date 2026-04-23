const DRAFT_PREFIX = 'resume_section_draft_v1';

const buildDraftKey = (resumeId, sectionKey, scope = 'new') => {
  const normalizedResumeId = resumeId || 'new';
  return `${DRAFT_PREFIX}:${normalizedResumeId}:${sectionKey}:${scope}`;
};

export const loadResumeSectionDraft = (resumeId, sectionKey, scope = 'new') => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(buildDraftKey(resumeId, sectionKey, scope));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to load section draft:', error);
    return null;
  }
};

export const saveResumeSectionDraft = (resumeId, sectionKey, scope = 'new', value) => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(
      buildDraftKey(resumeId, sectionKey, scope),
      JSON.stringify(value)
    );
  } catch (error) {
    console.warn('Failed to save section draft:', error);
  }
};

export const clearResumeSectionDraft = (resumeId, sectionKey, scope = 'new') => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(buildDraftKey(resumeId, sectionKey, scope));
  } catch (error) {
    console.warn('Failed to clear section draft:', error);
  }
};

export const hasResumeSectionDraft = (resumeId, sectionKey) => {
  if (typeof window === 'undefined') return false;

  try {
    const normalizedResumeId = resumeId || 'new';
    const sectionPrefix = `${DRAFT_PREFIX}:${normalizedResumeId}:${sectionKey}:`;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(sectionPrefix)) {
        const raw = localStorage.getItem(key);
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
