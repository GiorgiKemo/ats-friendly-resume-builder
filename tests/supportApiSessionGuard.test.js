import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const attachmentId = '30000000-0000-4000-8000-000000000001';

const tokenWithSession = (id) => {
  const payload = btoa(JSON.stringify({ session_id: id }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
};

const loadSupportApi = ({ active = true, rpcError = null } = {}) => {
  const rpcCalls = [];
  const tableCalls = [];
  const attachment = {
    id: attachmentId,
    conversation_id: '40000000-0000-4000-8000-000000000001',
    uploader_user_id: userId,
    guest_session_id: null,
    storage_path: 'conversation/attachment',
    status: 'clean',
  };
  const serviceClient = {
    rpc: async (...args) => {
      rpcCalls.push(args);
      return { data: active, error: rpcError };
    },
    from: (table) => {
      tableCalls.push(table);
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: attachment, error: null }),
      };
      return query;
    },
  };
  const createClient = (_url, key) => key === 'publishable-test-key'
    ? { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } }
    : serviceClient;
  const { exports } = loadEdgeFunction('supabase/functions/support-api/index.ts', {
    env: {
      SUPABASE_URL: 'https://test.invalid',
      SB_PUBLISHABLE_KEY: 'publishable-test-key',
      SB_SECRET_KEY: 'secret-test-key',
    },
    imports: {
      supabase: { createClient },
      'https://esm.sh/@supabase/supabase-js@2': { createClient },
    },
    expose: ['sessionIdFromToken', 'getUser', 'isActiveAuthSession', 'findAttachmentForFinalize'],
  });
  return { exports, rpcCalls, tableCalls, attachment };
};

test('support API binds the verified user to the session_id claim from the access token', async () => {
  const { exports } = loadSupportApi();
  const token = tokenWithSession(sessionId);
  const request = new Request('https://test.invalid', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(exports.sessionIdFromToken(token), sessionId);
  assert.equal((await exports.getUser(request)).sessionId, sessionId);
  assert.equal(exports.sessionIdFromToken(tokenWithSession('not-a-uuid')), '');
});

test('support API asks the service-only predicate about the exact user and session and fails closed', async () => {
  const { exports, rpcCalls } = loadSupportApi();

  assert.equal(await exports.isActiveAuthSession(userId, sessionId), true);
  assert.equal(rpcCalls[0][0], 'admin_auth_session_is_active');
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[0][1])), {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  assert.equal(await exports.isActiveAuthSession(userId, 'invalid'), false);
  assert.equal(rpcCalls.length, 1);

  const unavailable = loadSupportApi({ active: false });
  assert.equal(await unavailable.exports.isActiveAuthSession(userId, sessionId), false);
  const databaseError = loadSupportApi({ rpcError: new Error('database unavailable') });
  assert.equal(await databaseError.exports.isActiveAuthSession(userId, sessionId), false);
});

test('support attachment service access rejects revoked sessions before owner or operator authorization', async () => {
  const revoked = loadSupportApi({ active: false });

  await assert.rejects(
    revoked.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId }, ''),
    /Support session required/,
  );
  assert.deepEqual(revoked.tableCalls, ['support_attachments']);
  assert.equal(revoked.rpcCalls.length, 1);

  const active = loadSupportApi();
  assert.equal(
    await active.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId }, ''),
    active.attachment,
  );
  assert.deepEqual(active.tableCalls, ['support_attachments']);
});
