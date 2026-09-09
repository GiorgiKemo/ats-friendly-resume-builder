import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('analytics consent defaults to unknown and persists only explicit choices', () => {
  const storage = makeStorage();
  const { exports } = loadEdgeFunction('src/services/analyticsConsent.js', {
    globals: { window: { localStorage: storage, dispatchEvent() {} } },
  });

  assert.equal(exports.getAnalyticsConsent(), 'unknown');
  assert.equal(exports.setAnalyticsConsent('granted'), 'granted');
  assert.equal(exports.getAnalyticsConsent(), 'granted');
  assert.equal(exports.setAnalyticsConsent('invalid'), 'unknown');
  assert.equal(exports.getAnalyticsConsent(), 'unknown');
  assert.equal(exports.setAnalyticsConsent('denied'), 'denied');
  assert.equal(exports.clearAnalyticsConsent(), 'unknown');
  assert.equal(exports.getAnalyticsConsent(), 'unknown');
});

test('Google Analytics dispatch fails closed until consent is granted', () => {
  const storage = makeStorage();
  const calls = [];
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': { supabase: { rpc: async () => ({ data: null, error: null }) } },
    },
    globals: { window: { localStorage: storage, gtag: (...args) => calls.push(args) } },
  });

  assert.equal(exports.trackGoogleAnalyticsEvent('page_view'), false);
  storage.setItem('resumeats.analytics-consent', 'granted');
  assert.equal(exports.trackGoogleAnalyticsEvent('page_view'), true);
  assert.equal(calls.length, 1);
});
