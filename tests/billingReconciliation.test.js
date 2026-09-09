import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SB_SECRET_KEY: 'service-key',
  BILLING_RECONCILIATION_SECRET: 'worker-secret',
  STRIPE_SECRET_KEY: 'sk_test_fixture',
};

const stripeSubscription = {
  id: 'sub_fixture',
  livemode: false,
  customer: 'cus_fixture',
  status: 'active',
  current_period_start: 1_706_745_600,
  current_period_end: 4_102_444_800,
  items: { data: [{ price: { id: 'price_fixture', unit_amount: 999, currency: 'usd', recurring: { interval: 'month' } } }] },
};

test('billing reconciliation requires its internal secret and does not touch the database', async () => {
  let created = 0;
  const { handler } = loadEdgeFunction('supabase/functions/billing-reconciliation/index.ts', {
    env,
    imports: {
      'https://esm.sh/stripe@12.0.0': { default: class StripeMock {} },
      supabase: { createClient: () => { created += 1; return {}; } },
    },
  });
  const response = await handler(new Request('https://edge.test/reconcile', { method: 'POST' }));
  assert.equal(response.status, 401);
  assert.equal(created, 0);
});

test('billing reconciliation refreshes Stripe state and completes a leased run', async () => {
  const calls = [];
  const client = {
    from(table) {
      if (table === 'billing_entitlements') return queryResult({ data: [{ user_id: 'user_fixture', subscription_id: 'sub_fixture' }], error: null }, calls);
      if (table === 'users') return queryResult({ data: [{ id: 'user_fixture', stripe_customer_id: 'cus_fixture' }], error: null }, calls);
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === 'billing_claim_reconciliation_run' ? { id: 'run_fixture' } : true, error: null };
    },
  };
  const { handler } = loadEdgeFunction('supabase/functions/billing-reconciliation/index.ts', {
    env,
    imports: {
      'https://esm.sh/stripe@12.0.0': { default: class StripeMock {
        constructor() { this.subscriptions = { retrieve: async () => stripeSubscription }; }
      } },
      supabase: { createClient: () => client },
    },
  });
  const response = await handler(new Request('https://edge.test/reconcile', {
    method: 'POST',
    headers: { 'x-billing-reconciliation-secret': 'worker-secret' },
    body: JSON.stringify({ provider: 'stripe', limit: 1 }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.results[0], { provider: 'stripe', status: 'completed', processed: 1, failed: 0 });
  assert.ok(calls.some(([name]) => name === 'apply_billing_entitlement'));
  assert.ok(calls.some(([name]) => name === 'upsert_billing_subscription_projection'));
  assert.ok(calls.some(([name]) => name === 'sync_ai_quota_period_for_user'));
  assert.ok(calls.some(([name]) => name === 'billing_finish_reconciliation_run'));
});

test('billing reconciliation records provider failures without changing local entitlement', async () => {
  const calls = [];
  const client = {
    from(table) {
      if (table === 'billing_entitlements') return queryResult({ data: [{ user_id: 'user_fixture', subscription_id: 'sub_fixture' }], error: null }, calls);
      if (table === 'users') return queryResult({ data: [{ id: 'user_fixture', stripe_customer_id: 'cus_fixture' }], error: null }, calls);
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === 'billing_claim_reconciliation_run' ? { id: 'run_fixture' } : true, error: null };
    },
  };
  const { handler } = loadEdgeFunction('supabase/functions/billing-reconciliation/index.ts', {
    env,
    imports: {
      'https://esm.sh/stripe@12.0.0': { default: class StripeMock {
        constructor() { this.subscriptions = { retrieve: async () => { throw new Error('provider timeout'); } }; }
      } },
      supabase: { createClient: () => client },
    },
  });
  const response = await handler(new Request('https://edge.test/reconcile', {
    method: 'POST',
    headers: { 'x-billing-reconciliation-secret': 'worker-secret' },
    body: JSON.stringify({ provider: 'stripe' }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.results[0].failed, 1);
  assert.equal(calls.some(([name]) => name === 'apply_billing_entitlement'), false);
  assert.ok(calls.some(([name]) => name === 'billing_fail_reconciliation_run'));
});
