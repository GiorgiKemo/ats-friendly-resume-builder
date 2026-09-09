import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const loadService = (invoke) => loadEdgeFunction('src/services/publicEngagementService.js', {
  imports: {
    './supabase': { supabase: { functions: { invoke } } },
  },
}).exports;

test('newsletter service normalizes the email and requires an affirmative server response', async () => {
  const calls = [];
  const service = loadService(async (...args) => {
    calls.push(args);
    return { data: { ok: true, email: 'person@example.com', alreadySubscribed: true }, error: null };
  });

  const result = await service.subscribeToNewsletter('  Person@Example.com  ', 'footer');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { email: 'person@example.com', alreadySubscribed: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['public-engagement', {
    body: { action: 'subscribeNewsletter', payload: { email: 'person@example.com', source: 'footer' } },
  }]);

  const incomplete = loadService(async () => ({ data: undefined, error: null }));
  await assert.rejects(incomplete.subscribeToNewsletter('person@example.com'), /Request failed/);
});

test('contact service trims fields, preserves the source lane, and rejects incomplete drafts locally', async () => {
  const calls = [];
  const service = loadService(async (...args) => {
    calls.push(args);
    return { data: { ok: true, id: 'inquiry-1' }, error: null };
  });

  const result = await service.submitContactInquiry({
    name: '  Test User ',
    email: ' TEST@Example.com ',
    subject: '  Help  ',
    message: '  I need help.  ',
    source: 'concierge_offer',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, id: 'inquiry-1' });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['public-engagement', {
    body: {
      action: 'submitContactInquiry',
      payload: {
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Help',
        message: 'I need help.',
        source: 'concierge_offer',
      },
    },
  }]);

  await assert.rejects(
    service.submitContactInquiry({ name: 'Test User', email: 'test@example.com', subject: '', message: 'Hello' }),
    /fill out all required fields/,
  );
});
