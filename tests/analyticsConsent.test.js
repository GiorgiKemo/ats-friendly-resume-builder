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

test('Google Analytics dispatch fails closed without consent or on a non-customer production route', () => {
  const storage = makeStorage();
  const calls = [];
  const location = { hostname: 'www.resumeats.cv', pathname: '/' };
  const { exports } = loadEdgeFunction('src/services/analyticsService.js', {
    imports: {
      './supabase.js': { supabase: { rpc: async () => ({ data: null, error: null }) } },
    },
    globals: { window: { localStorage: storage, location, gtag: (...args) => calls.push(args) } },
  });

  assert.equal(exports.trackGoogleAnalyticsEvent('page_view'), false);
  storage.setItem('resumeats.analytics-consent', 'granted');
  location.hostname = 'localhost';
  assert.equal(exports.trackGoogleAnalyticsEvent('page_view'), false);
  location.hostname = 'www.resumeats.cv';
  location.pathname = '/admin/users';
  assert.equal(exports.trackGoogleAnalyticsEvent('page_view'), false);
  location.pathname = '/';
  assert.equal(exports.trackGoogleAnalyticsEvent('page_view'), true);
  assert.equal(calls.length, 1);
});

test('analytics environment permits only production customer hosts and excludes admin routes', () => {
  const location = { hostname: 'resumeats.cv', pathname: '/' };
  const { exports } = loadEdgeFunction('src/services/analyticsConsent.js', {
    globals: { window: { location } },
  });

  assert.equal(exports.isAnalyticsEnvironmentAllowed(), true);
  location.hostname = 'www.resumeats.cv';
  assert.equal(exports.isAnalyticsEnvironmentAllowed(), true);
  location.hostname = 'localhost';
  assert.equal(exports.isAnalyticsEnvironmentAllowed(), false);
  location.hostname = 'resumeats-preview.vercel.app';
  assert.equal(exports.isAnalyticsEnvironmentAllowed(), false);
  location.hostname = 'resumeats.cv';
  location.pathname = '/admin/users';
  assert.equal(exports.isAnalyticsEnvironmentAllowed(), false);
});

test('AI requests forward analytics consent only on a consented production customer route', () => {
  const storage = makeStorage();
  const location = { hostname: 'www.resumeats.cv', pathname: '/builder' };
  const { exports } = loadEdgeFunction('src/services/analyticsConsent.js', {
    globals: { window: { localStorage: storage, location } },
  });

  assert.equal(JSON.stringify(exports.getAnalyticsRequestHeaders()), '{}');
  storage.setItem('resumeats.analytics-consent', 'granted');
  assert.equal(JSON.stringify(exports.getAnalyticsRequestHeaders()), '{"X-Analytics-Consent":"granted"}');
  location.hostname = 'localhost';
  assert.equal(JSON.stringify(exports.getAnalyticsRequestHeaders()), '{}');
  location.hostname = 'www.resumeats.cv';
  location.pathname = '/admin/analytics';
  assert.equal(JSON.stringify(exports.getAnalyticsRequestHeaders()), '{}');
  storage.setItem('resumeats.analytics-consent', 'denied');
  location.pathname = '/builder';
  assert.equal(JSON.stringify(exports.getAnalyticsRequestHeaders()), '{}');
});
