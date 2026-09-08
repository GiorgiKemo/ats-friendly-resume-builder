import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLocalCheckoutEnvironment, shouldBlockTestCheckout } from '../src/utils/stripeCheckoutGuard.js';

test('local development can use test checkout configuration', () => {
  assert.equal(isLocalCheckoutEnvironment({ hostname: 'localhost', isDev: false }), true);
  assert.equal(shouldBlockTestCheckout({ hostname: 'localhost', isDev: true, billingMode: 'test' }), false);
});

test('non-local test checkout is blocked until live billing is configured', () => {
  assert.equal(shouldBlockTestCheckout({ hostname: 'www.resumeats.cv', isDev: false, billingMode: 'test' }), true);
  assert.equal(shouldBlockTestCheckout({ hostname: 'preview.resumeats.cv', isDev: false, billingMode: 'test' }), true);
});

test('non-local live checkout remains available', () => {
  assert.equal(shouldBlockTestCheckout({ hostname: 'www.resumeats.cv', isDev: false, billingMode: 'live' }), false);
});
