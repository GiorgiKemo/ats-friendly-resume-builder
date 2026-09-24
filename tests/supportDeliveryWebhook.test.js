import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'supabase';
const outboxId = '30000000-0000-4000-8000-000000000003';

test('support delivery webhook rejects unauthorized requests before creating a client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/support-delivery-webhook/index.ts', {
    env: { SUPABASE_URL: 'https://test.invalid', SB_SECRET_KEY: 'service-role-test-key', BREVO_WEBHOOK_SECRET: 'webhook-secret' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    body: JSON.stringify({ event: 'delivered' }),
  }));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('support delivery webhook maps allowlisted status events and deduplicates provider retries', async () => {
  const calls = [];
  let eventCall = 0;
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name !== 'support_record_email_delivery_event') throw new Error(`Unexpected RPC ${name}`);
      eventCall += 1;
      return { data: { matched: true, recorded: eventCall === 1 }, error: null };
    },
  };
  const { handler } = loadEdgeFunction('supabase/functions/support-delivery-webhook/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      BREVO_WEBHOOK_SECRET: 'webhook-secret',
    },
    imports: { [publicKeyImport]: { createClient: () => client } },
  });

  const payload = {
    event: 'hard_bounce',
    id: 42,
    'message-id': 'provider-message-1',
    'X-Mailin-custom': outboxId,
    ts_event: 1728390422,
    email: 'private-customer@example.test',
    subject: 'private support subject',
    reason: 'private provider diagnostic',
  };
  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { Authorization: 'Bearer webhook-secret', 'content-type': 'application/json' },
    body: JSON.stringify([payload, payload, { ...payload, event: 'opened' }]),
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(result, { ok: true, recorded: 1, duplicates: 1, unmatched: 0, ignored: 1 });
  assert.deepEqual(calls.map(([name]) => name), ['support_record_email_delivery_event', 'support_record_email_delivery_event']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {
    p_outbox_id: outboxId,
    p_provider_message_id: 'provider-message-1',
    p_event_type: 'hard_bounce',
    p_occurred_at: '2024-10-08T12:27:02.000Z',
  });
  assert.doesNotMatch(JSON.stringify(calls), /private-customer|private support subject|private provider diagnostic/);
});

test('support delivery webhook returns retryable failure when the durable mapping is unavailable', async () => {
  const { handler } = loadEdgeFunction('supabase/functions/support-delivery-webhook/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      BREVO_WEBHOOK_SECRET: 'webhook-secret',
    },
    imports: { [publicKeyImport]: { createClient: () => ({
      rpc: async () => ({ data: null, error: new Error('private database diagnostic') }),
    }) } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { Authorization: 'Bearer webhook-secret', 'content-type': 'application/json' },
    body: JSON.stringify({
      event: 'delivered',
      'message-id': 'provider-message-1',
      'X-Mailin-custom': outboxId,
      ts_event: 1728390422,
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, { error: 'Support delivery event could not be recorded' });
  assert.doesNotMatch(JSON.stringify(body), /private database diagnostic/);
});
