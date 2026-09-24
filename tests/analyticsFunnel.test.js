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
      window: { localStorage: { getItem: () => 'granted' }, location: { hostname: 'www.resumeats.cv', pathname: '/pricing' }, gtag: (...args) => gaCalls.push(args) },
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
    globals: { window: { localStorage: { getItem: () => 'granted' }, location: { hostname: 'www.resumeats.cv', pathname: '/pricing' }, gtag: () => { throw new Error('gtag unavailable'); } } },
  });

  assert.doesNotThrow(() => exports.trackUpgradeClick({ planId: 'premium_monthly', provider: 'paypal' }));
  await new Promise((resolve) => setImmediate(resolve));
});

test('checkout_started records minimal provider intent only with consent', async () => {
  const storage = new Map();
  const rpcCalls = [];
  const gaCalls = [];
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
      window: {
        location: { hostname: 'www.resumeats.cv', pathname: '/pricing' },
        localStorage: { getItem: (key) => storage.get(key) ?? null },
        gtag: (...args) => gaCalls.push(args),
      },
    },
  });

  exports.trackCheckoutStarted({ planId: 'premium_yearly', provider: 'paypal' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rpcCalls.length, 0);

  storage.set('resumeats.analytics-consent', 'granted');
  exports.trackCheckoutStarted({ planId: 'premium_yearly', provider: 'paypal' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0][1].p_event_name, 'checkout_started');
  assert.deepEqual({ ...rpcCalls[0][1].p_properties }, {
    plan_id: 'premium_yearly', billing_interval: 'year', provider: 'paypal', source: 'pricing',
  });
  assert.equal(gaCalls.length, 0);
});

test('first-party client analytics requires consent and an approved non-admin production origin', async () => {
  const storage = new Map();
  const rpcCalls = [];
  const location = { hostname: 'localhost', pathname: '/pricing' };
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
      window: {
        location,
        localStorage: { getItem: (key) => storage.get(key) ?? null },
        gtag() {},
      },
    },
  });

  assert.equal(await exports.recordAnalyticsEvent('upgrade_click'), false);
  storage.set('resumeats.analytics-consent', 'denied');
  assert.equal(await exports.recordAnalyticsEvent('upgrade_click'), false);
  storage.set('resumeats.analytics-consent', 'granted');
  assert.equal(await exports.recordAnalyticsEvent('upgrade_click'), false);
  location.hostname = 'www.resumeats.cv';
  location.pathname = '/admin/users';
  assert.equal(await exports.recordAnalyticsEvent('upgrade_click'), false);
  location.pathname = '/pricing';
  assert.equal(await exports.recordAnalyticsEvent('upgrade_click'), 'event-id');
  assert.equal(rpcCalls.length, 1);
});

test('sign up emits the recommended GA event without user details only for a new identity and granted consent', () => {
  const gaCalls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': { supabase: { rpc: async () => ({ data: null, error: null }) } },
    },
    globals: {
      window: { localStorage: { getItem: () => 'granted' }, location: { hostname: 'www.resumeats.cv', pathname: '/signup' }, gtag: (...args) => gaCalls.push(args) },
    },
  });

  assert.equal(exports.trackSignUp({ identities: [{ provider: 'email' }], email: 'private@example.com', id: 'private-user-id' }), true);
  assert.equal(exports.trackSignUp({ identities: [] }), false);
  assert.equal(exports.trackSignUp({}), false);
  assert.deepEqual(gaCalls.map((call) => [call[1], { ...call[2] }]), [
    ['sign_up', { method: 'email' }],
  ]);
});

test('sign up does not send GA events without granted consent', () => {
  const gaCalls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': { supabase: { rpc: async () => ({ data: null, error: null }) } },
    },
    globals: {
      window: { localStorage: { getItem: () => 'unknown' }, location: { hostname: 'www.resumeats.cv', pathname: '/signup' }, gtag: (...args) => gaCalls.push(args) },
    },
  });

  assert.equal(exports.trackSignUp({ identities: [{ provider: 'email' }] }), false);
  assert.equal(gaCalls.length, 0);
});

test('purchase tracking requires a verified opaque analytics UUID and never writes to the first-party stream', async () => {
  const gaCalls = [];
  const rpcCalls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': {
        supabase: { rpc: async (...args) => { rpcCalls.push(args); return { data: null, error: null }; } },
      },
    },
    globals: { window: { localStorage: { getItem: () => 'granted' }, location: { hostname: 'www.resumeats.cv', pathname: '/subscription/success' }, gtag: (...args) => gaCalls.push(args) } },
  });

  exports.trackPurchase({ planId: 'premium_monthly', provider: 'stripe' });
  exports.trackPurchase({ planId: 'premium_monthly', provider: 'stripe', analyticsTransactionId: '00000000-0000-4000-8000-000000000001' });
  exports.trackPurchase({ planId: 'premium_monthly', provider: 'paypal', analyticsTransactionId: '00000000-0000-4000-8000-000000000002' });
  exports.trackPurchase({ planId: 'premium_monthly', provider: 'stripe', analyticsTransactionId: 'cs_test_123' });
  exports.trackPurchase({ planId: 'premium_monthly', provider: 'unknown', analyticsTransactionId: '00000000-0000-4000-8000-000000000003' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(gaCalls.length, 2);
  assert.equal(gaCalls[0][1], 'purchase');
  assert.equal(gaCalls[0][2].transaction_id, 'stripe:00000000-0000-4000-8000-000000000001');
  assert.equal(gaCalls[1][2].transaction_id, 'paypal:00000000-0000-4000-8000-000000000002');
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
      window: { localStorage: { getItem: () => 'granted' }, location: { hostname: 'www.resumeats.cv', pathname: '/dashboard' }, gtag: (...args) => gaCalls.push(args) },
    },
  });

  exports.trackApplicationCreated({ status: 'saved' });
  exports.trackResumeExport('docx');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(gaCalls.map((call) => [call[1], { ...call[2] }]), [
    ['application_created', { status: 'saved' }],
    ['resume_exported', { format: 'docx' }],
  ]);
  assert.deepEqual(rpcCalls.map((call) => [call[1].p_event_name, { ...call[1].p_properties }]), [
    ['application_created', { status: 'saved' }],
    ['resume_exported', { format: 'docx' }],
  ]);
});
