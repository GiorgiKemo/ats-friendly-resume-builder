import test from "node:test";
import assert from "node:assert/strict";
import { setup, record, saved, deferred } from "./helpers/resumeContextHarness.js";

test('loading a saved resume preserves legacy title aliases, active studies and project technologies', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  const resume = app.value.currentResume;
  assert.equal(resume.workExperience[0].jobTitle, 'Engineer');
  assert.equal(resume.workExperience[0].description, 'Built apps.');
  assert.equal(resume.workExperience[0].extra, 'Preserve');
  assert.equal(resume.education[0].current, true);
  assert.equal(resume.projects[0].technologies[0], 'React');
});

test('a failed obsolete load cannot set an error after a newer resume has loaded', async () => {
  const first = deferred();
  const app = setup({ load: (id) => id === 'old-resume' ? first.promise : Promise.resolve(record(id)) });
  const oldLoad = app.value.getResumeById('old-resume');
  await app.value.getResumeById('new-resume');
  first.reject(new Error('Old request failed'));
  await assert.rejects(oldLoad, /Old request failed/);
  assert.equal(app.value.currentResume.id, 'new-resume');
  assert.equal(app.value.error, null);
  assert.equal(app.value.loading, false);
});

test('typing during a slow save survives completion and retains the newer local draft', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ personalInfo: { summary: 'First edit' } }, false);
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  await app.value.updateCurrentResume({ personalInfo: { summary: 'Newer edit' } }, false);
  app.saveCalls[0].resolve(saved());
  await save;
  assert.equal(app.value.currentResume.personalInfo.summary, 'Newer edit');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts()[0].resume.personalInfo.summary, 'Newer edit');
});

test('saves execute in order and only the latest successful snapshot clears dirty state', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'First' }, false);
  const first = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  await app.value.updateCurrentResume({ title: 'Second' }, false);
  const second = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  assert.equal(app.saveCalls.length, 1);
  assert.equal(app.saveCalls[0].expectedUserId, 'user-1');
  app.saveCalls[0].resolve(saved());
  await first;
  await app.flush();
  assert.equal(app.saveCalls.length, 2);
  assert.equal(app.saveCalls[1].resume.title, 'Second');
  assert.equal(app.value.hasUnsavedChanges, true);
  app.saveCalls[1].resolve(saved());
  await second;
  assert.equal(app.value.currentResume.title, 'Second');
  assert.equal(app.value.hasUnsavedChanges, false);
  assert.equal(Boolean(app.drafts().length), false);
});

test('a failed save keeps changes and a draft, and the next save can recover', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  await app.value.updateCurrentResume({ title: 'Keep this edit' }, false);
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  app.saveCalls[0].reject(new Error('Storage unavailable'));
  await assert.rejects(save, /Storage unavailable/);
  assert.equal(app.value.currentResume.title, 'Keep this edit');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(Boolean(app.drafts().length), true);
  const retry = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  app.saveCalls[1].resolve(saved());
  await retry;
  assert.equal(app.value.hasUnsavedChanges, false);
});

test('signing out during a save cannot restore the previous candidate into memory', async () => {
  const app = setup();
  await app.value.getResumeById('resume-1');
  const save = app.value.updateResume('resume-1', app.value.currentResume);
  await app.flush();
  app.setUser(null);
  app.saveCalls[0].resolve(saved());
  await save;
  assert.equal(app.value.currentResume.id, '');
  assert.equal(app.value.currentResume.personalInfo.fullName, '');
  assert.equal(app.value.hasUnsavedChanges, false);
});

test('a direct account switch clears the previous candidate and ignores stale loads', async () => {
  const pending = deferred();
  const app = setup({ load: (id) => id === 'pending' ? pending.promise : Promise.resolve(record(id)) });
  await app.value.getResumeById('resume-1');
  const stale = app.value.getResumeById('pending');
  app.setUser({ id: 'user-2' });
  pending.resolve(record('pending'));
  await stale;
  assert.equal(app.value.currentResume.id, '');
  assert.equal(app.value.currentResume.personalInfo.fullName, '');
});

test('older resume loads cannot replace the resume selected more recently', async () => {
  const pending = deferred();
  const app = setup({ load: (id) => id === 'old' ? pending.promise : Promise.resolve(record(id)) });
  const old = app.value.getResumeById('old');
  await app.value.getResumeById('new');
  pending.resolve(record('old'));
  await old;
  assert.equal(app.value.currentResume.id, 'new');
});

test('edits made during first creation survive and move into the saved resume draft', async () => {
  const app = setup();
  await app.value.updateCurrentResume({ title: 'First version' }, false);
  const create = app.value.createResume(app.value.currentResume);
  await app.flush();
  assert.equal(app.saveCalls[0].expectedUserId, 'user-1');
  await app.value.updateCurrentResume({ title: 'Newer version' }, false);
  app.saveCalls[0].resolve(saved('created-1', 1));
  await create;
  assert.equal(app.value.currentResume.id, 'created-1');
  assert.equal(app.value.currentResume.title, 'Newer version');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts('created-1')[0].resume.title, 'Newer version');
});

test('first-create route reload restores the newer local draft over the saved original snapshot', async () => {
  const app = setup({ load: async (id) => ({ ...record(id), title: 'Original saved title', updated_at: '2020-01-01T00:00:00Z' }) });
  await app.value.updateCurrentResume({ title: 'Original saved title' }, false);
  const create = app.value.createResume(app.value.currentResume);
  await app.flush();
  await app.value.updateCurrentResume({ title: 'Typed while creation was pending' }, false);
  app.saveCalls[0].resolve(saved('created-route', 1));
  await create;
  // This is the same load invoked by /builder/:id after navigation. No router
  // state shortcut or context mocks participate in the draft restoration.
  await app.value.getResumeById('created-route');
  assert.equal(app.value.currentResume.title, 'Typed while creation was pending');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(app.drafts('created-route')[0].resume.title, 'Typed while creation was pending');
});
