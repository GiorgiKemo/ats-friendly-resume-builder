import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'https://esm.sh/@supabase/supabase-js@2';
test('AI preflight permits the request metadata sent by the website on both production origins', () => {
  const { exports } = loadEdgeFunction('supabase/functions/_shared/cors.ts', {
    imports: { [publicKeyImport]: { createClient: () => ({}) } },
  });
  for (const origin of ['https://resumeats.cv', 'https://www.resumeats.cv']) {
    const headers = exports.getCorsHeaders(origin);
    assert.equal(headers['Access-Control-Allow-Origin'], origin);
    const allowed = headers['Access-Control-Allow-Headers'].split(',').map((value) => value.trim());
    for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info', 'x-request-type', 'x-request-timeout']) {
      assert.ok(allowed.includes(header), `${origin} must permit ${header}`);
    }
  }
  assert.equal(exports.isOriginAllowed('https://untrusted.example'), false);
});

test('JWT authentication asks Supabase to verify the bearer token and never trusts decoded claims', async () => {
  const calls = [];
  const { exports } = loadEdgeFunction('supabase/functions/_shared/cors.ts', {
    env: { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'public-test-key' },
    imports: { [publicKeyImport]: { createClient: () => ({ auth: { getUser: async (token) => {
      calls.push(token);
      return token === 'verified-token' ? { data: { user: { id: 'verified-user' } }, error: null } : { data: { user: null }, error: { message: 'Invalid JWT' } };
    } } }) } },
  });
  assert.equal(await exports.authenticateUser(new Request('https://test.invalid')), null);
  assert.equal(await exports.authenticateUser(new Request('https://test.invalid', { headers: { Authorization: 'Bearer forged-token' } })), null);
  const verified = await exports.authenticateUser(new Request('https://test.invalid', { headers: { Authorization: 'Bearer verified-token' } }));
  assert.equal(verified.userId, 'verified-user');
  assert.deepEqual(calls, ['forged-token', 'verified-token']);
});

test('webhook debug logging stays off when NODE_ENV is absent', async () => {
  const messages = [];
  const { handler } = loadEdgeFunction('supabase/functions/inbound-reply/index.ts', {
    env: { INBOUND_WEBHOOK_SECRET: 'webhook-secret' },
    imports: { [publicKeyImport]: { createClient: () => { throw new Error('Unauthorized request must not query data'); } } },
    globals: { console: { log: (...args) => messages.push(args), error: (...args) => messages.push(args) } },
  });
  assert.equal((await handler(new Request('https://test.invalid', { method: 'POST', body: '{}' }))).status, 401);
  assert.deepEqual(messages, []);
});

test('inbound email bodies are never debug logged, including explicit development mode', async () => {
  const messages = [];
  const { handler } = loadEdgeFunction('supabase/functions/inbound-reply/index.ts', {
    env: { INBOUND_WEBHOOK_SECRET: 'webhook-secret', NODE_ENV: 'development' },
    imports: { [publicKeyImport]: { createClient: () => { throw new Error('Unmatched email must not query data'); } } },
    globals: { console: { log: (...args) => messages.push(args), error: (...args) => messages.push(args) } },
  });
  const response = await handler(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer webhook-secret' }, body: JSON.stringify({ body: 'sensitive-email-content' }) }));
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(messages).includes('sensitive-email-content'), false);
});

test('public engagement rejects oversized or malformed bodies before privileged writes', async () => {
  const calls = [];
  const { handler } = loadEdgeFunction('supabase/functions/public-engagement/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      CORS_ORIGIN_PROD: 'https://resumeats.cv',
    },
    imports: {
      supabase: { createClient: () => ({
        from: () => {
          calls.push('from');
          return {};
        },
      }) },
      [publicKeyImport]: { createClient: () => ({}) },
    },
  });

  const oversized = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { Origin: 'https://resumeats.cv', 'Content-Length': String(40 * 1024) },
    body: JSON.stringify({ action: 'subscribeNewsletter', payload: { email: 'a@b.test' } }),
  }));
  assert.equal(oversized.status, 413);
  assert.equal(calls.length, 0);

  const malformed = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { Origin: 'https://resumeats.cv' },
    body: '{not-json',
  }));
  assert.equal(malformed.status, 400);
  assert.equal(calls.length, 0);

  for (const body of ['null', '[]']) {
    const invalidShape = await handler(new Request('https://test.invalid', {
      method: 'POST',
      headers: { Origin: 'https://resumeats.cv' },
      body,
    }));
    assert.equal(invalidShape.status, 400, body);
  }
  assert.equal(calls.length, 0);
});

test('public engagement claims one atomic limiter reservation before writing and finalizes it', async () => {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push([name, payload]);
      if (name === 'claim_public_engagement_attempt') {
        return { data: [{ allowed: true, attempt_id: 'attempt-1', reason: 'allowed' }], error: null };
      }
      if (name === 'finalize_public_engagement_attempt') return { data: true, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => ({
      insert: (payload) => {
        calls.push(['insert', table, payload]);
        return {
          select: () => ({ single: async () => ({ data: { id: 'inquiry-1' }, error: null }) }),
        };
      },
    }),
  };
  const { handler } = loadEdgeFunction('supabase/functions/public-engagement/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_SECRET_KEY: 'service-role-test-key',
      CORS_ORIGIN_PROD: 'https://resumeats.cv',
    },
    imports: {
      supabase: { createClient: () => client },
      [publicKeyImport]: { createClient: () => ({}) },
    },
  });

  const response = await handler(new Request('https://test.invalid', {
    method: 'POST',
    headers: { Origin: 'https://resumeats.cv', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'submitContactInquiry',
      payload: { name: 'Test User', email: 'test@example.com', subject: 'Hello', message: 'Message' },
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], 'claim_public_engagement_attempt');
  assert.equal(calls.at(-1)[0], 'finalize_public_engagement_attempt');
  assert.equal(calls.at(-1)[1].p_attempt_id, 'attempt-1');
  assert.equal(calls.some(([kind, table]) => kind === 'insert' && table === 'public_engagement_attempts'), false);
});

test('AI-extracted recipients must be exact email tokens already present in the source posting', async () => {
  let aiResponse = 'invented@example.com';
  const { exports } = loadEdgeFunction('supabase/functions/auto-apply-run/index.ts', {
    env: { GROQ_API_KEY: 'test-key' },
    imports: { [publicKeyImport]: { createClient: () => ({}) }, jspdf: {}, '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model' } },
    expose: ['aiExtractEmail'],
    fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: aiResponse } }] })),
  });
  assert.equal(await exports.aiExtractEmail('Apply using the company website.'), null);
  assert.equal(await exports.aiExtractEmail('Email not-invented@example.com for applications.'), null);
  assert.equal(await exports.aiExtractEmail('Email invented@example.com.attacker.org for applications.'), null);
  aiResponse = 'HR+Jobs@Example.com';
  assert.equal(await exports.aiExtractEmail('Applications: hr+jobs@example.com'), 'hr+jobs@example.com');
  aiResponse = 'Send your resume to hr+jobs@example.com';
  assert.equal(await exports.aiExtractEmail('Applications: hr+jobs@example.com'), null);
});

test('Gmail callback database errors cannot copy token-bearing row details into logs', async () => {
  const messages = [];
  const { handler } = loadEdgeFunction('supabase/functions/gmail-callback/index.ts', {
    imports: {
      [publicKeyImport]: { createClient: () => ({ from: () => ({ upsert: async () => ({ error: { code: '23505', details: 'access-secret refresh-secret' } }) }) }) },
      '../_shared/oauthState.ts': { verifySignedOAuthState: async () => ({ userId: 'user-1', origin: 'https://resumeats.cv' }) },
    },
    fetch: async (url) => new Response(JSON.stringify(String(url).includes('/token') ? { access_token: 'access-secret', refresh_token: 'refresh-secret' } : { email: 'owner@example.com' })),
    globals: { console: { error: (...args) => messages.push(args) } },
  });
  const response = await handler(new Request('https://edge.test/gmail-callback?code=test-code&state=test-state'));
  assert.match(response.headers.get('location'), /reason=db_error/);
  assert.equal(JSON.stringify(messages).includes('secret'), false);
  assert.equal(JSON.stringify(messages).includes('23505'), true);
});
