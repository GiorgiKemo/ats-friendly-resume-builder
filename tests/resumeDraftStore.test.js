import test from 'node:test';
import assert from 'node:assert/strict';
import { createResumeDraftStore } from '../src/utils/resumeDraftStore.js';

const storage = (initial = []) => {
  const values = new Map(initial);
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    entries: () => [...values.entries()],
  };
};
const resume = (title = 'Local work', revision = 1) => ({ id: 'resume-a', revision, title, personalInfo: { fullName: 'Synthetic Candidate' } });
const setup = () => {
  const shared = storage();
  const sessions = [storage(), storage()];
  return { shared, sessions, make: (writerId, session = 0, ownerId = 'owner-a') => createResumeDraftStore({ ownerId, writerId, storage: shared, sessionStorage: sessions[session] }) };
};

test('two tabs preserve independent durable drafts and clear only their own writer', () => {
  const app = setup();
  const first = app.make('first');
  const second = app.make('second', 1);
  first.save(resume('First tab'));
  second.save(resume('Second tab'));
  first.clear('resume-a');
  assert.equal(second.load('resume-a').resume.title, 'Second tab');
  assert.equal(app.shared.length, 1);
});

test('duplicated tabs fork an inherited session pointer before editing or clearing', () => {
  const app = setup();
  const original = app.make('original');
  original.save(resume('Original draft'));
  app.sessions[1] = storage(app.sessions[0].entries());
  const duplicate = app.make('duplicate', 1);
  const restored = duplicate.load('resume-a');
  assert.match(restored.key, /duplicate$/);
  duplicate.save(resume('Duplicate edit'));
  duplicate.clear('resume-a');
  assert.equal(original.load('resume-a').resume.title, 'Original draft');
  assert.equal(app.shared.length, 1);
});

test('reload restores its own revision-tagged draft without ordering client and server clocks', () => {
  const app = setup();
  app.make('before-reload').save(resume('Clock-independent draft', 7), { editedAt: -5000000 });
  const loaded = app.make('after-reload').load('resume-a');
  assert.equal(loaded.baseRevision, 7);
  assert.equal(loaded.editedAt, -5000000);
  assert.equal(loaded.resume.title, 'Clock-independent draft');
});

test('other-tab and legacy drafts require explicit recovery instead of automatic adoption', () => {
  const app = setup();
  app.make('other', 1).save(resume('Other tab'));
  app.shared.setItem('resume_draft_resume-a', JSON.stringify({ resume: resume('Legacy', 99), updatedAt: 9999999999999 }));
  const current = app.make('current');
  assert.equal(current.load('resume-a'), null);
  const candidates = current.list('resume-a');
  assert.equal(candidates.length, 2);
  assert.equal(candidates.find((record) => record.resume.title === 'Legacy').baseRevision, null);
});

test('drafts are owner-scoped and recovery removal rejects foreign keys', () => {
  const app = setup();
  const first = app.make('first');
  first.save(resume());
  const key = first.load('resume-a').key;
  const secondOwner = app.make('second', 1, 'owner-b');
  assert.deepEqual(secondOwner.list('resume-a'), []);
  assert.equal(secondOwner.removeRecovery(key, 'resume-a'), false);
  assert.ok(app.shared.getItem(key));
});

test('storage failure is reported without losing the current in-memory recovery snapshot', () => {
  const app = createResumeDraftStore({ ownerId: 'owner-a', writerId: 'first', storage: { setItem() { throw new Error('Quota'); } }, sessionStorage: storage() });
  const draft = resume();
  assert.equal(app.save(draft), false);
  draft.personalInfo.fullName = 'Later edit';
  assert.equal(app.load('resume-a').resume.personalInfo.fullName, 'Synthetic Candidate');
});

test('explicitly removing a recovery candidate removes that exact record only', () => {
  const app = setup();
  const first = app.make('first');
  const second = app.make('second', 1);
  first.save(resume('First'));
  second.save(resume('Second'));
  const candidate = second.list('resume-a')[0];
  assert.equal(second.removeRecovery(candidate.key, 'resume-a'), true);
  assert.equal(app.shared.length, 1);
  assert.equal(second.load('resume-a').resume.title, 'Second');
});
