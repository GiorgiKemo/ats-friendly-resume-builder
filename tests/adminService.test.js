import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const service = (response) => loadEdgeFunction('src/services/adminService.js', {
  imports: { './supabase': { supabase: { functions: { invoke: async () => response } } } },
}).exports;

test('admin authorization failures explain the access boundary without raw SDK errors', async () => {
  for (const [status, message] of [[403, /administrators only/], [401, /Sign in again/]]) {
    const app = service({ error: { context: { status }, message: 'Edge Function returned a non-2xx status code' } });
    await assert.rejects(app.fetchAdminOverview(), message);
  }
});

test('admin service keeps failures distinct from successful responses', async () => {
  await assert.rejects(service({ error: { context: { status: 500 } } }).fetchAdminOverview(), /Please try again/);
  await assert.rejects(service({ data: { ok: false, error: 'Action unavailable' } }).fetchAdminOverview(), /Action unavailable/);
  const data = { ok: true, users: [] };
  assert.equal(await service({ data }).fetchAdminOverview(), data);
});

test('admin service preserves pending-operation metadata for reconciliation UI', async () => {
  const app = service({ data: { ok: false, code: 'operation_pending_reconciliation', requestId: 'request-1', error: 'Receipt pending' } });
  await assert.rejects(app.fetchAdminOverview(), (error) => {
    assert.equal(error.code, 'operation_pending_reconciliation');
    assert.equal(error.requestId, 'request-1');
    assert.equal(error.message, 'Receipt pending');
    return true;
  });
});

test('admin reads stay ordinary while mutations carry an idempotency key', async () => {
  const calls = [];
  const app = loadEdgeFunction('src/services/adminService.js', {
    imports: {
      './supabase': {
        supabase: {
          functions: {
            invoke: async (...args) => {
              calls.push(args);
              return { data: { ok: true } };
            },
          },
        },
      },
    },
  }).exports;

  await app.fetchAdminOverview();
  await app.fetchAdminDirectory({ search: 'person@example.com', limit: 25 });
  await app.resolveClientError('error-1', 'retry-key-123');

  assert.equal(calls[0][1].headers, undefined);
  assert.equal(calls[1][1].headers, undefined);
  assert.equal(calls[2][1].headers['x-admin-idempotency-key'], 'retry-key-123');
});
