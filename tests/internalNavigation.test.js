import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSafeInternalPath } from '../src/utils/internalNavigation.js';

test('internal navigation keeps same-origin paths and their query/hash state', () => {
  assert.equal(getSafeInternalPath('/dashboard?tab=activity#recent', '/pricing'), '/dashboard?tab=activity#recent');
  assert.equal(getSafeInternalPath('dashboard?tab=activity', '/pricing'), '/dashboard?tab=activity');
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
