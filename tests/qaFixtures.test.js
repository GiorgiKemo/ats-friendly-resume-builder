import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_RESUME_ID, QA_USER_ID } from './fixtures/qa-server.mjs';

async function fixture(t, options) {
  const { server, state } = createQaServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = createClient(url, 'qa-local-anon-key', { auth: { persistSession: false, autoRefreshToken: false } });
  return { client, state, url };
}

async function signIn(client) {
  const { data, error } = await client.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
  assert.equal(error, null);
  assert.equal(data.user.id, QA_USER_ID);
  return data.session;
}

test('local fixtures authenticate through the real Supabase SDK and reject invalid credentials', async (t) => {
  const { client } = await fixture(t);
  const invalid = await client.auth.signInWithPassword({ email: QA_EMAIL, password: 'incorrect' });
  assert.equal(invalid.error.code, 'invalid_credentials');
  await signIn(client);
  const { data, error } = await client.auth.getUser();
  assert.equal(error, null);
  assert.equal(data.user.email, QA_EMAIL);
  assert.equal(data.user.app_metadata.is_admin, undefined);
});

test('local fixtures exercise subscription, profile and resume RPC response contracts', async (t) => {
  const { client } = await fixture(t, { premium: true });
  await signIn(client);
  const subscription = await client.from('users').select('*').eq('id', QA_USER_ID).maybeSingle();
  assert.equal(subscription.error, null);
  assert.equal(subscription.data.is_premium, true);
  const profile = await client.rpc('get_user_profile', { p_user_id: QA_USER_ID });
  assert.equal(profile.data[0].personal.fullName, 'Alex Morgan');
  const resume = await client.rpc('get_resume_with_content', { p_resume_id: QA_RESUME_ID });
  assert.equal(resume.data[0].personal_info.email, QA_EMAIL);
  const versioned = await client.rpc('get_resume_versioned', { p_resume_id: QA_RESUME_ID });
  assert.equal(versioned.data[0].revision, 1);
  const remaining = await client.rpc('get_remaining_ai_generations');
  assert.equal(remaining.data, 47);
});

test('local fixture resume create, read, update and delete round-trip in memory', async (t) => {
  const { client } = await fixture(t, { empty: true });
  await signIn(client);
  const snapshot = { p_user_id: QA_USER_ID, p_title: 'QA original', p_description: '', p_selected_template: 'ats-friendly',
    p_selected_font: 'Arial', p_is_public: false, p_personal_info: { fullName: 'QA Candidate' }, p_work_experience: [],
    p_education: [], p_skills: [], p_certifications: [], p_projects: [], p_additional_sections: [] };
  const created = await client.rpc('save_resume_versioned', { ...snapshot, p_resume_id: null, p_expected_revision: null });
  assert.equal(created.error, null);
  const id = created.data.resume_id;
  assert.match(id, /^[a-f0-9-]{36}$/);
  assert.equal(created.data.revision, 1);
  const revised = await client.rpc('save_resume_versioned', { ...snapshot, p_resume_id: id, p_title: 'QA revised', p_expected_revision: 1 });
  assert.equal(revised.data.revision, 2);
  assert.equal(Number.isNaN(Date.parse(revised.data.updated_at)), false);
  const loaded = await client.rpc('get_resume_versioned', { p_resume_id: id });
  assert.equal(loaded.data[0].title, 'QA revised');
  assert.equal(loaded.data[0].personal_info.fullName, 'QA Candidate');
  assert.equal(loaded.data[0].revision, 2);
  await client.rpc('delete_resume', { p_resume_id: id });
  const deleted = await client.from('user_resumes').select('*');
  assert.deepEqual(deleted.data, []);
});

test('local fixture application CRUD and ownership filters use real HTTP requests', async (t) => {
  const { client } = await fixture(t, { empty: true });
  await signIn(client);
  const created = await client.from('job_applications').insert({ user_id: QA_USER_ID, company: 'Fixture Company', position: 'Designer', status: 'saved' }).select().single();
  assert.equal(created.error, null);
  const id = created.data.id;
  const updated = await client.from('job_applications').update({ status: 'interview' }).eq('id', id).eq('user_id', QA_USER_ID).select().single();
  assert.equal(updated.data.status, 'interview');
  const notOwned = await client.from('job_applications').select('*').eq('user_id', 'another-user');
  assert.deepEqual(notOwned.data, []);
  const deleted = await client.from('job_applications').delete().eq('id', id);
  assert.equal(deleted.error, null);
  assert.deepEqual((await client.from('job_applications').select('*')).data, []);
});

test('local fixtures do not expose authenticated rows to the public key', async (t) => {
  const { client } = await fixture(t);
  const result = await client.from('users').select('*');
  assert.equal(result.status, 401);
});

test('local fixtures fail closed for external actions and unknown endpoints', async (t) => {
  const { client, url } = await fixture(t);
  const session = await signIn(client);
  for (const path of ['/functions/v1/create-checkout-session', '/functions/v1/generate-resume']) {
    const response = await fetch(`${url}${path}`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /intentionally disabled/);
  }
  const unknown = await client.rpc('unimplemented_rpc');
  assert.equal(unknown.status, 501);
});

test('local fixture server rejects non-loopback browser origins', async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(`${url}/__qa/state`, { headers: { Origin: 'https://example.com' } });
  assert.equal(response.status, 403);
});

test('fixture CORS preflight accepts headers sent by the browser Supabase SDK', async (t) => {
  const { url } = await fixture(t);
  const headers = ['authorization', 'apikey', 'content-type', 'accept-profile', 'content-profile', 'x-client-info', 'prefer', 'range', 'x-supabase-api-version', 'x-retry-count'];
  const response = await fetch(`${url}/rest/v1/users`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:5174', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': headers.join(',') },
  });
  assert.equal(response.status, 204);
  const allowed = response.headers.get('Access-Control-Allow-Headers').split(',').map((header) => header.trim());
  for (const header of headers) assert.ok(allowed.includes(header), `CORS should allow ${header}`);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5174');
});
