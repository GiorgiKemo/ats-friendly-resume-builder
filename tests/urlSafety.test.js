import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeExternalUrl, isSafeExternalUrl } from '../src/utils/urlSafety.js';

test('external URL safety accepts normalized HTTP(S) links and rejects script/auth URLs', () => {
  assert.equal(getSafeExternalUrl('  HTTPS://Example.com/path  '), 'https://example.com/path');
  assert.equal(isSafeExternalUrl('https://example.com'), true);
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:user@example.com',
    'https://user:password@example.com/private',
    '//example.com/path',
    '',
    null,
    42,
  ]) {
    assert.equal(getSafeExternalUrl(value), '');
    assert.equal(isSafeExternalUrl(value), false);
  }
});
