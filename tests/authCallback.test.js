import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAuthCallbackOutcome } from '../src/utils/authCallback.js';

test('auth callback maps known provider failures to safe user guidance', () => {
  assert.deepEqual(
    getAuthCallbackOutcome({ errorDescription: 'The link is invalid or has expired' }),
    {
      message: 'Your verification link is invalid or has expired. Please request a new one.',
      showResendForm: true,
    },
  );
  assert.deepEqual(
    getAuthCallbackOutcome({ errorDescription: 'User not found in the provider response' }),
    {
      message: 'This email address is not associated with an account. Please sign up.',
      showResendForm: false,
    },
  );
});

test('auth callback does not echo arbitrary query-string errors', () => {
  const outcome = getAuthCallbackOutcome({
    error: 'provider_error<script>alert(1)</script>',
    errorDescription: `${'sensitive provider detail '.repeat(100)} https://attacker.example/?token=secret`,
  });

  assert.equal(outcome.showResendForm, true);
  assert.equal(outcome.message.includes('attacker.example'), false);
  assert.equal(outcome.message.includes('secret'), false);
  assert.equal(outcome.message.includes('<script>'), false);
});
