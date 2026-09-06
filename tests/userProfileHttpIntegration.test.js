import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_USER_ID } from './fixtures/qa-server.mjs';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

// Actual profile service and Supabase SDK over loopback HTTP. These assertions
// prove the transport contract, not database locks/RLS; real SQL replay is separate.
async function fixture(t) {
  const { server, state } = createQaServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = async () => {
    const client = createClient(url, 'qa-local-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, url, 'No external requests');
        return fetch(input, init);
      } },
    });
    const { error } = await client.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
    assert.equal(error, null);
    const { exports: service } = loadEdgeFunction('src/services/userProfileService.js', {
      imports: { './supabase': { supabase: client } },
    });
    return { client, service };
  };
  return { state, connect };
}

test('two real profile service clients receive version metadata and stale HTTP updates preserve the winning profile', async (t) => {
  const env = await fixture(t);
  const first = await env.connect();
  const second = await env.connect();
  const a = await first.service.getUserProfile(QA_USER_ID);
  const b = await second.service.getUserProfile(QA_USER_ID);
  assert.equal(a.id, b.id);
  assert.equal(a.revision, 1);
  const saved = await first.service.saveUserProfile({ ...a, personal: { ...a.personal, fullName: 'Winning profile' } }, QA_USER_ID);
  assert.equal(saved.profile_id, a.id);
  assert.equal(saved.revision, 2);
  const committed = JSON.stringify(env.state.profile);
  await assert.rejects(second.service.saveUserProfile({ ...b, personal: { ...b.personal, fullName: 'Stale profile' } }, QA_USER_ID),
    (error) => error instanceof second.service.ProfileConflictError && error.code === 'PROFILE_CONFLICT');
  assert.equal(JSON.stringify(env.state.profile), committed);
  assert.equal(b.revision, 1, 'The service must not mutate or rebase the rejected snapshot');
  assert.equal(env.state.requestLog.filter((entry) => entry.path.endsWith('/save_user_profile_versioned')).length, 2);
  assert.equal(env.state.requestLog.some((entry) => entry.path.endsWith('/save_user_profile')), false);
});

test('simultaneous absent-profile service creates resolve as one confirmed profile and one typed conflict', async (t) => {
  const env = await fixture(t);
  env.state.profile = null;
  const first = await env.connect();
  const second = await env.connect();
  assert.equal(await first.service.getUserProfile(QA_USER_ID), null);
  assert.equal(await second.service.getUserProfile(QA_USER_ID), null);
  const outcomes = await Promise.allSettled([
    first.service.saveUserProfile({ personal: { fullName: 'First create' } }, QA_USER_ID),
    second.service.saveUserProfile({ personal: { fullName: 'Second create' } }, QA_USER_ID),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((result) => result.status === 'rejected' && result.reason.code === 'PROFILE_CONFLICT').length, 1);
  const saved = outcomes.find((result) => result.status === 'fulfilled').value;
  assert.equal(saved.revision, 1);
  assert.equal(saved.profile_id, env.state.profile.id);
  assert.equal((await first.service.getUserProfile(QA_USER_ID)).id, saved.profile_id);
});

test('explicitly loaded later profile revision saves normally while malformed identity never reaches HTTP', async (t) => {
  const env = await fixture(t);
  const { service } = await env.connect();
  const first = await service.getUserProfile(QA_USER_ID);
  await service.saveUserProfile({ ...first, skills: ['First skill'] }, QA_USER_ID);
  const current = await service.getUserProfile(QA_USER_ID);
  const saved = await service.saveUserProfile({ ...current, skills: ['Reviewed new skill'] }, QA_USER_ID);
  assert.equal(saved.revision, 3);
  assert.deepEqual(env.state.profile.skills, ['Reviewed new skill']);
  const requests = env.state.requestLog.length;
  await assert.rejects(service.saveUserProfile({ id: current.id, personal: current.personal }, QA_USER_ID), { code: 'PROFILE_VERSION_REQUIRED' });
  assert.equal(env.state.requestLog.length, requests);
});

test('fixture profile transport rejects old updates, incomplete snapshots, cross-owner loads and wrong profile identities', async (t) => {
  const env = await fixture(t);
  const { client } = await env.connect();
  const before = JSON.stringify(env.state.profile);
  const body = { p_user_id: QA_USER_ID, p_personal: {}, p_work_experience: [], p_education: [], p_skills: [],
    p_certifications: [], p_projects: [], p_languages: [], p_interests: [], p_reference_list: [] };
  assert.equal((await client.rpc('save_user_profile', body)).error.code, '22023');
  assert.equal((await client.rpc('save_user_profile_versioned', { p_user_id: QA_USER_ID })).error.code, 'PGRST202');
  assert.equal((await client.rpc('get_user_profile_versioned', { p_user_id: 'other-account' })).error.code, '42501');
  const wrong = await client.rpc('save_user_profile_versioned', { ...body,
    p_expected_profile_id: '20000000-0000-4000-8000-000000000001', p_expected_revision: 1 });
  assert.equal(wrong.error.code, 'PT409');
  assert.equal(JSON.stringify(env.state.profile), before);
});
