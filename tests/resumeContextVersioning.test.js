import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, record, saved, deferred, storageApi } from './helpers/resumeContextHarness.js';
import { createResumeDraftStore } from '../src/utils/resumeDraftStore.js';

const conflict = () => Object.assign(new Error('RESUME_CONFLICT'), { code: 'RESUME_CONFLICT' });

test('an explicit non-autosaving edit cancels the previous pending snapshot instead of overwriting newer text', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Old scheduled edit' }, true);
  assert.equal(app.timers.size, 1);
  await app.value.updateCurrentResume({ title: 'New manual edit' }, false);
  assert.equal(app.timers.size, 0);
  app.runTimers();
  await app.flush();
  assert.equal(app.saveCalls.length, 0);
  assert.equal(app.value.currentResume.title, 'New manual edit');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].resume.title, 'New manual edit');
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  assert.equal(app.saveCalls[0].resume.title, 'New manual edit');
  app.saveCalls[0].resolve(saved());
  await save;
  assert.equal(app.value.currentResume.title, 'New manual edit');
});

test('turning the saved autosave preference off before typing cancels an older timer', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Scheduled while enabled' });
  assert.equal(app.timers.size, 1);
  app.storage.set('autosave_resume-1', 'false');
  await app.value.updateCurrentResume({ title: 'Typed after disabling autosave' });
  assert.equal(app.timers.size, 0);
  app.runTimers();
  await app.flush();
  assert.equal(app.saveCalls.length, 0);
  assert.equal(app.value.currentResume.title, 'Typed after disabling autosave');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].resume.title, 'Typed after disabling autosave');
});

test('turning autosave off without another edit prevents the pending callback from starting a save', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Pending edit' });
  assert.equal(app.timers.size, 1);
  app.storage.set('autosave_resume-1', 'false');
  app.runTimers();
  await app.flush();
  assert.equal(app.timers.size, 0);
  assert.equal(app.saveCalls.length, 0);
  assert.equal(app.value.currentResume.title, 'Pending edit');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].resume.title, 'Pending edit');
  // Re-enabling does not revive the expired callback; only a new edit schedules
  // a new snapshot, which can then complete normally.
  app.storage.set('autosave_resume-1', 'true');
  app.runTimers();
  await app.flush();
  assert.equal(app.saveCalls.length, 0);
  await app.value.updateCurrentResume({ title: 'New enabled edit' });
  assert.equal(app.timers.size, 1);
  app.runTimers();
  await app.flush();
  assert.equal(app.saveCalls[0].resume.title, 'New enabled edit');
  app.saveCalls[0].resolve(saved());
  await app.flush();
  assert.equal(app.value.currentResume.title, 'New enabled edit');
  assert.equal(app.value.hasUnsavedChanges, false);
});

test('each queued snapshot uses the last acknowledgment from its own branch and retains server metadata while typing', async () => {
  const app = setup({ load: async (id) => record(id, 7) });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'First' }, false);
  const first = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  await app.value.updateCurrentResume({ title: 'Second', revision: 999 }, false);
  const second = app.value.updateResume('resume-1', app.value.currentResume);
  assert.equal(app.value.currentResume.revision, 7);
  app.saveCalls[0].resolve(saved('resume-1', 8));
  await first;
  await app.flush();
  assert.equal(app.saveCalls[0].expectedRevision, 7);
  assert.equal(app.saveCalls[1].expectedRevision, 8);
  assert.equal(app.value.currentResume.title, 'Second');
  assert.equal(app.value.currentResume.revision, 8);
  assert.equal(app.value.currentResume.updatedAt, saved().updated_at);
  assert.equal(app.drafts()[0].baseRevision, 8);
  app.saveCalls[1].resolve(saved('resume-1', 9));
  await second;
  assert.equal(app.value.currentResume.revision, 9);
  assert.equal(app.value.hasUnsavedChanges, false);
});

test('a server conflict preserves the latest text and stops queued saves and autosave until explicit resolution', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'First' }, false);
  const first = app.value.updateResume('resume-1', app.value.currentResume);
  const rejectedFirst = assert.rejects(first, { code: 'RESUME_CONFLICT' });
  await app.flush();
  await app.value.updateCurrentResume({ title: 'Newer typing' });
  const second = app.value.updateResume('resume-1', app.value.currentResume);
  const rejectedSecond = assert.rejects(second, { code: 'RESUME_CONFLICT' });
  app.saveCalls[0].reject(conflict());
  await Promise.all([rejectedFirst, rejectedSecond]);
  assert.equal(app.saveCalls.length, 1);
  assert.equal(app.value.saveConflict.kind, 'remote');
  assert.equal(app.value.saveConflict.serverRevision, null);
  assert.equal(app.value.currentResume.title, 'Newer typing');
  assert.equal(app.drafts()[0].baseRevision, 1);
  await app.value.updateCurrentResume({ title: 'Typing after conflict' });
  app.runTimers();
  await app.flush();
  assert.equal(app.saveCalls.length, 1);
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].resume.title, 'Typing after conflict');
});

test('a late old-branch response cannot rebase or replace a newly loaded server snapshot', async () => {
  let revision = 1;
  const app = setup({ load: async (id) => record(id, revision) });
  await app.value.getResumeById('resume-1');
  const first = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  const queued = app.value.updateResume('resume-1', app.value.currentResume);
  const rejected = assert.rejects(queued, /Resume changed/);
  revision = 10;
  await app.value.reloadSavedResume();
  app.saveCalls[0].resolve(saved('resume-1', 2));
  await Promise.all([first, rejected]);
  assert.equal(app.saveCalls.length, 1);
  assert.equal(app.value.currentResume.revision, 10);
  assert.equal(app.value.hasUnsavedChanges, false);
  assert.equal(app.value.error, null);
});

test('separate tabs retain isolated drafts and a successful save clears only its own lane', async () => {
  const storage = new Map();
  const first = setup({ storage });
  const second = setup({ storage });
  await Promise.all([first.value.getResumeById('resume-1'), second.value.getResumeById('resume-1')]);
  await first.value.updateCurrentResume({ title: 'Tab A work' }, false);
  await second.value.updateCurrentResume({ title: 'Tab B work' }, false);
  assert.equal(first.drafts().length, 2);
  const save = first.value.updateResume('resume-1', first.value.currentResume);
  await first.flush();
  first.saveCalls[0].resolve(saved());
  await save;
  assert.equal(first.drafts().length, 1);
  assert.equal(first.drafts()[0].resume.title, 'Tab B work');
  assert.equal(second.value.currentResume.title, 'Tab B work');
});

test('a duplicated tab forks its inherited recovery pointer before edits or cleanup', async () => {
  const storage = new Map();
  const first = setup({ storage });
  await first.value.getResumeById('resume-1');
  await first.value.updateCurrentResume({ title: 'Original tab draft' }, false);
  const originalKey = first.drafts()[0].key;
  const duplicate = setup({ storage, session: new Map(first.session) });
  await duplicate.value.getResumeById('resume-1');
  assert.equal(duplicate.value.currentResume.title, 'Original tab draft');
  await duplicate.value.updateCurrentResume({ title: 'Duplicate edit' }, false);
  const save = duplicate.value.updateResume('resume-1', duplicate.value.currentResume);
  await duplicate.flush();
  duplicate.saveCalls[0].resolve(saved());
  await save;
  assert.equal(JSON.parse(storage.get(originalKey)).resume.title, 'Original tab draft');
});

test('matching-revision recovery ignores wall-clock skew and does not erase a draft older than the server clock', async () => {
  const storage = new Map();
  const session = new Map();
  const store = createResumeDraftStore({ ownerId: 'user-1', storage: storageApi(storage), sessionStorage: storageApi(session), writerId: 'previous' });
  store.save({ id: 'resume-1', title: 'Offline edit', revision: 4 }, { editedAt: 1 });
  const app = setup({ storage, session, load: async (id) => record(id, 4) });
  await app.value.getResumeById('resume-1');
  assert.equal(app.value.currentResume.title, 'Offline edit');
  assert.equal(app.value.currentResume.revision, 4);
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.value.saveConflict, null);
  assert.equal(storage.has('resume_draft_v2_user-1_resume-1_previous'), true);
});

test('mismatched own recovery remains visible but cannot overwrite a newer server version', async () => {
  const storage = new Map();
  const session = new Map();
  const store = createResumeDraftStore({ ownerId: 'user-1', storage: storageApi(storage), sessionStorage: storageApi(session), writerId: 'previous' });
  store.save({ id: 'resume-1', title: 'Old branch edits', revision: 2 });
  const app = setup({ storage, session, load: async (id) => record(id, 5) });
  await app.value.getResumeById('resume-1');
  assert.equal(app.value.currentResume.title, 'Old branch edits');
  assert.equal(app.value.currentResume.revision, 2);
  assert.equal(app.value.saveConflict.kind, 'recovery');
  assert.equal(app.value.saveConflict.serverRevision, 5);
  await assert.rejects(app.value.updateResume('resume-1', app.value.currentResume), { code: 'RESUME_CONFLICT' });
  assert.equal(app.saveCalls.length, 0);
});

test('legacy drafts are explicit recovery candidates and unknown revision remains blocked even with a future timestamp', async () => {
  const storage = new Map([['resume_draft_resume-1', JSON.stringify({ resume: { id: 'resume-1', title: 'Legacy edit' }, updatedAt: 99999999999999 })]]);
  const app = setup({ storage });
  await app.value.getResumeById('resume-1');
  assert.equal(app.value.currentResume.title, 'Engineer');
  assert.equal(app.value.hasUnsavedChanges, false);
  assert.equal(app.value.recoveryDrafts.length, 1);
  assert.equal(app.value.recoverDraft(app.value.recoveryDrafts[0].key), true);
  assert.equal(app.value.currentResume.title, 'Legacy edit');
  assert.equal(app.value.currentResume.revision, null);
  assert.equal(app.value.saveConflict.kind, 'recovery');
  await assert.rejects(app.value.updateResume('resume-1', app.value.currentResume), { code: 'RESUME_CONFLICT' });
  assert.equal(app.saveCalls.length, 0);
  app.value.discardRecoveryDraft('resume_draft_resume-1');
  assert.equal(storage.has('resume_draft_resume-1'), false);
  assert.equal(app.value.currentResume.title, 'Legacy edit');
});

test('explicit reload uses the server version, clears only the current lane, and allows a new branch save', async () => {
  let revision = 1;
  const app = setup({ load: async (id) => record(id, revision) });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Local' }, false);
  const store = createResumeDraftStore({ ownerId: 'user-1', storage: storageApi(app.storage), writerId: 'another-tab' });
  store.save({ id: 'resume-1', title: 'Other tab', revision: 1 });
  revision = 3;
  await app.value.reloadSavedResume();
  assert.equal(app.value.currentResume.title, 'Engineer');
  assert.equal(app.value.currentResume.revision, 3);
  assert.equal(app.value.saveConflict, null);
  assert.equal(app.drafts().length, 1);
  assert.equal(app.drafts()[0].resume.title, 'Other tab');
  const save = app.value.updateResume('resume-1', { title: 'New branch' });
  await app.flush();
  assert.equal(app.saveCalls[0].expectedRevision, 3);
  app.saveCalls[0].resolve(saved('resume-1', 4));
  await save;
});

test('typing during explicit reload aborts replacement and cleanup without rebasing the unsaved snapshot', async () => {
  const pending = deferred();
  let reload = false;
  const app = setup({ load: (id) => reload ? pending.promise : Promise.resolve(record(id, 3)) });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Unsaved before reload' }, false);
  reload = true;
  const request = app.value.reloadSavedResume();
  await app.value.updateCurrentResume({ title: 'Typed during reload' }, false);
  pending.resolve(record('resume-1', 7));
  await assert.rejects(request, { code: 'RESUME_RELOAD_EDITED' });
  assert.equal(app.value.currentResume.title, 'Typed during reload');
  assert.equal(app.value.currentResume.revision, 3);
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].baseRevision, 3);
  assert.equal(app.drafts()[0].resume.title, 'Typed during reload');
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  const failed = assert.rejects(save, { code: 'RESUME_CONFLICT' });
  await app.flush();
  assert.equal(app.saveCalls[0].expectedRevision, 3);
  app.saveCalls[0].reject(conflict());
  await failed;
});

test('a failed same-resume reload restores the prior editing branch and preserves its draft', async () => {
  let fail = false;
  const app = setup({ load: async (id) => {
    if (fail) throw new Error('Network unavailable');
    return record(id, 4);
  } });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Keep my edit' }, false);
  fail = true;
  await assert.rejects(app.value.reloadSavedResume(), /Network unavailable/);
  assert.equal(app.value.currentResume.title, 'Keep my edit');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].baseRevision, 4);
  assert.equal(app.value.saveConflict, null);
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  assert.equal(app.saveCalls[0].expectedRevision, 4);
  app.saveCalls[0].resolve(saved('resume-1', 5));
  await save;
  assert.equal(app.value.currentResume.revision, 5);
  assert.equal(app.value.hasUnsavedChanges, false);
});

test('a failed reload does not unlock a branch that was already conflicted', async () => {
  let fail = false;
  const app = setup({ load: async (id) => {
    if (fail) throw new Error('Network unavailable');
    return record(id, 4);
  } });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Keep this conflicted version' }, false);
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  const rejected = assert.rejects(save, { code: 'RESUME_CONFLICT' });
  await app.flush();
  app.saveCalls[0].reject(conflict());
  await rejected;
  fail = true;
  await assert.rejects(app.value.reloadSavedResume(), /Network unavailable/);
  await assert.rejects(app.value.updateResume('resume-1', app.value.currentResume), { code: 'RESUME_CONFLICT' });
  assert.equal(app.saveCalls.length, 1);
  assert.equal(app.value.saveConflict.kind, 'remote');
  assert.equal(app.value.currentResume.title, 'Keep this conflicted version');
  assert.equal(app.drafts()[0].baseRevision, 4);
});

test('save as copy clears the conflict with new metadata, preserves later typing and retains original recovery', async () => {
  const storage = new Map([['resume_draft_resume-1', JSON.stringify({ resume: { id: 'resume-1', title: 'Recovered' }, updatedAt: 1 })]]);
  const app = setup({ storage });
  await app.value.getResumeById('resume-1');
  app.value.recoverDraft(app.value.recoveryDrafts[0].key);
  const copy = app.value.createResume({ ...app.value.currentResume, id: '', revision: undefined, title: 'Recovered copy' });
  await app.flush();
  await app.value.updateCurrentResume({ title: 'Typing during copy' }, false);
  app.saveCalls[0].resolve(saved('copy-1', 1));
  await copy;
  assert.equal(app.saveCalls[0].id, null);
  assert.equal(app.saveCalls[0].expectedRevision, undefined);
  assert.equal(app.value.currentResume.id, 'copy-1');
  assert.equal(app.value.currentResume.title, 'Typing during copy');
  assert.equal(app.value.currentResume.revision, 1);
  assert.equal(app.value.saveConflict, null);
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].resume.title, 'Typing during copy');
  assert.equal(app.drafts('copy-1')[0].baseRevision, 1);
});

test('new-resume recovery stays owner-scoped and new tabs only offer other writers for explicit selection', async () => {
  const first = setup();
  await first.value.updateCurrentResume({ title: 'Unsaved new resume' }, false);
  const reloaded = setup({ storage: first.storage, session: first.session });
  assert.equal(reloaded.value.restoreNewResumeDraft(), true);
  assert.equal(reloaded.value.currentResume.title, 'Unsaved new resume');
  const anotherTab = setup({ storage: first.storage });
  assert.equal(anotherTab.value.restoreNewResumeDraft(), false);
  assert.equal(anotherTab.value.recoveryDrafts.length, 2);
  anotherTab.setUser({ id: 'user-2' });
  assert.equal(anotherTab.value.restoreNewResumeDraft(), false);
  assert.equal(anotherTab.value.recoveryDrafts.length, 0);
});

test('storage failure is visible while the in-memory draft still survives a same-provider load', async () => {
  const app = setup({ storageUnavailable: true });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Memory only' }, false);
  assert.equal(app.value.draftBackupAvailable, false);
  await app.value.getResumeById('resume-1');
  assert.equal(app.value.currentResume.title, 'Memory only');
  assert.equal(app.value.hasUnsavedChanges, true);
});

test('unmount invalidates queued saves and late loads without writing or deleting recovery data', async () => {
  const pending = deferred();
  const app = setup({ load: (id) => id === 'slow' ? pending.promise : Promise.resolve(record(id)) });
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Keep recovery' }, false);
  const first = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  const queued = app.value.updateResume('resume-1', app.value.currentResume);
  const rejected = assert.rejects(queued, /Account changed/);
  const load = app.value.getResumeById('slow');
  app.unmount();
  pending.resolve(record('slow'));
  app.saveCalls[0].resolve(saved());
  await Promise.all([first, rejected, load]);
  assert.equal(app.saveCalls.length, 1);
  assert.equal(app.drafts()[0].resume.title, 'Keep recovery');
});
