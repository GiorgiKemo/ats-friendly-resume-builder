import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const { exports: { findReplyJob, decodeBase64Url, buildGmailSearchQuery } } = loadEdgeFunction('supabase/functions/gmail-scan/index.ts', {
  imports: {
    'https://esm.sh/@supabase/supabase-js@2': { createClient: () => ({}) },
    '../_shared/cors.ts': {},
    '../_shared/aiAccess.ts': {},
  },
  expose: ['findReplyJob', 'decodeBase64Url', 'buildGmailSearchQuery'],
});
const job = { id: 'job-1', company: 'Employer', contact_email: 'hiring@example.com', gmail_thread_id: 'thread-1', gmail_message_id: 'sent-1' };
const message = { id: 'reply-1', threadId: 'thread-1', payload: { headers: [{ name: 'From', value: 'Recruiter <hiring@example.com>' }] } };

test('a new reply in the outbound Gmail thread is matched, not skipped', () => {
  assert.equal(findReplyJob([job], message)?.id, job.id);
});

test('Gmail reply matching skips an already processed message ID', () => {
  assert.equal(findReplyJob([{ ...job, gmail_message_id: message.id }], message), undefined);
});

test('Gmail sender matching cannot be spoofed by a display name containing the expected email', () => {
  const spoofed = { ...message, payload: { headers: [{ name: 'From', value: 'hiring@example.com <attacker@example.com>' }] } };
  assert.equal(findReplyJob([job], spoofed), undefined);
});

test('thread identity disambiguates multiple applications to the same recruiter', () => {
  const otherJob = { ...job, id: 'job-2', gmail_thread_id: 'thread-2' };
  assert.equal(findReplyJob([otherJob, job], message)?.id, job.id);
  assert.equal(findReplyJob([job], { ...message, threadId: 'unrelated-thread' }), undefined);
});

test('threadless email applications match only when there is one unambiguous candidate', () => {
  const withoutThread = { ...job, gmail_thread_id: null };
  assert.equal(findReplyJob([withoutThread], message)?.id, job.id);
  assert.equal(findReplyJob([withoutThread, { ...withoutThread, id: 'job-2' }], message), undefined);
});

test('Gmail message decoding preserves multilingual UTF-8 text', () => {
  const original = 'Interview — გამარჯობა • München';
  assert.equal(decodeBase64Url(Buffer.from(original).toString('base64url')), original);
});

test('Gmail message decoding bounds oversized bodies before classification', () => {
  const oversized = 'x'.repeat(25_000);
  assert.equal(decodeBase64Url(Buffer.from(oversized).toString('base64url')).length, 20_000);
});

test('Gmail search syntax ignores malformed external contact values', () => {
  const query = buildGmailSearchQuery([
    'hiring@example.com OR from:attacker@example.com',
    'hr@example.com',
  ]);
  assert.equal(query, 'from:hr@example.com newer_than:7d');
});

function loadScanner({ claim = { allowed: true, scan_id: 'scan-1', reason: 'allowed' } } = {}) {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'claim_gmail_scan') return { data: [claim], error: null };
      if (name === 'release_gmail_scan') return { data: true, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
      calls.push(['from', table]);
      return queryResult({ data: [], error: null }, calls);
    },
  };
  const loaded = loadEdgeFunction('supabase/functions/gmail-scan/index.ts', {
    env: { SUPABASE_URL: 'https://test.invalid', SB_SECRET_KEY: 'server-key', NODE_ENV: 'production' },
    imports: {
      'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
      '../_shared/cors.ts': { getCorsHeaders: () => ({}), isOriginAllowed: () => true, authenticateUser: async () => ({ userId: 'user-1' }) },
      '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model' },
    },
  });
  return { ...loaded, calls };
}

test('Gmail scan claims and releases a durable user lease even with no active connections', async () => {
  const { handler, calls } = loadScanner();
  const response = await handler(new Request('https://test.invalid', { method: 'POST' }));
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], 'claim_gmail_scan');
  assert.equal(calls[0][1].p_user_id, 'user-1');
  assert.equal(calls.at(-1)[0], 'release_gmail_scan');
  assert.equal(calls.at(-1)[1].p_scan_id, 'scan-1');
});

test('Gmail scan rejects overlapping or budget-denied claims before reading mailbox data', async () => {
  for (const reason of ['already_running', 'daily_scan_limit', 'daily_message_limit', 'daily_ai_limit']) {
    const { handler, calls } = loadScanner({ claim: { allowed: false, reason } });
    const response = await handler(new Request('https://test.invalid', { method: 'POST' }));
    assert.equal(response.status, reason === 'already_running' ? 409 : 429);
    assert.equal(calls.some(([name]) => name === 'from'), false);
    assert.equal(calls.some(([name]) => name === 'release_gmail_scan'), false);
  }
});
