import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncAiQuotaForSubscription } from '../supabase/functions/_shared/aiQuotaBilling.ts';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'https://esm.sh/@supabase/supabase-js@2';
const request = () => new Request('https://edge.test/auto-apply', { method: 'POST', body: '{"discover_only":true}' });
function loadAutoApply({ denial, claimError = null, preferencesMissing = false, jobTitles = ['Engineer'], slotAllowed = true, slotError = null, runUpdateError = null, providerFetch, env = {}, globals = {} } = {}) {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'claim_auto_apply_run') return { data: denial ? [{ allowed: false, reason: denial }] : [{ allowed: true, run_id: 'run-1', remaining: 1 }], error: claimError };
      if (name === 'reserve_auto_apply_job_slot') return { data: slotAllowed, error: slotError };
      return { data: true, error: null };
    },
    from: (table) => {
      calls.push(['from', table]);
      if (denial || claimError) throw new Error('Denied admission must not query application data');
      if (table === 'job_preferences') return queryResult({ data: preferencesMissing ? null : { is_active: true, daily_limit: 99999, job_titles: jobTitles, locations: [], excluded_companies: [] } });
      if (table === 'auto_apply_runs') return queryResult({ data: null, error: runUpdateError }, calls);
      return queryResult({ data: table === 'auto_apply_jobs' ? [] : null }, calls);
    },
  };
  const loaded = loadEdgeFunction('supabase/functions/auto-apply-run/index.ts', {
    env: { JSEARCH_API_KEY: 'test-key', NODE_ENV: 'production', ...env },
    globals,
    imports: {
      [publicKeyImport]: { createClient: () => client },
      jspdf: {},
      '../_shared/cors.ts': { getCorsHeaders: () => ({}), isOriginAllowed: () => true, authenticateUser: async () => ({ userId: 'user-1' }) },
      '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model' },
      '../_shared/publicWebFetch.ts': { fetchPublicWebpage: async () => ({ status: 200 }), UnsafeWebDestinationError: class extends Error {} },
    },
    fetch: providerFetch || (async () => new Response(JSON.stringify({ data: [{ job_id: 'external-1', job_title: 'Engineer', employer_name: 'Company', job_apply_link: 'https://example.org/job' }] }))),
  });
  return { ...loaded, calls };
}

test('discovery records a provider outage as failure and releases its lease', async () => {
  const { handler, calls } = loadAutoApply({ providerFetch: async () => new Response('{}', { status: 503 }) });
  const response = await handler(request());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /search is unavailable/);
  assert.ok(calls.some(([name, payload]) => name === 'update' && payload.status === 'failed'));
  assert.equal(calls.at(-1)[0], 'release_auto_apply_run');
});

test('discovery aborts a stalled provider rather than leaving a running record', async () => {
  const timeouts = [];
  const { handler, calls } = loadAutoApply({
    globals: { AbortSignal: { timeout: ms => { timeouts.push(ms); return AbortSignal.abort(); } } },
    providerFetch: async (_url, options) => { options.signal.throwIfAborted(); throw new Error('Expected abort'); },
  });
  assert.equal((await handler(request())).status, 500);
  assert.deepEqual(timeouts, [20000]);
  assert.equal(calls.at(-1)[0], 'release_auto_apply_run');
});

test('a second search provider can recover from the first provider failing', async () => {
  const { handler, calls } = loadAutoApply({
    env: { BRIGHT_DATA_API_TOKEN: 'fixture-token' },
    providerFetch: async url => url.includes('brightdata')
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify({ data: [{ job_id: 'external-1', job_title: 'Engineer', employer_name: 'Company', job_apply_link: 'https://example.org/job' }] })),
  });
  assert.equal((await handler(request())).status, 200);
  assert.ok(calls.some(([name, payload]) => name === 'update' && payload.status === 'completed'));
});

test('discovery never reports success when its final run status failed to persist', async () => {
  const { handler, calls } = loadAutoApply({ runUpdateError: { message: 'Database unavailable' } });
  const response = await handler(request());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /run summary could not be saved/);
  assert.equal(calls.at(-1)[0], 'release_auto_apply_run');
});

test('auto-apply rejects active runs and exhausted budgets before external discovery', async () => {
  for (const [reason, status] of [['already_running', 409], ['daily_run_limit', 429], ['daily_job_limit', 429], ['cooldown', 429]]) {
    const { handler, calls } = loadAutoApply({ denial: reason });
    assert.equal((await handler(request())).status, status);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'claim_auto_apply_run');
    assert.equal(calls[0][1].p_user_id, 'user-1');
  }
});

test('auto-apply fails closed when admission accounting is unavailable', async () => {
  const { handler, calls } = loadAutoApply({ claimError: { message: 'DB offline' } });
  assert.equal((await handler(request())).status, 500);
  assert.equal(calls.length, 1);
});

test('auto-apply releases its own lease on setup failure', async () => {
  const { handler, calls } = loadAutoApply({ preferencesMissing: true });
  assert.match((await (await handler(request())).json()).error, /preferences/);
  assert.equal(calls.at(-1)[0], 'release_auto_apply_run');
  assert.equal(calls.at(-1)[1].p_user_id, 'user-1');
  assert.equal(calls.at(-1)[1].p_run_id, 'run-1');
});

test('auto-apply refuses incomplete preferences instead of inventing a default job query', async () => {
  const { handler, calls } = loadAutoApply({ jobTitles: [] });
  const response = await handler(request());
  assert.match((await response.json()).error, /at least one job title/);
  assert.equal(calls.some(([kind, table]) => kind === 'from' && table === 'auto_apply_jobs'), false);
});

test('auto-apply cannot queue or send a job after its durable job budget is exhausted', async () => {
  const { handler, calls } = loadAutoApply({ slotAllowed: false });
  const response = await (await handler(request())).json();
  assert.equal(response.jobs_queued, 0);
  assert.ok(calls.some(([name]) => name === 'reserve_auto_apply_job_slot'));
  assert.equal(calls.some(([name]) => name === 'insert'), false);
  assert.equal(calls.at(-1)[0], 'release_auto_apply_run');
});

test('auto-apply job-budget errors stop the run and still release the lease', async () => {
  const { handler, calls } = loadAutoApply({ slotError: { message: 'DB offline' } });
  assert.match((await (await handler(request())).json()).error, /job processing budget/);
  assert.equal(calls.at(-1)[0], 'release_auto_apply_run');
});

test('billing quota synchronization sends the verified Stripe period to its atomic RPC', async () => {
  const calls = [];
  await syncAiQuotaForSubscription({ rpc: async (...args) => { calls.push(args); return { error: null }; } }, 'user-1', { current_period_start: 1706745600 });
  assert.deepEqual(calls, [['sync_ai_quota_period_for_user', { p_user_id: 'user-1', p_period_start: '2024-02-01T00:00:00.000Z' }]]);
});

test('billing quota synchronization does not invent missing periods or hide database failures', async () => {
  const client = { rpc: async () => ({ error: { message: 'DB offline' } }) };
  await assert.rejects(syncAiQuotaForSubscription(client, 'user-1', {}), /period is missing/);
  await assert.rejects(syncAiQuotaForSubscription(client, 'user-1', { current_period_start: 1706745600 }), /DB offline/);
});

test('invoice success must synchronize quota before the webhook is marked processed', async () => {
  const calls = [];
  const subscription = { status: 'active', current_period_start: 1706745600, current_period_end: 4102444800 };
  const event = { id: 'evt_renewal', type: 'invoice.payment_succeeded', data: { object: { id: 'in_1', subscription: 'sub_1', customer: 'cus_1' } } };
  const client = {
    from: () => queryResult({ data: { id: 'user-1' }, error: null }, calls),
    rpc: async (name, payload) => { calls.push([name, payload]); return { error: null }; },
  };
  class StripeMock {
    static createSubtleCryptoProvider() { return {}; }
    webhooks = { constructEventAsync: async () => event };
    subscriptions = { retrieve: async () => subscription };
  }
  const { handler } = loadEdgeFunction('supabase/functions/stripe-webhook/index.ts', {
    env: { STRIPE_WEBHOOK_SECRET: 'test-secret', NODE_ENV: 'production' },
    imports: { [publicKeyImport]: { createClient: () => client }, 'https://esm.sh/stripe@12.0.0': { default: StripeMock } },
  });
  const response = await handler(new Request('https://edge.test/stripe', { method: 'POST', headers: { 'stripe-signature': 'test' }, body: '{}' }));
  assert.equal(response.status, 200);
  const quotaIndex = calls.findIndex(([name]) => name === 'sync_ai_quota_period_for_user');
  const processedIndex = calls.findIndex(([name, payload]) => name === 'update' && payload.status === 'processed');
  assert.ok(quotaIndex >= 0 && processedIndex > quotaIndex);
});

function loadAiAccess(reservation) {
  const calls = [];
  const { exports } = loadEdgeFunction('supabase/functions/_shared/aiAccess.ts', {
    env: { SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-key' },
    imports: { [publicKeyImport]: { createClient: () => ({ rpc: async (name, payload) => {
      calls.push([name, payload]);
      return { data: name === 'refund_ai_generation_for_user' ? true : [reservation], error: null };
    } }) } },
  });
  return { ...exports, calls };
}

test('AI reservation and refund use the database period identity, not the Edge clock', async () => {
  const period = '2024-01-31T12:00:00+00:00';
  const access = loadAiAccess({ allowed: true, period_start: period });
  const result = await access.reserveAiGenerationOrResponse('user-1', {});
  assert.equal(result.periodStart, period);
  assert.equal(access.calls[0][0], 'reserve_ai_generation_with_period');
  assert.equal(await access.refundAiGenerationForUser('user-1', result.periodStart), true);
  assert.equal(access.calls[1][1].p_period_start, period);
});

test('AI access fails closed when a claimed reservation has no database period', async () => {
  const access = loadAiAccess({ allowed: true });
  const result = await access.reserveAiGenerationOrResponse('user-1', {});
  assert.equal(result.status, 500);
  assert.match((await result.json()).error, /quota period/);
});

test('AI denials preserve the structured access response without attempting a refund', async () => {
  const access = loadAiAccess({ allowed: false, reason: 'limit_reached', remaining: 0 });
  const result = await access.reserveAiGenerationOrResponse('user-1', {});
  assert.equal((await result.json()).reason, 'limit_reached');
  assert.equal(await access.refundAiGenerationForUser('user-1', ''), false);
  assert.equal(access.calls.length, 1);
});
