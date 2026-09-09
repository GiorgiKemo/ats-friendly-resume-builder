import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'supabase';

const makeQuery = (result) => {
  const query = {
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    query[method] = () => query;
  }
  return query;
};

test('privacy worker rejects unauthorized requests before creating a service client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/privacy-worker/index.ts', {
    env: { PRIVACY_WORKER_SECRET: 'worker-secret' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-privacy-worker-secret': 'wrong-secret' },
    body: JSON.stringify({ limit: 10 }),
  }));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('privacy worker expires old exports, processes a claimed job, and completes it', async () => {
  const calls = [];
  const userId = '10000000-0000-4000-8000-000000000001';
  const jobId = '20000000-0000-4000-8000-000000000002';
  const client = {
    rpc: async (name, payload) => {
      calls.push(['rpc', name, payload]);
      if (name === 'privacy_expire_exports') return { data: [{ storagePath: `${userId}/expired.json` }], error: null };
      if (name === 'privacy_claim_export_jobs') return { data: [{ jobId, targetUserId: userId, attempt: 1 }], error: null };
      if (name === 'privacy_complete_export_job') return { data: { jobId, status: 'ready' }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
      if (table === 'users') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: userId, email: 'user@example.test' }, error: null }) }) }) };
      const rows = {
        user_profiles: [{ id: 'profile-1', user_id: userId }],
        resumes: [{ id: 'resume-1', user_id: userId }],
        job_applications: [],
        ai_generations: [],
        billing_entitlements: [],
        manual_access_grants: [],
        paypal_checkouts: [],
        analytics_events: [],
        support_conversations: [],
        customer_feedback: [],
        resume_content: [],
        support_messages: [],
        support_attachments: [],
      };
      return { select: () => makeQuery({ data: rows[table] || [], error: null }) };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null }; },
        upload: async (path, bytes, options) => {
          calls.push(['upload', bucket, path, bytes.byteLength, options]);
          return { error: null };
        },
      }),
    },
  };

  const { handler } = loadEdgeFunction('supabase/functions/privacy-worker/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      PRIVACY_WORKER_SECRET: 'worker-secret',
    },
    imports: { [publicKeyImport]: { createClient: () => client } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-privacy-worker-secret': 'worker-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, completed: 1, failed: 0, expired: 1, cleanupFailures: 0 });
  const remove = calls.find((call) => call[0] === 'remove');
  assert.equal(remove[0], 'remove');
  assert.equal(remove[1], 'privacy-exports');
  assert.equal(JSON.stringify(remove[2]), JSON.stringify([`${userId}/expired.json`]));
  const upload = calls.find((call) => call[0] === 'upload');
  assert.equal(upload[1], 'privacy-exports');
  assert.equal(upload[2], `${userId}/${jobId}.json`);
  assert.ok(upload[3] > 0);
  assert.equal(calls.filter((call) => call[0] === 'rpc' && call[1] === 'privacy_complete_export_job').length, 1);
});
