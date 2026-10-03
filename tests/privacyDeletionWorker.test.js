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
        listV2: async (options) => { calls.push(['listV2', bucket, options]); return { data: { objects: [{ name: `${userId}/resume.pdf` }], hasNext: false }, error: null }; },
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
  const listCall = calls.find((call) => call[0] === 'listV2');
  assert.equal(listCall[1], 'resumes');
  assert.equal(listCall[2].prefix, `${userId}/`);
  assert.equal(listCall[2].limit, 1000);
  assert.deepEqual(calls.find((call) => call[0] === 'deleteUser'), ['deleteUser', userId]);
  assert.equal(calls.filter((call) => call[0] === 'rpc' && call[1] === 'privacy_complete_deletion_job').length, 1);
});

test('privacy deletion paginates resume storage and chunks every removal at the Storage API limit', async () => {
  const calls = [];
  const jobId = '20000000-0000-4000-8000-000000000002';
  const userId = '10000000-0000-4000-8000-000000000001';
  const attachments = Array.from({ length: 1003 }, (_, index) => `conversation/attachment-${index}`);
  const exports = Array.from({ length: 1002 }, (_, index) => `${userId}/export-${index}.json`);
  const resumeObjects = (start, count) => Array.from({ length: count }, (_, offset) => {
    const name = `resume-${start + offset}.pdf`;
    return { name, key: `${userId}/${name}` };
  });
  let listPage = 0;
  const client = {
    rpc: async (name, payload) => {
      calls.push(['rpc', name, payload]);
      if (name === 'privacy_claim_deletion_execution') return { data: { claimed: true, jobId, targetUserId: userId, step: 'delete_data' }, error: null };
      if (name === 'privacy_get_deletion_artifacts') return { data: { attachmentPaths: attachments, exportPaths: exports }, error: null };
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
        listV2: async (options) => {
          calls.push(['listV2', bucket, options]);
          listPage += 1;
          if (listPage === 1) return { data: { objects: resumeObjects(0, 1000), hasNext: true, nextCursor: 'resume-page-2' }, error: null };
          return { data: { objects: resumeObjects(1000, 2), hasNext: false }, error: null };
        },
        remove: async (paths) => { calls.push(['remove', bucket, paths]); return { error: null }; },
      }),
    },
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: { id } }, error: null }),
        deleteUser: async () => ({ error: null }),
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
  const removals = calls.filter((call) => call[0] === 'remove');
  const sizesByBucket = removals.reduce((sizes, [, bucket, paths]) => {
    sizes[bucket] ||= [];
    sizes[bucket].push(paths.length);
    return sizes;
  }, {});

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, completed: 1, failed: 0, skipped: 0 });
  assert.deepEqual(sizesByBucket['support-attachments'], [1000, 3]);
  assert.deepEqual(sizesByBucket['privacy-exports'], [1000, 2]);
  assert.deepEqual(sizesByBucket.resumes, [1000, 2]);
  const listCalls = calls.filter((call) => call[0] === 'listV2');
  assert.equal(listCalls.length, 2);
  assert.equal(listCalls[0][1], 'resumes');
  assert.equal(listCalls[0][2].prefix, `${userId}/`);
  assert.equal(listCalls[0][2].limit, 1000);
  assert.equal(listCalls[0][2].cursor, undefined);
  assert.equal(listCalls[1][1], 'resumes');
  assert.equal(listCalls[1][2].prefix, `${userId}/`);
  assert.equal(listCalls[1][2].limit, 1000);
  assert.equal(listCalls[1][2].cursor, 'resume-page-2');
});

test('privacy deletion fails closed on a malformed artifact path before removing files or Auth', async () => {
  const calls = [];
  const jobId = '20000000-0000-4000-8000-000000000002';
  const userId = '10000000-0000-4000-8000-000000000001';
  const client = {
    rpc: async (name, payload) => {
      calls.push(['rpc', name, payload]);
      if (name === 'privacy_claim_deletion_execution') return { data: { claimed: true, jobId, targetUserId: userId, step: 'delete_data' }, error: null };
      if (name === 'privacy_get_deletion_artifacts') return { data: { attachmentPaths: ['conversation/../other-user/file.pdf'], exportPaths: [] }, error: null };
      if (name === 'privacy_release_deletion_job') return { data: { released: true }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
      if (table === 'privacy_deletion_jobs') return queryResult({ data: [{ id: jobId }], error: null }, calls);
      throw new Error(`Unexpected table ${table}`);
    },
    storage: { from: () => ({ remove: async (paths) => { calls.push(['remove', paths]); return { error: null }; } }) },
    auth: { admin: { getUserById: async () => { calls.push(['getUserById']); return { data: { user: { id: userId } }, error: null }; } } },
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

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: false, claimed: 1, completed: 0, failed: 1, skipped: 0 });
  assert.equal(calls.filter((call) => call[0] === 'remove').length, 0);
  assert.equal(calls.filter((call) => call[0] === 'getUserById').length, 0);
  assert.equal(calls.some((call) => call[0] === 'rpc' && call[1] === 'privacy_release_deletion_job'), true);
});
