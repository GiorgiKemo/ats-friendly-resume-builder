import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_USER_ID, QA_RESUME_ID } from './fixtures/qa-server.mjs';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

// Real app service + installed Supabase SDK + loopback HTTP fixture. This tests
// transport and client behavior, not PostgreSQL locking, grants, or RLS.
async function fixture(t, options) {
  const { server, state } = createQaServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = async () => {
    const client = createClient(url, 'qa-local-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, url,
          'Integration tests must never send requests to an external backend');
        return fetch(input, init);
      } },
    });
    const signedIn = await client.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
    assert.equal(signedIn.error, null);
    const { exports: service } = loadEdgeFunction('src/services/supabaseService.js', {
      imports: { './supabase': { supabase: client } },
    });
    return { client, service };
  };
  return { state, connect };
}

const draft = (title) => ({
  title, personalInfo: { fullName: 'Synthetic Candidate', summary: `${title} summary` },
  workExperience: [{ id: 'synthetic-role', jobTitle: 'Designer', employer: 'Example Company' }],
  education: [], skills: ['Accessibility'], certifications: [], projects: [], additionalSections: [],
});
const rawSnapshot = {
  p_user_id: QA_USER_ID, p_title: 'Synthetic snapshot', p_description: '', p_selected_template: 'ats-friendly',
  p_selected_font: 'Arial', p_is_public: false, p_personal_info: {}, p_work_experience: [], p_education: [],
  p_skills: [], p_certifications: [], p_projects: [], p_additional_sections: [],
};

test('actual resume service creates and loads the same server-confirmed revision over HTTP', async (t) => {
  const { connect, state } = await fixture(t, { empty: true });
  const { service } = await connect();
  const input = draft('New resume');
  const before = JSON.stringify(input);
  const saved = await service.saveResume(input, null, QA_USER_ID);
  assert.match(saved.resume_id, /^[a-f0-9-]{36}$/);
  assert.equal(saved.revision, 1);
  assert.equal(Number.isNaN(Date.parse(saved.updated_at)), false);
  const loaded = await service.getResumeById(saved.resume_id);
  assert.equal(loaded.id, saved.resume_id);
  assert.equal(loaded.user_id, QA_USER_ID);
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.updated_at, saved.updated_at);
  assert.equal(loaded.personal_info.fullName, input.personalInfo.fullName);
  assert.equal(loaded.work_experience[0].jobTitle, 'Designer');
  const listed = await service.getUserResumes();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].revision, 1);
  assert.equal(listed[0].updated_at, saved.updated_at);
  assert.equal(state.resumes.length, 1);
  assert.equal(JSON.stringify(input), before);
  assert.ok(state.requestLog.some((request) => request.path === '/rest/v1/rpc/save_resume_versioned'));
  assert.ok(state.requestLog.some((request) => request.path === '/rest/v1/rpc/get_resume_versioned'));
  assert.ok(!state.requestLog.some((request) => /\/(save_resume|get_resume_with_content)$/.test(request.path)));
});

test('two actual service clients send the same revision and exactly one HTTP save is accepted', async (t) => {
  const { connect, state } = await fixture(t);
  const first = await connect();
  const second = await connect();
  const [firstLoaded, secondLoaded] = await Promise.all([
    first.service.getResumeById(QA_RESUME_ID), second.service.getResumeById(QA_RESUME_ID),
  ]);
  assert.equal(firstLoaded.revision, 1);
  assert.equal(secondLoaded.revision, 1);
  const inputs = [draft('Device A changes'), draft('Device B changes')];
  const before = JSON.stringify(inputs);
  const results = await Promise.allSettled([
    first.service.saveResume(inputs[0], QA_RESUME_ID, QA_USER_ID, firstLoaded.revision),
    second.service.saveResume(inputs[1], QA_RESUME_ID, QA_USER_ID, secondLoaded.revision),
  ]);
  const winner = results.findIndex((result) => result.status === 'fulfilled');
  const loser = 1 - winner;
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results[winner].value.revision, 2);
  assert.equal(results[loser].reason.code, 'RESUME_CONFLICT');
  assert.equal(results[loser].reason.cause.code, 'PT409');
  assert.equal(results[loser].reason.cause.message, 'RESUME_CONFLICT');
  assert.equal(state.resumes.length, 1, 'A conflict must not create a replacement resume');
  assert.equal(state.resumes[0].revision, 2);
  assert.equal(state.resumes[0].title, inputs[winner].title);
  assert.equal(state.resumes[0].personal_info.summary, inputs[winner].personalInfo.summary);
  assert.equal(JSON.stringify(inputs), before, 'Both caller drafts remain intact');
  assert.equal(state.requestLog.filter((request) => request.path === '/rest/v1/rpc/save_resume_versioned').length, 2,
    'There must be no silent retry or read-latest/write fallback');
});

test('a stale HTTP save preserves the server snapshot until an explicit latest-version retry', async (t) => {
  const { connect, state } = await fixture(t);
  const first = await connect();
  const second = await connect();
  await first.service.saveResume(draft('First saved revision'), QA_RESUME_ID, QA_USER_ID, 1);
  const committed = JSON.stringify(state.resumes[0]);
  const losingDraft = draft('Local work to recover');
  const before = JSON.stringify(losingDraft);
  const requestStart = state.requestLog.length;
  await assert.rejects(second.service.saveResume(losingDraft, QA_RESUME_ID, QA_USER_ID, 1),
    (error) => error instanceof second.service.ResumeConflictError && error.code === 'RESUME_CONFLICT');
  assert.equal(JSON.stringify(state.resumes[0]), committed);
  assert.equal(JSON.stringify(losingDraft), before);
  assert.deepEqual(state.requestLog.slice(requestStart).map((request) => request.path),
    ['/auth/v1/user', '/rest/v1/rpc/save_resume_versioned']);

  const latest = await second.service.getResumeById(QA_RESUME_ID);
  assert.equal(latest.title, 'First saved revision');
  assert.equal(latest.revision, 2);
  const retried = await second.service.saveResume(losingDraft, QA_RESUME_ID, QA_USER_ID, latest.revision);
  assert.equal(retried.revision, 3);
  assert.equal(state.resumes[0].title, losingDraft.title);
  assert.equal(state.resumes[0].revision, 3);
});

test('actual service rejects unversioned updates before any HTTP request', async (t) => {
  const { connect, state } = await fixture(t);
  const { service } = await connect();
  const requestCount = state.requestLog.length;
  const committed = JSON.stringify(state.resumes[0]);
  for (const revision of [undefined, null, 0, -1, '1', 1.5, NaN, Infinity]) {
    await assert.rejects(service.saveResume(draft('Do not save'), QA_RESUME_ID, QA_USER_ID, revision),
      (error) => error.code === 'RESUME_VERSION_REQUIRED');
  }
  assert.equal(state.requestLog.length, requestCount);
  assert.equal(JSON.stringify(state.resumes[0]), committed);
});

test('SDK retains HTTP 409 and SQL error fields and failed writes do not mutate fixture data', async (t) => {
  const { connect, state } = await fixture(t);
  const { client } = await connect();
  const committed = JSON.stringify(state.resumes[0]);
  for (const [revision, status, code, message] of [
    [undefined, 400, '22023', 'RESUME_VERSION_REQUIRED'],
    [null, 400, '22023', 'RESUME_VERSION_REQUIRED'],
    [0, 400, '22023', 'RESUME_VERSION_REQUIRED'],
    [2, 409, 'PT409', 'RESUME_CONFLICT'],
  ]) {
    const result = await client.rpc('save_resume_versioned', {
      ...rawSnapshot, p_resume_id: QA_RESUME_ID, p_title: 'Rejected write', p_expected_revision: revision,
    });
    assert.equal(result.status, status);
    assert.equal(result.data, null);
    assert.equal(result.error.code, code);
    assert.equal(result.error.message, message);
    assert.equal(JSON.stringify(state.resumes[0]), committed);
  }
});

test('legacy HTTP create keeps its UUID response but legacy update cannot bypass revisions', async (t) => {
  const { connect, state } = await fixture(t, { empty: true });
  const { client } = await connect();
  const created = await client.rpc('save_resume', { ...rawSnapshot, p_title: 'Legacy-created resume' });
  assert.equal(created.error, null);
  assert.match(created.data, /^[a-f0-9-]{36}$/);
  const committed = JSON.stringify(state.resumes[0]);
  const result = await client.rpc('save_resume', {
    ...rawSnapshot, p_resume_id: created.data, p_title: 'Unversioned overwrite',
  });
  assert.equal(result.status, 400);
  assert.equal(result.error.code, '22023');
  assert.equal(result.error.message, 'RESUME_VERSION_REQUIRED');
  assert.equal(JSON.stringify(state.resumes[0]), committed);
  const loaded = await client.rpc('get_resume_versioned', { p_resume_id: created.data });
  assert.equal(loaded.data[0].revision, 1);
});

test('fixture transport denies wrong-owner and missing-target versioned writes without mutation', async (t) => {
  const { connect, state } = await fixture(t);
  const { client, service } = await connect();
  const committed = JSON.stringify(state.resumes);
  for (const args of [
    { p_user_id: '55555555-5555-4555-8555-555555555555', p_resume_id: QA_RESUME_ID },
    { p_user_id: QA_USER_ID, p_resume_id: '66666666-6666-4666-8666-666666666666' },
  ]) {
    const result = await client.rpc('save_resume_versioned', { ...rawSnapshot, ...args, p_title: 'Rejected write', p_expected_revision: 1 });
    assert.equal(result.status, 403);
    assert.equal(result.error.code, '42501');
    assert.equal(result.data, null);
  }
  assert.equal(JSON.stringify(state.resumes), committed);
  assert.equal(await service.getResumeById('66666666-6666-4666-8666-666666666666'), null);
});

test('fixture rejects partial snapshots and versioned creates with a branch revision', async (t) => {
  const { connect, state } = await fixture(t);
  const { client } = await connect();
  const committed = JSON.stringify(state.resumes);
  const partial = await client.rpc('save_resume_versioned', {
    p_user_id: QA_USER_ID, p_resume_id: QA_RESUME_ID, p_title: 'Partial', p_expected_revision: 1,
  });
  assert.equal(partial.status, 404);
  assert.equal(partial.error.code, 'PGRST202');
  const invalidCreate = await client.rpc('save_resume_versioned', { ...rawSnapshot, p_expected_revision: 1 });
  assert.equal(invalidCreate.status, 400);
  assert.equal(invalidCreate.error.message, 'RESUME_VERSION_REQUIRED');
  assert.equal(JSON.stringify(state.resumes), committed);
});
