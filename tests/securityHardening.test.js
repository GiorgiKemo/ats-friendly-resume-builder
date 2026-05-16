import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Gmail OAuth state is signed and callback does not trust raw base64 JSON', () => {
  const auth = read('supabase/functions/gmail-auth/index.ts');
  const callback = read('supabase/functions/gmail-callback/index.ts');

  assert.match(auth, /createSignedOAuthState/);
  assert.doesNotMatch(auth, /const state\s*=\s*btoa/);
  assert.match(callback, /verifySignedOAuthState/);
  assert.doesNotMatch(callback, /atob\(stateParam\)/);
  assert.doesNotMatch(callback, /JSON\.stringify\(tokens\)/);
});

test('Brevo webhook handlers require bearer-secret authorization', () => {
  const emailWebhook = read('supabase/functions/email-webhook/index.ts');
  const inboundReply = read('supabase/functions/inbound-reply/index.ts');

  assert.match(emailWebhook, /BREVO_WEBHOOK_SECRET/);
  assert.match(emailWebhook, /verifyBearerSecret\(req,\s*BREVO_WEBHOOK_SECRET\)/);
  assert.match(inboundReply, /INBOUND_WEBHOOK_SECRET/);
  assert.match(inboundReply, /verifyBearerSecret\(req,\s*INBOUND_WEBHOOK_SECRET\)/);
  assert.doesNotMatch(inboundReply, /searchParams\.get\('secret'\)/);
});

test('Brevo contact proxy requires an authenticated matching user email', () => {
  const contact = read('supabase/functions/add-brevo-contact/index.ts');

  assert.match(contact, /getAuthenticatedUser/);
  assert.match(contact, /Unauthorized/);
  assert.match(contact, /Email does not match authenticated user/);
});

test('client error reports are rate limited and cannot spoof unauthenticated email', () => {
  const reporter = read('supabase/functions/report-client-error/index.ts');
  const migration = read('supabase/migrations/20260516175520_harden_client_error_reporting.sql');

  assert.match(reporter, /ERROR_REPORT_SCOPE = 'reportClientError'/);
  assert.match(reporter, /enforceRateLimit\(req,\s*user\)/);
  assert.match(reporter, /user_email:\s*user\?\.email \|\| ''/);
  assert.doesNotMatch(reporter, /body\.userEmail/);
  assert.match(migration, /'reportClientError'/);
});

test('CSP connect-src is pinned to the production Supabase project', () => {
  const vercel = read('vercel.json');
  const headers = read('public/_headers');
  const serviceWorker = read('public/service-worker.js');

  assert.doesNotMatch(vercel, /https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(headers, /https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(serviceWorker, /https:\/\/\*\.supabase\.co/);
  assert.match(vercel, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
  assert.match(headers, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
  assert.match(serviceWorker, /https:\/\/onuxzcectniowxqtmjpg\.supabase\.co/);
});
