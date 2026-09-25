import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const userId = '10000000-0000-4000-8000-000000000001';
const otherUserId = '10000000-0000-4000-8000-000000000002';
const sessionId = '20000000-0000-4000-8000-000000000001';

const tokenWithSession = (id) => {
  const payload = btoa(JSON.stringify({ session_id: id, aal: 'aal1' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
};

const loadSupportApi = ({ authenticated = true, preference = true } = {}) => {
  const calls = [];
  const serviceClient = {
    rpc: async (name, payload) => {
      if (name === 'admin_auth_session_is_active') return { data: true, error: null };
      calls.push([name, payload]);
      if (name === 'support_get_email_notification_preference') {
        return { data: { emailRepliesEnabled: preference }, error: null };
      }
      if (name === 'support_set_email_notification_preference') {
        return { data: { emailRepliesEnabled: payload.p_enabled }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const createClient = (_url, key) => key === 'publishable-test-key'
    ? { auth: { getUser: async () => authenticated
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: new Error('unauthorized') } } }
    : serviceClient;
  const loaded = loadEdgeFunction('supabase/functions/support-api/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_PUBLISHABLE_KEY: 'publishable-test-key',
      SB_SECRET_KEY: 'secret-test-key',
    },
    imports: {
      supabase: { createClient },
      'https://esm.sh/@supabase/supabase-js@2': { createClient },
    },
  });
  return { ...loaded, calls };
};

const request = (action, payload = {}, authenticated = true) => new Request('https://test.invalid', {
  method: 'POST',
  headers: {
    Origin: 'https://resumeats.cv',
    ...(authenticated ? { Authorization: `Bearer ${tokenWithSession(sessionId)}` } : {}),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action, ...payload }),
});

test('support email preference read is authenticated and defaults from the server-owned record', async () => {
  const app = loadSupportApi({ preference: false });
  const response = await app.handler(request('emailPreferenceGet'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { emailRepliesEnabled: false });
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [['support_get_email_notification_preference', { p_user_id: userId }]]);
});

test('support email preference update accepts only a boolean and binds ownership to the verified session', async () => {
  const app = loadSupportApi();
  const response = await app.handler(request('emailPreferenceSet', { enabled: false, userId: otherUserId }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { emailRepliesEnabled: false });
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls)), [['support_set_email_notification_preference', { p_user_id: userId, p_enabled: false }]]);

  const invalid = await app.handler(request('emailPreferenceSet', { enabled: 'false' }));
  assert.equal(invalid.status, 422);
  assert.equal(app.calls.length, 1);
});

test('support email preferences reject anonymous callers before any database RPC', async () => {
  const app = loadSupportApi({ authenticated: false });
  const response = await app.handler(request('emailPreferenceGet', {}, false));
  assert.equal(response.status, 401);
  assert.equal(app.calls.length, 0);
});
