import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSafeInternalPath } from '../src/utils/internalNavigation.js';

test('internal navigation keeps same-origin paths and their query/hash state', () => {
  assert.equal(getSafeInternalPath('/dashboard?tab=activity#recent', '/pricing'), '/dashboard?tab=activity#recent');
  assert.equal(getSafeInternalPath('dashboard?tab=activity', '/pricing'), '/dashboard?tab=activity');
});

test('internal navigation strips auth and recovery parameters from URL and hash-router state', () => {
  assert.equal(
    getSafeInternalPath('/update-password?access_token=secret&plan=premium_yearly#done', '/pricing'),
    '/update-password?plan=premium_yearly#done',
  );
  assert.equal(
    getSafeInternalPath('#/update-password?refresh_token=secret&next=dashboard', '/pricing'),
    '/#/update-password?next=dashboard',
  );
  assert.equal(getSafeInternalPath('/#access_token=secret&refresh_token=secret', '/pricing'), '/');
});

test('internal navigation rejects external and protocol-relative destinations', () => {
  for (const value of ['https://attacker.example', '//attacker.example/path', '\\\\attacker.example', 'javascript:alert(1)']) {
    assert.equal(getSafeInternalPath(value, '/dashboard'), '/dashboard');
  }
});

test('internal navigation falls back for malformed or empty values', () => {
  assert.equal(getSafeInternalPath('', '/pricing'), '/pricing');
  assert.equal(getSafeInternalPath(null, '/pricing'), '/pricing');
});
