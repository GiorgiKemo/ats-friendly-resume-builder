import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedQaRequest, localFixtureEnvironment, requireLiveQaOptIn } from './playwright/qa-safety.mjs';

test('live QA refuses to run without affirmative opt-in and explicit staging targets', () => {
  assert.throws(() => requireLiveQaOptIn({}), /disabled/);
  assert.throws(() => requireLiveQaOptIn({ QA_ALLOW_LIVE_MUTATIONS: '1' }), /explicit/);
  assert.throws(() => requireLiveQaOptIn({ QA_ALLOW_LIVE_MUTATIONS: 'true' }), /disabled/);
});

test('live QA never accepts known production targets even after opt-in', () => {
  const env = { QA_ALLOW_LIVE_MUTATIONS: '1', QA_BASE_URL: 'http://127.0.0.1:5174', QA_SUPABASE_URL: 'https://staging.example.com' };
  for (const QA_BASE_URL of ['https://resumeats.cv', 'https://www.resumeats.cv', 'https://app.resumeats.cv']) {
    assert.throws(() => requireLiveQaOptIn({ ...env, QA_BASE_URL }), /production/);
  }
  assert.throws(() => requireLiveQaOptIn({ ...env, QA_SUPABASE_URL: 'https://onuxzcectniowxqtmjpg.supabase.co' }), /production/);
  assert.throws(() => requireLiveQaOptIn({ ...env, QA_BASE_URL: 'http://remote.example.com' }), /HTTPS/);
  assert.equal(requireLiveQaOptIn(env).appOrigin, 'http://127.0.0.1:5174');
});

test('QA network isolation allows only exact origins and local browser URLs', () => {
  const allowed = ['http://127.0.0.1:5174', 'http://127.0.0.1:54329'];
  assert.equal(isAllowedQaRequest('http://127.0.0.1:54329/auth/v1/token', allowed), true);
  assert.equal(isAllowedQaRequest('blob:http://127.0.0.1:5174/123', allowed), true);
  for (const value of ['https://resumeats.cv', 'https://checkout.stripe.com', 'http://127.0.0.1.attacker.test:54329', 'http://127.0.0.1:54330', 'invalid']) {
    assert.equal(isAllowedQaRequest(value, allowed), false);
  }
});

test('fixture environment overrides every Supabase dev and production credential variant', () => {
  const env = localFixtureEnvironment({ VITE_SUPABASE_URL_DEV: 'https://real.example.com', VITE_SUPABASE_PUBLISHABLE_KEY_DEV: 'real-key' }, 'http://127.0.0.1:54329');
  assert.equal(env.VITE_SUPABASE_URL_DEV, 'http://127.0.0.1:54329');
  assert.equal(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_URL_DEV);
  assert.equal(env.VITE_SUPABASE_PUBLISHABLE_KEY_DEV, 'qa-local-anon-key');
  assert.equal(env.VITE_SUPABASE_ANON_KEY_DEV, 'qa-local-anon-key');
  assert.throws(() => localFixtureEnvironment({}, 'https://real.example.com'), /loopback/);
});
