import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_USER_ID, QA_RESUME_ID } from './fixtures/qa-server.mjs';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { setup, deferred } from './helpers/resumeContextHarness.js';

// Actual context/store/service/SDK across loopback HTTP. Hook scheduling is a
// deterministic test harness, not a React renderer or PostgreSQL locking proof.
async function fixture(t) {
  const { server, state } = createQaServer();
  const apps = [];
  const storage = new Map();
  const requests = new Set();
  const settle = async () => {
    do {
      await Promise.allSettled([...requests]);
      await new Promise((resolve) => setImmediate(resolve));
    } while (requests.size);
  };
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    apps.forEach((app) => app.unmount());
    // Let already-started Auth/list chains settle before closing their server.
    await settle();
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = async ({ session = new Map(), afterFetch } = {}) => {
    const client = createClient(url, 'qa-local-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const requestUrl = new URL(typeof input === 'string' ? input : input.url);
        assert.equal(requestUrl.origin, url, 'No external requests are permitted');
        const request = fetch(input, init);
        requests.add(request);
        const response = await request.finally(() => requests.delete(request));
        await afterFetch?.(requestUrl.pathname, response);
        return response;
      } },
    });
    const signedIn = await client.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
    assert.equal(signedIn.error, null);
    const { exports: service } = loadEdgeFunction('src/services/supabaseService.js', {
      imports: { './supabase': { supabase: client } },
    });
    const app = setup({ service, storage, session });
    app.setUser({ id: QA_USER_ID });
    apps.push(app);
    await app.value.fetchUserResumes();
    return app;
  };
  const drafts = () => [...storage.entries()]
    .filter(([key]) => key.startsWith(`resume_draft_v2_${QA_USER_ID}_${QA_RESUME_ID}_`))
    .map(([key, encoded]) => ({ key, ...JSON.parse(encoded) }));
  const saveRequests = () => state.requestLog.filter((request) => request.path === '/rest/v1/rpc/save_resume_versioned');
  return { state, storage, connect, drafts, saveRequests, settle };
}

test('two context tabs preserve separate drafts and a stale HTTP save pauses further writes', async (t) => {
  const env = await fixture(t);
  const first = await env.connect();
  const second = await env.connect();
  await Promise.all([first.value.getResumeById(QA_RESUME_ID), second.value.getResumeById(QA_RESUME_ID)]);
  first.value.updateCurrentResume({ title: 'First tab saved' }, false);
  second.value.updateCurrentResume({ title: 'Second tab unsaved' }, false);
  assert.equal(env.drafts().length, 2);
  await first.value.updateResume(QA_RESUME_ID, first.value.currentResume);
  assert.equal(first.value.currentResume.revision, 2);
  assert.equal(first.value.hasUnsavedChanges, false);
  assert.equal(env.drafts().length, 1, 'A successful save must only clear its own writer record');
  assert.equal(env.drafts()[0].resume.title, 'Second tab unsaved');

  await assert.rejects(second.value.updateResume(QA_RESUME_ID, second.value.currentResume),
    (error) => error.code === 'RESUME_CONFLICT');
  assert.equal(second.value.saveConflict.kind, 'remote');
  assert.equal(second.value.currentResume.title, 'Second tab unsaved');
  assert.equal(second.value.currentResume.revision, 1);
  assert.equal(second.value.hasUnsavedChanges, true);
  const count = env.saveRequests().length;
  await assert.rejects(second.value.updateResume(QA_RESUME_ID, second.value.currentResume),
    (error) => error.code === 'RESUME_CONFLICT');
  second.runTimers();
  await second.flush();
  assert.equal(env.saveRequests().length, count, 'A paused branch must not silently retry');
  assert.equal(env.state.resumes[0].title, 'First tab saved');
  assert.equal(env.state.resumes[0].revision, 2);
  assert.equal(env.drafts()[0].resume.title, 'Second tab unsaved');
});

test('reloading the same tab restores a matching revision regardless of local/server clock order', async (t) => {
  const env = await fixture(t);
  env.state.resumes[0].updated_at = '2999-01-01T00:00:00Z';
  const first = await env.connect();
  await first.value.getResumeById(QA_RESUME_ID);
  first.value.updateCurrentResume({ title: 'Clock-independent local draft' }, false);
  const original = env.drafts()[0];
  env.storage.set(original.key, JSON.stringify({ ...original, editedAt: -5000000 }));
  first.unmount();
  const reloaded = await env.connect({ session: first.session });
  await reloaded.value.getResumeById(QA_RESUME_ID);
  assert.equal(reloaded.value.currentResume.title, 'Clock-independent local draft');
  assert.equal(reloaded.value.currentResume.revision, 1);
  assert.equal(reloaded.value.hasUnsavedChanges, true);
  assert.equal(reloaded.value.saveConflict, null);
  assert.ok(env.storage.has(original.key), 'Reload forks instead of removing the original writer record');
  assert.equal(env.drafts().length, 2);
  assert.equal(env.saveRequests().length, 0);
});

test('a changed server revision keeps the recovered draft paused and saving a copy leaves the original intact', async (t) => {
  const env = await fixture(t);
  const local = await env.connect();
  const remote = await env.connect();
  await Promise.all([local.value.getResumeById(QA_RESUME_ID), remote.value.getResumeById(QA_RESUME_ID)]);
  local.value.updateCurrentResume({ title: 'Recovered local work', personalInfo: { summary: 'Keep this independent draft' } }, false);
  local.unmount();
  remote.value.updateCurrentResume({ title: 'Newer remote version' }, false);
  await remote.value.updateResume(QA_RESUME_ID, remote.value.currentResume);
  const committed = JSON.stringify(env.state.resumes[0]);
  const reloaded = await env.connect({ session: local.session });
  await reloaded.value.getResumeById(QA_RESUME_ID);
  assert.equal(reloaded.value.currentResume.title, 'Recovered local work');
  assert.equal(reloaded.value.currentResume.revision, 1);
  assert.equal(reloaded.value.saveConflict.kind, 'recovery');
  assert.equal(reloaded.value.saveConflict.serverRevision, 2);
  await assert.rejects(reloaded.value.updateResume(QA_RESUME_ID, reloaded.value.currentResume),
    (error) => error.code === 'RESUME_CONFLICT');
  assert.equal(JSON.stringify(env.state.resumes[0]), committed);
  const copy = await reloaded.value.createResume(reloaded.value.currentResume);
  assert.notEqual(copy.id, QA_RESUME_ID);
  assert.equal(copy.revision, 1);
  assert.equal(copy.personalInfo.summary, 'Keep this independent draft');
  assert.equal(reloaded.value.saveConflict, null);
  assert.equal(reloaded.value.hasUnsavedChanges, false);
  assert.equal(JSON.stringify(env.state.resumes[0]), committed);
  assert.equal(env.state.resumes.length, 2);
  assert.ok(env.drafts().some((draft) => draft.resume.title === 'Recovered local work'),
    'Saving a copy must retain the original resume recovery record');
});

test('queued same-tab HTTP saves advance only from their own accepted acknowledgement', async (t) => {
  const env = await fixture(t);
  const firstCommitted = deferred();
  const release = deferred();
  let held = false;
  const app = await env.connect({ afterFetch: async (path) => {
    if (path.endsWith('/save_resume_versioned') && !held) {
      held = true;
      firstCommitted.resolve();
      await release.promise;
    }
  } });
  await app.value.getResumeById(QA_RESUME_ID);
  app.value.updateCurrentResume({ title: 'First snapshot' }, false);
  const first = app.value.updateResume(QA_RESUME_ID, app.value.currentResume);
  await firstCommitted.promise;
  app.value.updateCurrentResume({ title: 'Newer typing while save is in flight' }, false);
  const second = app.value.updateResume(QA_RESUME_ID, app.value.currentResume);
  release.resolve();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].revision, 2);
  assert.equal(results[1].revision, 3);
  assert.equal(app.value.currentResume.title, 'Newer typing while save is in flight');
  assert.equal(app.value.currentResume.revision, 3);
  assert.equal(app.value.hasUnsavedChanges, false);
  assert.equal(app.value.saveConflict, null);
  assert.equal(env.state.resumes[0].title, 'Newer typing while save is in flight');
  assert.equal(env.state.resumes[0].revision, 3);
  assert.equal(env.saveRequests().length, 2);
  assert.equal(env.drafts().length, 0);
});

for (const mode of ['explicitly disabled edit', 'disabled autosave preference']) {
  test(`an earlier autosave timer cannot overwrite a later ${mode} through HTTP`, async (t) => {
    const env = await fixture(t);
    const app = await env.connect();
    await app.value.getResumeById(QA_RESUME_ID);
    const committed = JSON.stringify(env.state.resumes[0]);
    app.value.updateCurrentResume({ title: 'Earlier scheduled snapshot' }, true);
    assert.ok(app.timers.size > 0, 'The earlier edit must have scheduled an autosave');
    if (mode === 'disabled autosave preference') env.storage.set(`autosave_${QA_RESUME_ID}`, 'false');
    app.value.updateCurrentResume({ title: 'Newer unsaved work' }, mode === 'explicitly disabled edit' ? false : undefined);
    app.runTimers();
    await app.flush();
    await env.settle();
    assert.equal(env.saveRequests().length, 0, 'The obsolete timer must not reach the save RPC');
    assert.equal(app.value.currentResume.title, 'Newer unsaved work');
    assert.equal(app.value.hasUnsavedChanges, true);
    assert.equal(env.drafts()[0].resume.title, 'Newer unsaved work');
    assert.equal(JSON.stringify(env.state.resumes[0]), committed);
    await app.value.updateResume(QA_RESUME_ID, app.value.currentResume);
    assert.equal(env.state.resumes[0].title, 'Newer unsaved work');
    assert.equal(env.state.resumes[0].revision, 2);
    assert.equal(app.value.hasUnsavedChanges, false);
  });
}

test('disabling autosave without another edit prevents the pending HTTP save', async (t) => {
  const env = await fixture(t);
  const app = await env.connect();
  await app.value.getResumeById(QA_RESUME_ID);
  const committed = JSON.stringify(env.state.resumes[0]);
  app.value.updateCurrentResume({ title: 'Keep local after toggle' }, true);
  assert.ok(app.timers.size > 0);
  env.storage.set(`autosave_${QA_RESUME_ID}`, 'false');
  app.runTimers();
  await app.flush();
  await env.settle();
  assert.equal(env.saveRequests().length, 0);
  assert.equal(app.value.currentResume.title, 'Keep local after toggle');
  assert.equal(app.value.hasUnsavedChanges, true);
  assert.equal(env.drafts()[0].resume.title, 'Keep local after toggle');
  assert.equal(JSON.stringify(env.state.resumes[0]), committed);
  await app.value.updateResume(QA_RESUME_ID, app.value.currentResume);
  assert.equal(env.state.resumes[0].title, 'Keep local after toggle');
  assert.equal(env.state.resumes[0].revision, 2);
});
