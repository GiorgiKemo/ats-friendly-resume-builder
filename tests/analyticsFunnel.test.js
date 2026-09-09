import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

test('upgrade clicks emit a GA event and a safe first-party event', async () => {
  const gaCalls = [];
  const rpcCalls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': {
        supabase: {
          rpc: async (...args) => {
            rpcCalls.push(args);
            return { data: 'event-id', error: null };
          },
        },
      },
    },
    globals: {
      window: { gtag: (...args) => gaCalls.push(args) },
    },
  });

  exports.trackUpgradeClick({ planId: 'premium_yearly', provider: 'stripe' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(gaCalls.length, 1);
  assert.equal(gaCalls[0][0], 'event');
  assert.equal(gaCalls[0][1], 'upgrade_click');
  assert.deepEqual({ ...gaCalls[0][2] }, {
    plan_id: 'premium_yearly', billing_interval: 'year', provider: 'stripe', source: 'pricing',
  });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0][1].p_event_name, 'upgrade_click');
  assert.deepEqual({ ...rpcCalls[0][1].p_properties }, { ...gaCalls[0][2] });
});

test('analytics failures never reject the upgrade click path', async () => {
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': {
        supabase: { rpc: async () => ({ data: null, error: new Error('analytics unavailable') }) },
      },
    },
    globals: { window: { gtag: () => { throw new Error('gtag unavailable'); } } },
  });

  assert.doesNotThrow(() => exports.trackUpgradeClick({ planId: 'premium_monthly', provider: 'paypal' }));
  await new Promise((resolve) => setImmediate(resolve));
});

test('purchase tracking requires a verified transaction id and never writes to the first-party stream', async () => {
  const gaCalls = [];
  const rpcCalls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': {
        supabase: { rpc: async (...args) => { rpcCalls.push(args); return { data: null, error: null }; } },
      },
    },
    globals: { window: { gtag: (...args) => gaCalls.push(args) } },
  });

  exports.trackPurchase({ planId: 'premium_monthly', provider: 'stripe' });
  exports.trackPurchase({ planId: 'premium_monthly', provider: 'stripe', transactionId: 'cs_test_123' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(gaCalls.length, 1);
  assert.equal(gaCalls[0][1], 'purchase');
  assert.equal(gaCalls[0][2].transaction_id, 'cs_test_123');
  assert.equal(rpcCalls.length, 0);
});

test('resume exports and application creation emit safe funnel events', async () => {
  const gaCalls = [];
  const rpcCalls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': {
        supabase: {
          rpc: async (...args) => {
            rpcCalls.push(args);
            return { data: 'event-id', error: null };
          },
        },
      },
    },
    globals: {
      window: { gtag: (...args) => gaCalls.push(args) },
    },
  });

  exports.trackApplicationCreated({ status: 'saved' });
  const { exports: googleExports } = loadEdgeFunction('src/services/googleAnalyticsService.js', {
    globals: {
      window: { gtag: (...args) => gaCalls.push(args) },
    },
  });
  googleExports.trackResumeExport('docx');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(gaCalls.map((call) => [call[1], { ...call[2] }]), [
    ['application_created', { status: 'saved' }],
    ['resume_exported', { format: 'docx' }],
  ]);
  assert.deepEqual(rpcCalls.map((call) => [call[1].p_event_name, { ...call[1].p_properties }]), [
    ['application_created', { status: 'saved' }],
  ]);
});
