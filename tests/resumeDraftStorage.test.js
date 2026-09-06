import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearResumeSectionDraft,
  hasResumeSectionDraft,
  loadResumeSectionDraft,
  saveResumeSectionDraft,
} from '../src/utils/resumeDraftStorage.js';

const createStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    keys() { return [...values.keys()]; },
  };
};

const withWindow = (storage, callback) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    return callback();
  } finally {
    globalThis.window = previousWindow;
  }
};

test('section drafts are isolated by authenticated owner, including new resumes', () => {
  const storage = createStorage();
  withWindow(storage, () => {
    saveResumeSectionDraft('', 'workExperience', 'new', { company: 'A' }, 'account-a');
    saveResumeSectionDraft('', 'workExperience', 'new', { company: 'B' }, 'account-b');

    assert.deepEqual(loadResumeSectionDraft('', 'workExperience', 'new', 'account-a'), { company: 'A' });
    assert.deepEqual(loadResumeSectionDraft('', 'workExperience', 'new', 'account-b'), { company: 'B' });
    assert.equal(hasResumeSectionDraft('', 'workExperience', 'account-a'), true);
    assert.equal(hasResumeSectionDraft('', 'workExperience', 'account-b'), true);
    assert.equal(storage.keys().filter((key) => key.includes('resume_section_draft_v2')).length, 2);
  });
});

test('missing owner context cannot read, write, or clear candidate section drafts', () => {
  const storage = createStorage();
  withWindow(storage, () => {
    saveResumeSectionDraft('resume-1', 'education', 'new', { degree: 'Secret' }, 'account-a');
    assert.equal(loadResumeSectionDraft('resume-1', 'education'), null);
    assert.equal(hasResumeSectionDraft('resume-1', 'education'), false);
    clearResumeSectionDraft('resume-1', 'education');
    assert.deepEqual(loadResumeSectionDraft('resume-1', 'education', 'new', 'account-a'), { degree: 'Secret' });
  });
});

test('owner, resume, section, and scope components are encoded in the storage key', () => {
  const storage = createStorage();
  withWindow(storage, () => {
    saveResumeSectionDraft('resume/1', 'work experience', 'edit:0', { ok: true }, 'account/a');
    assert.equal(storage.keys().length, 1);
    assert.match(storage.keys()[0], /^resume_section_draft_v2:account%2Fa:resume%2F1:work%20experience:edit%3A0$/);
  });
});
