import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const event = { id: 'evt_test', type: 'invoice.payment_succeeded', data: { object: {} } };
const duplicate = { error: { code: '23505', message: 'duplicate' } };
function loadWebhook(results) {
  const calls = [];
  const client = { from: (table) => { calls.push(['from', table]); return queryResult(results.shift(), calls); } };
  class StripeMock {
    static createSubtleCryptoProvider() { return {}; }
    webhooks = { constructEventAsync: async () => event };
  }
  const loaded = loadEdgeFunction('supabase/functions/stripe-webhook/index.ts', {
    env: { STRIPE_WEBHOOK_SECRET: 'test-secret', NODE_ENV: 'production' },
    imports: {
      'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
      'https://esm.sh/stripe@12.0.0': { default: StripeMock },
    },
    expose: ['claimWebhookEvent', 'getSubscriptionPeriodEnd'],
  });
  return { ...loaded, calls };
}

test('already processed and intentionally skipped Stripe events are acknowledged as duplicates', async () => {
  for (const status of ['processed', 'skipped']) {
    const { exports: { claimWebhookEvent } } = loadWebhook([duplicate, { data: { status } }]);
    assert.equal(await claimWebhookEvent(event), false);
  }
});

test('Stripe failed-event retries use an atomic compare-and-set claim', async () => {
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  const { exports: { claimWebhookEvent }, calls } = loadWebhook([duplicate, { data: { status: 'failed', created_at: createdAt } }, { data: { event_id: event.id } }]);
  assert.equal(await claimWebhookEvent(event), true);
  assert.ok(calls.some(([method, key, value]) => method === 'eq' && key === 'status' && value === 'failed'));
  assert.ok(calls.some(([method, key, value]) => method === 'eq' && key === 'created_at' && value === createdAt));
});

test('lost retry races and fresh processing claims are retriable errors, not success acknowledgements', async () => {
  const createdAt = new Date().toISOString();
  const racing = loadWebhook([duplicate, { data: { status: 'failed', created_at: createdAt } }, { data: null }]);
  await assert.rejects(racing.exports.claimWebhookEvent(event), /retry later/);
  const processing = loadWebhook([duplicate, { data: { status: 'processing', created_at: createdAt } }]);
  await assert.rejects(processing.exports.claimWebhookEvent(event), /retry later/);
});

test('abandoned processing claims can be recovered after the lease expires', async () => {
  const createdAt = new Date(Date.now() - 16 * 60_000).toISOString();
  const { exports: { claimWebhookEvent } } = loadWebhook([duplicate, { data: { status: 'processing', created_at: createdAt } }, { data: { event_id: event.id } }]);
  assert.equal(await claimWebhookEvent(event), true);
});

test('Stripe event lookup failures fail closed', async () => {
  const { exports: { claimWebhookEvent } } = loadWebhook([duplicate, { data: null, error: { message: 'DB offline' } }]);
  await assert.rejects(claimWebhookEvent(event), /Could not read Stripe event/);
});

test('a duplicate worker returns 500 without marking the active worker claim failed', async () => {
  const { handler, calls } = loadWebhook([duplicate, { data: { status: 'processing', created_at: new Date().toISOString() } }]);
  const response = await handler(new Request('https://edge.test/stripe', { method: 'POST', headers: { 'stripe-signature': 'test' }, body: '{}' }));
  assert.equal(response.status, 500);
  assert.equal(calls.some(([method, payload]) => method === 'update' && payload.status === 'failed'), false);
  assert.notEqual((await response.json()).error, 'Invalid signature');
});

test('Stripe entitlement periods fail closed when Stripe omits the billing boundary', () => {
  const { exports: { getSubscriptionPeriodEnd } } = loadWebhook([]);
  assert.equal(getSubscriptionPeriodEnd({ current_period_end: 4102444800 }), 4102444800);
  for (const value of [undefined, null, 0, -1, Infinity, '4102444800']) {
    assert.throws(() => getSubscriptionPeriodEnd({ current_period_end: value }), /period is missing/);
  }
});
