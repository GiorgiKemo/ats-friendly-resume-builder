import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyConciergeForm, getConciergePrefill } from '../src/utils/conciergeOffer.js';

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
