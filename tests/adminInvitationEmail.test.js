import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'supabase';

test('admin invitation worker rejects unauthorized requests before creating a client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/admin-invitation-email/index.ts', {
    env: { ADMIN_INVITATION_EMAIL_SECRET: 'worker-secret' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-admin-invitation-email-secret': 'wrong-secret' },
    body: JSON.stringify({ limit: 25 }),
  }));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('admin invitation worker sends an idempotent, escaped email and completes the lease', async () => {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'admin_claim_invitation_email_outbox') {
        return {
          data: [{
            outboxId: '30000000-0000-4000-8000-000000000003',
            memberId: '40000000-0000-4000-8000-000000000004',
            recipientEmail: 'admin@example.test',
            role: 'admin',
            invitationExpiresAt: '2099-01-01T00:00:00.000Z',
            attempt: 1,
          }],
          error: null,
        };
      }
      if (name === 'admin_complete_invitation_email_outbox') return { data: { status: 'sent' }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  let request;
  const { handler } = loadEdgeFunction('supabase/functions/admin-invitation-email/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      ADMIN_INVITATION_EMAIL_SECRET: 'worker-secret',
      BREVO_API_KEY: 'brevo-test-key',
      ADMIN_APP_URL: 'https://www.resumeats.cv',
      ADMIN_EMAIL_FROM: 'admin@example.test',
      ADMIN_EMAIL_FROM_NAME: 'ResumeATS Admin',
    },
    imports: { [publicKeyImport]: { createClient: () => client } },
    fetch: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ messageId: 'provider-message-1' }), { status: 201 });
    },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-admin-invitation-email-secret': 'worker-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, claimed: 1, sent: 1, failed: 0 });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.headers['Idempotency-Key'], '30000000-0000-4000-8000-000000000003');
  assert.match(request.body.htmlContent, /ResumeATS sign in/);
  assert.match(request.body.htmlContent, /admin/);
  assert.doesNotMatch(request.body.htmlContent, /<script>/);
  assert.equal(calls.at(-1)[0], 'admin_complete_invitation_email_outbox');
  assert.equal(calls.at(-1)[1].p_provider_message_id, 'provider-message-1');
});
