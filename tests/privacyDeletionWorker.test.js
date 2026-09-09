import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'supabase';

test('privacy deletion worker rejects unauthorized requests before creating a service client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/privacy-deletion-worker/index.ts', {
    env: { PRIVACY_DELETION_WORKER_SECRET: 'worker-secret' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-privacy-deletion-secret': 'wrong-secret' },
    body: JSON.stringify({ limit: 10 }),
  }));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('privacy deletion worker removes private artifacts, deletes Auth, and completes the leased job', async () => {
  const calls = [];
  const jobId = '20000000-0000-4000-8000-000000000002';
  const userId = '10000000-0000-4000-8000-000000000001';
  const client = {
    rpc: async (name, payload) => {
      calls.push(['rpc', name, payload]);
      if (name === 'privacy_claim_deletion_execution') return { data: { claimed: true, jobId, targetUserId: userId, step: 'delete_data' }, error: null };
      if (name === 'privacy_get_deletion_artifacts') return { data: { attachmentPaths: ['conversation/attachment'], exportPaths: [`${userId}/export.json`] }, error: null };
      if (name === 'privacy_delete_user_data') return { data: { authUserId: userId }, error: null };
      if (name === 'privacy_mark_auth_deleted') return { data: { authDeleted: true }, error: null };
      if (name === 'privacy_complete_deletion_job') return { data: { status: 'completed' }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
      if (table === 'privacy_deletion_jobs') return queryResult({ data: [{ id: jobId }], error: null }, calls);
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from: (bucket) => ({
        list: async (path, options) => { calls.push(['list', bucket, path, options]); return { data: [{ name: 'resume.pdf' }], error: null }; },
        remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null }; },
      }),
    },
    auth: {
      admin: {
        getUserById: async (id) => { calls.push(['getUserById', id]); return { data: { user: { id } }, error: null }; },
        deleteUser: async (id) => { calls.push(['deleteUser', id]); return { error: null }; },
      },
    },
  };

  const { handler } = loadEdgeFunction('supabase/functions/privacy-deletion-worker/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      PRIVACY_DELETION_WORKER_SECRET: 'worker-secret',
    },
    imports: { [publicKeyImport]: { createClient: () => client } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-privacy-deletion-secret': 'worker-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, completed: 1, failed: 0, skipped: 0 });
  assert.deepEqual(calls.find((call) => call[0] === 'remove' && call[1] === 'support-attachments'), ['remove', 'support-attachments', ['conversation/attachment']]);
  assert.deepEqual(calls.find((call) => call[0] === 'remove' && call[1] === 'privacy-exports'), ['remove', 'privacy-exports', [`${userId}/export.json`]]);
  assert.deepEqual(calls.find((call) => call[0] === 'remove' && call[1] === 'resumes'), ['remove', 'resumes', [`${userId}/resume.pdf`]]);
  assert.deepEqual(calls.find((call) => call[0] === 'deleteUser'), ['deleteUser', userId]);
  assert.equal(calls.filter((call) => call[0] === 'rpc' && call[1] === 'privacy_complete_deletion_job').length, 1);
});
