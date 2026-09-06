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
