import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyConciergeForm, getConciergePrefill, getPrivacyDeletionPrefill } from '../src/utils/conciergeOffer.js';

test('concierge offer prefill is only enabled by the explicit offer query', () => {
  assert.equal(getConciergePrefill(''), null);
  assert.equal(getConciergePrefill('?offer=premium'), null);
  const prefill = getConciergePrefill('?offer=concierge');
  assert.equal(prefill.subject, 'ResumeATS $99 concierge slot request');
  assert.match(prefill.message, /resume plus one target-job tailoring slot/);
});

test('empty concierge form returns a fresh editable object', () => {
  const first = emptyConciergeForm();
  first.subject = 'changed';
  assert.deepEqual(emptyConciergeForm(), { subject: '', message: '' });
});

test('privacy deletion requests have an explicit reviewed support prefill', () => {
  assert.equal(getPrivacyDeletionPrefill(''), null);
  assert.equal(getPrivacyDeletionPrefill('?request=other'), null);
  const prefill = getPrivacyDeletionPrefill('?request=privacy-deletion');
  assert.equal(prefill.subject, 'Account and associated-data deletion request');
  assert.match(prefill.message, /does not delete an account immediately|reviewed deletion process/i);
});
