import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

function webhookFor(type, subscriptionStatus = 'active') {
  const calls = [];
  const objectId = type === 'invoice.payment_succeeded' ? 'in_fixture' : 'sub_fixture';
  const event = { id: 'evt_fixture', type, data: { object: { id: objectId, status: 'active' } } };
  const subscription = { id: 'sub_fixture', customer: 'cus_fixture', status: subscriptionStatus,
    current_period_start: 1788825600, current_period_end: 1791417600 };
  const client = {
    from: () => queryResult({ data: { id: 'user_fixture', event_id: event.id }, error: null }, calls),
    rpc: async () => ({ error: null }),
  };
  class StripeMock {
    constructor(key, options) { calls.push(['apiVersion', options.apiVersion]); }
    static createSubtleCryptoProvider() { return {}; }
    webhooks = { constructEventAsync: async () => event };
    subscriptions = { retrieve: async (id) => { calls.push(['subscription', id]); return subscription; } };
    invoices = { retrieve: async (id) => { calls.push(['invoice', id]); return { id, customer: 'cus_fixture', subscription: 'sub_fixture' }; } };
  }
  const { handler } = loadEdgeFunction('supabase/functions/stripe-webhook/index.ts', {
    env: { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'fixture', NODE_ENV: 'production' },
    imports: {
      'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
      'https://esm.sh/stripe@12.0.0': { default: StripeMock },
    },
  });
  return { calls, run: () => handler(new Request('https://edge.test/stripe', {
    method: 'POST', headers: { 'stripe-signature': 'fixture' }, body: '{}',
  })) };
}

test('invoice webhooks normalize newer payloads using the pinned Stripe API', async () => {
  const { run, calls } = webhookFor('invoice.payment_succeeded');
  assert.equal((await run()).status, 200);
  assert.ok(calls.some(([kind, id]) => kind === 'invoice' && id === 'in_fixture'));
  assert.ok(calls.some(([kind, id]) => kind === 'subscription' && id === 'sub_fixture'));
  assert.ok(calls.some(([kind, data]) => kind === 'update' && data.is_premium === true));
});

test('stale active subscription events do not reactivate canceled subscriptions', async () => {
  const { run, calls } = webhookFor('customer.subscription.updated', 'canceled');
  assert.equal((await run()).status, 200);
  assert.ok(calls.some(([kind, id]) => kind === 'subscription' && id === 'sub_fixture'));
  assert.ok(calls.some(([kind, data]) => kind === 'update' && data.is_premium === false));
  assert.equal(calls.some(([kind, data]) => kind === 'update' && data.is_premium === true), false);
});
