import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'supabase';

const makeQuery = (result) => {
  const query = {
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    maybeSingle: () => Promise.resolve(result),
  };
  for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query;
  return query;
};

test('support AI worker rejects unauthorized requests before creating a client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/support-ai-worker/index.ts', {
    env: { SUPPORT_AI_WORKER_SECRET: 'worker-secret', SUPPORT_AI_ENABLED: 'true' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-support-ai-worker-secret': 'wrong-secret' },
    body: JSON.stringify({ limit: 3 }),
  }));

  assert.equal(response.status, 401);
  assert.equal(created, false);
});

test('support AI worker remains explicitly disabled without creating a service client', async () => {
  let created = false;
  const { handler } = loadEdgeFunction('supabase/functions/support-ai-worker/index.ts', {
    env: { SUPPORT_AI_WORKER_SECRET: 'worker-secret', SUPPORT_AI_ENABLED: 'false' },
    imports: { [publicKeyImport]: { createClient: () => { created = true; throw new Error('must not create client'); } } },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-support-ai-worker-secret': 'worker-secret' },
    body: JSON.stringify({ limit: 3 }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, enabled: false, claimed: 0, completed: 0, failed: 0 });
  assert.equal(created, false);
});

test('support AI worker sends bounded context and commits only structured provider output', async () => {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push(['rpc', name, payload]);
      if (name === 'support_ai_claim_runs') {
        return {
          data: [{
            run_id: '30000000-0000-4000-8000-000000000003',
            conversation_id: '40000000-0000-4000-8000-000000000004',
            trigger_message_id: '50000000-0000-4000-8000-000000000005',
            expected_ai_epoch: 0,
            expected_revision: 1,
            trigger_sequence: 1,
            attempt: 1,
          }],
          error: null,
        };
      }
      if (name === 'support_list_published_knowledge') {
        return {
          data: [{ slug: 'billing-basics', versionId: 'version-1', title: 'Billing basics', body: 'Use the billing page to manage a subscription.', sourceRef: 'pricing.md' }],
          error: null,
        };
      }
      if (name === 'support_ai_complete_run') return { data: { committed: true }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
      if (table === 'support_conversations') {
        return makeQuery({ data: { id: '40000000-0000-4000-8000-000000000004', customer_user_id: '10000000-0000-4000-8000-000000000001', mode: 'ai', status: 'open', last_sequence: 1 }, error: null });
      }
      if (table === 'support_messages') {
        return makeQuery({ data: [{ sequence_no: 1, sender_type: 'customer', body: 'How do I manage billing?', created_at: '2026-09-09T00:00:00Z' }], error: null });
      }
      if (table === 'users') {
        return makeQuery({ data: { is_premium: true, premium_plan: 'monthly', premium_until: null, ai_generations_used: 1, ai_generations_limit: 30 }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  let providerRequest;
  const { handler } = loadEdgeFunction('supabase/functions/support-ai-worker/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      SUPPORT_AI_WORKER_SECRET: 'worker-secret',
      SUPPORT_AI_ENABLED: 'true',
      SUPPORT_AI_PROVIDER_URL: 'https://provider.invalid/chat',
      SUPPORT_AI_PROVIDER_TOKEN: 'provider-token',
      SUPPORT_AI_PROVIDER_NAME: 'test-provider',
      SUPPORT_AI_MODEL: 'test-model',
    },
    imports: { [publicKeyImport]: { createClient: () => client } },
    fetch: async (url, options) => {
      providerRequest = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ answer: 'Use the billing page to manage your subscription.', citations: ['billing-basics'], escalationRequested: false, escalationReason: null }) } }],
        usage: { prompt_tokens: 90, completion_tokens: 18 },
      }), { status: 200 });
    },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { 'x-support-ai-worker-secret': 'worker-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, enabled: true, claimed: 1, completed: 1, failed: 0 });
  assert.equal(providerRequest.url, 'https://provider.invalid/chat');
  assert.equal(providerRequest.options.headers.authorization, 'Bearer provider-token');
  assert.equal(providerRequest.body.response_format.type, 'json_object');
  assert.match(JSON.stringify(providerRequest.body), /billing-basics/);
  const completion = calls.find((call) => call[1] === 'support_ai_complete_run');
  assert.equal(completion[2].p_run_id, '30000000-0000-4000-8000-000000000003');
  assert.equal(JSON.stringify(completion[2].p_citations), JSON.stringify(['billing-basics']));
  assert.equal(completion[2].p_input_tokens, 90);
  assert.equal(completion[2].p_output_tokens, 18);
});
