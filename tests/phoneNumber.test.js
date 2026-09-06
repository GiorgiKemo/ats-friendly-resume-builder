import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPhoneNumber, splitPhoneNumber } from '../src/utils/phoneNumber.js';

test('shared calling codes preserve the selected country', () => {
  assert.equal(splitPhoneNumber('+1 202 555 0142').country.code, 'US');
  assert.equal(splitPhoneNumber('+1 416 555 0142', 'CA').country.code, 'CA');
});

test('longest calling code wins instead of swallowing area codes', () => {
  const result = splitPhoneNumber('+1242 555 0142');
  assert.equal(result.country.code, 'BS');
  assert.equal(result.number, '555 0142');
  assert.equal(splitPhoneNumber('+995 555 123456').country.code, 'GE');
});

test('empty phone remains empty and pasted international numbers are not double-prefixed', () => {
  assert.equal(joinPhoneNumber('+1', ''), '');
  assert.equal(joinPhoneNumber('+1', '   '), '');
  assert.equal(joinPhoneNumber('+1', '+995 555 123456'), '+995 555 123456');
  assert.equal(joinPhoneNumber('+995', '555 123456'), '+995 555 123456');
});
