import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const env = { PAYPAL_CLIENT_ID: 'fixture', PAYPAL_CLIENT_SECRET: 'fixture', PAYPAL_PLAN_MONTHLY: 'P-MONTH', PAYPAL_PLAN_YEARLY: 'P-YEAR' };
function payment(overrides = {}) {
  return { status: 'COMPLETED', time: '2026-01-31T12:00:00Z', amount_with_breakdown: { gross_amount: { value: '9.99', currency_code: 'USD' } }, ...overrides };
}
test('PayPal requires a completed payment with the exact currency and amount', () => {
  const { exports: { paidPeriod } } = loadEdgeFunction('supabase/functions/_shared/paypal.ts');
  const now = Date.parse('2026-02-01');
  assert.equal(paidPeriod(payment(), 1, '9.99', now).end, '2026-02-28T12:00:00.000Z');
  for (const status of ['PENDING', 'DENIED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED']) assert.equal(paidPeriod(payment({ status }), 1, '9.99', now), null);
  for (const gross_amount of [{ value: '0.01', currency_code: 'USD' }, { value: '9.99', currency_code: 'EUR' }]) {
    assert.equal(paidPeriod(payment({ amount_with_breakdown: { gross_amount } }), 1, '9.99', now), null);
  }
  assert.equal(paidPeriod(payment({ time: 'invalid' }), 1, '9.99', now), null);
  assert.equal(paidPeriod(payment({ time: '2030-01-01T00:00:00Z' }), 1, '9.99', now), null);
  assert.equal(paidPeriod(payment(), 1, '9.99', Date.parse('2026-03-01')), null);
});

test('PayPal yearly periods clamp leap day', () => {
  const { exports: { paidPeriod } } = loadEdgeFunction('supabase/functions/_shared/paypal.ts');
  assert.equal(paidPeriod(payment({ time: '2024-02-29T12:00:00Z' }),12,'9.99',Date.parse('2024-03-01')).end,'2025-02-28T12:00:00.000Z');
});

function syncFixture({ owner = 'user-1', customId = 'request-1', planId = 'P-MONTH', transactions = [], failWrite = false } = {}) {
  const calls = [];
  const { exports } = loadEdgeFunction('supabase/functions/_shared/paypal.ts', { env,
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith('/token')) return Response.json({ access_token: 'fixture' });
      if (url.includes('/transactions?')) return Response.json({ transactions, total_pages: 1 });
      return Response.json({ id: 'I-FIXTURE', custom_id: customId, plan_id: planId, status: 'ACTIVE' });
    },
  });
  const writes = [];
  const db = { from: () => queryResult({ data: { user_id: owner, request_id: 'request-1', plan: 'premium_monthly' }, error: null }),
    rpc: async (name, args) => { writes.push([name, args]); return { error: failWrite ? { message: 'failed' } : null }; } };
  return { writes, calls, run: () => exports.syncPayPalSubscription(db, 'I-FIXTURE', 'user-1') };
}
test('PayPal approval without payment never grants Premium', async () => {
  const { run, writes } = syncFixture();
  assert.equal((await run()).paid, false);
  assert.equal(writes[0][1].p_updates.is_premium, false);
  assert.deepEqual(writes.map(([name]) => name), ['apply_billing_entitlement', 'upsert_billing_subscription_projection']);
});
test('PayPal payment verification enforces mapped owner, custom ID and allowed plan', async () => {
  for (const options of [{ owner: 'other-user' }, { customId: 'other-request' }, { planId: 'P-CHEAPER' }]) {
    const { run, writes } = syncFixture(options);
    await assert.rejects(run);
    assert.equal(writes.length, 0);
  }
});
test('PayPal paid access uses the database ledger and synchronizes quota only after a successful write', async () => {
  const transactions = [payment({ id: 'txn-1', time: new Date(Date.now() - 60000).toISOString() })];
  const { run, writes } = syncFixture({ transactions });
  assert.equal((await run()).paid, true);
  assert.equal(writes[0][1].p_provider, 'paypal');
  assert.equal(writes[1][0], 'upsert_billing_subscription_projection');
  assert.equal(writes[2][0], 'sync_ai_quota_period_for_user');
  assert.ok(writes.some(([name]) => name === 'record_billing_transaction_projection'));
  const failed = syncFixture({ transactions, failWrite: true });
  await assert.rejects(failed.run);
  assert.equal(failed.writes.length, 1);
});

test('PayPal reconciliation reads bounded transaction pages and labels sandbox projections correctly', async () => {
  const pages = [];
  const { exports } = loadEdgeFunction('supabase/functions/_shared/paypal.ts', {
    env: { ...env, PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com' },
    fetch: async (url) => {
      if (url.endsWith('/token')) return Response.json({ access_token: 'fixture' });
      if (url.includes('/transactions?')) {
        const page = Number(new URL(url).searchParams.get('page') || '1');
        pages.push(page);
        return Response.json({
          transactions: page === 2 ? [payment({ id: 'txn-page-2', time: new Date(Date.now() - 60000).toISOString() })] : [],
          total_pages: 2,
        });
      }
      return Response.json({ id: 'I-FIXTURE', custom_id: 'request-1', plan_id: 'P-MONTH', status: 'ACTIVE' });
    },
  });
  const writes = [];
  const db = {
    from: () => queryResult({ data: { user_id: 'user-1', request_id: 'request-1', plan: 'premium_monthly' }, error: null }),
    rpc: async (name, args) => { writes.push([name, args]); return { error: null }; },
  };

  const result = await exports.syncPayPalSubscription(db, 'I-FIXTURE', 'user-1');
  assert.equal(result.paid, true);
  assert.deepEqual(pages, [1, 2]);
  const projection = writes.find(([name]) => name === 'upsert_billing_subscription_projection');
  assert.equal(projection[1].p_snapshot.livemode, false);
});

test('PayPal transaction pagination fails closed beyond the reconciliation bound', async () => {
  const { exports } = loadEdgeFunction('supabase/functions/_shared/paypal.ts', {
    env,
    fetch: async (url) => {
      if (url.endsWith('/token')) return Response.json({ access_token: 'fixture' });
      if (url.includes('/transactions?')) return Response.json({ transactions: [], total_pages: 13 });
      return Response.json({ id: 'I-FIXTURE', custom_id: 'request-1', plan_id: 'P-MONTH', status: 'ACTIVE' });
    },
  });
  const db = {
    from: () => queryResult({ data: { user_id: 'user-1', request_id: 'request-1', plan: 'premium_monthly' }, error: null }),
    rpc: async () => ({ error: null }),
  };
  await assert.rejects(exports.syncPayPalSubscription(db, 'I-FIXTURE', 'user-1'), /exceeds reconciliation bound/);
});
test('PayPal webhook rejects unsigned and invalidly signed messages without database writes', async () => {
  for (const signed of [false, true]) {
    let writes = 0;
    const { handler } = loadEdgeFunction('supabase/functions/paypal-webhook/index.ts', { env: { ...env, PAYPAL_WEBHOOK_ID: 'fixture' },
      imports: { 'https://esm.sh/@supabase/supabase-js@2': { createClient: () => ({ from() { writes++; throw new Error('Unexpected database access'); } }) } },
      fetch: async (url) => Response.json(url.endsWith('/token') ? { access_token: 'fixture' } : { verification_status: 'FAILURE' }),
    });
    const headers = signed ? Object.fromEntries(['paypal-transmission-id','paypal-transmission-time','paypal-transmission-sig','paypal-cert-url','paypal-auth-algo'].map((key) => [key, 'fixture'])) : {};
    assert.equal((await handler(new Request('https://edge.test/paypal', { method: 'POST', headers, body: '{}' }))).status, 400);
    assert.equal(writes, 0);
  }
});

test('PayPal webhook acknowledges a processed duplicate without syncing access again', async () => {
  const calls = [];
  let receiptLookup = false;
  const db = {
    from(table) {
      calls.push(table);
      if (table === 'billing_provider_events' && !receiptLookup) {
        receiptLookup = true;
        return queryResult({ data: null, error: { code: '23505', message: 'duplicate key' } });
      }
      if (table === 'billing_provider_events') {
        return queryResult({ data: { status: 'processed', created_at: new Date().toISOString() }, error: null });
      }
      throw new Error('PayPal checkout lookup should not run for a duplicate');
    },
  };
  const { handler } = loadEdgeFunction('supabase/functions/paypal-webhook/index.ts', {
    env: { ...env, PAYPAL_WEBHOOK_ID: 'fixture' },
    imports: { 'https://esm.sh/@supabase/supabase-js@2': { createClient: () => db } },
    fetch: async (url) => Response.json(url.endsWith('/token')
      ? { access_token: 'fixture' }
      : { verification_status: 'SUCCESS' }),
  });
  const headers = Object.fromEntries(['paypal-transmission-id', 'paypal-transmission-time', 'paypal-transmission-sig', 'paypal-cert-url', 'paypal-auth-algo'].map((key) => [key, 'fixture']));
  const response = await handler(new Request('https://edge.test/paypal', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'WH-FIXTURE', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-FIXTURE' } }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['billing_provider_events', 'billing_provider_events']);
});
