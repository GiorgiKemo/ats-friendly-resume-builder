import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

function fixture(overrides = {}) {
  const writes = [];
  const session = {
    mode: 'subscription', status: 'complete', payment_status: 'paid',
    metadata: { userId: 'user-1', planId: 'premium_monthly' },
    customer: { id: 'cus_1', email: 'buyer@example.com' },
    subscription: {
      status: 'active', current_period_start: 1788825600, current_period_end: 1791417600,
      items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    },
    ...overrides,
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'buyer@example.com' } }, error: null }) },
    from: () => ({
      select: () => queryResult({ data: { email: 'buyer@example.com', stripe_customer_id: 'cus_1' }, error: null }),
      update: (payload) => { writes.push(payload); return queryResult({ data: { id: 'user-1' }, error: null }); },
    }),
    rpc: async () => ({ error: null }),
  };
  class StripeMock { checkout = { sessions: { retrieve: async () => session } }; }
  const { handler } = loadEdgeFunction('supabase/functions/verify-checkout-session/index.ts', {
    env: { STRIPE_SECRET_KEY: 'sk_test_fixture', SUPABASE_URL: 'https://example.test', SB_SECRET_KEY: 'fixture' },
    imports: {
      'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
      'https://esm.sh/stripe@12.18.0': { default: StripeMock },
    },
  });
  return { writes, run: () => handler(new Request('https://edge.test/verify', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'cs_test_fixture' }),
  })) };
}

test('complete paid and zero-due subscriptions grant access to their explicit owner', async () => {
  for (const payment_status of ['paid', 'no_payment_required']) {
    const { run, writes } = fixture({ payment_status });
    const response = await run();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'active');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].is_premium, true);
  }
});

test('unconfirmed payment and inactive subscriptions never grant access', async () => {
  for (const overrides of [
    { status: 'open' }, { status: 'expired' }, { payment_status: 'unpaid' },
    { mode: 'payment' }, { subscription: null },
    ...['incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'canceled', 'paused']
      .map((status) => ({ subscription: { status } })),
  ]) {
    const { run, writes } = fixture(overrides);
    assert.equal((await run()).status, 409, JSON.stringify(overrides));
    assert.equal(writes.length, 0);
  }
});

test('missing ownership metadata is rejected even when customer email matches', async () => {
  for (const overrides of [
    { metadata: {}, client_reference_id: null },
    { metadata: { userId: 'another-user' } },
    { customer: { id: 'cus_other' } },
  ]) {
    const { run, writes } = fixture(overrides);
    assert.equal((await run()).status, 403);
    assert.equal(writes.length, 0);
  }
});
