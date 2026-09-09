import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'supabase';

test('support notification worker rejects unauthorized requests before creating a client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/support-notification-worker/index.ts', {
    env: { SUPPORT_NOTIFICATION_SECRET: 'worker-secret' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-support-notification-secret': 'wrong-secret' },
    body: JSON.stringify({ limit: 25 }),
  }));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('support notification worker escapes replies, sends through Brevo, and completes the lease', async () => {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'support_claim_email_outbox') {
        return {
          data: [{
            outboxId: '30000000-0000-4000-8000-000000000003',
            conversationId: '40000000-0000-4000-8000-000000000004',
            recipientEmail: 'user@example.test',
            subject: 'Question\nwith newline',
            body: '<script>alert(1)</script>\nThanks',
            attempt: 1,
          }],
          error: null,
        };
      }
      if (name === 'support_complete_email_outbox') return { data: { status: 'sent' }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  let request;
  const { handler } = loadEdgeFunction('supabase/functions/support-notification-worker/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      SUPPORT_NOTIFICATION_SECRET: 'worker-secret',
      BREVO_API_KEY: 'brevo-test-key',
      SUPPORT_EMAIL_FROM: 'support@example.test',
      SUPPORT_EMAIL_FROM_NAME: 'ResumeATS Support',
    },
    imports: { [publicKeyImport]: { createClient: () => client } },
    fetch: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ messageId: 'provider-message-1' }), { status: 201 });
    },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-support-notification-secret': 'worker-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, sent: 1, failed: 0 });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.headers['Idempotency-Key'], '30000000-0000-4000-8000-000000000003');
  assert.match(request.body.subject, /^ResumeATS support: Question with newline$/);
  assert.match(request.body.htmlContent, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(request.body.htmlContent, /<script>/);
  assert.equal(calls.at(-1)[0], 'support_complete_email_outbox');
  assert.equal(calls.at(-1)[1].p_provider_message_id, 'provider-message-1');
});
