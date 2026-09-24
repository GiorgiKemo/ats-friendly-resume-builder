import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const attachmentId = '30000000-0000-4000-8000-000000000001';

const tokenWithSession = (id, aal = 'aal1') => {
  const payload = btoa(JSON.stringify({ session_id: id, aal }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
};

const loadSupportApi = ({ active = true, rpcError = null, uploaderUserId = userId, hasMembership = true } = {}) => {
  const rpcCalls = [];
  const userRpcCalls = [];
  const tableCalls = [];
  const attachment = {
    id: attachmentId,
    conversation_id: '40000000-0000-4000-8000-000000000001',
    uploader_user_id: uploaderUserId,
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
        in() { return query; },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
        maybeSingle: async () => ({
          data: table === 'admin_members'
            ? (hasMembership ? { id: 'member-1' } : null)
            : table === 'support_attachments' ? attachment : null,
          error: null,
        }),
      };
      return query;
    },
  };
  const createClient = (_url, key) => key === 'publishable-test-key'
    ? {
      auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
      rpc: async (...args) => { userRpcCalls.push(args); return { data: { ok: true }, error: null }; },
    }
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
    expose: ['sessionIdFromToken', 'aalFromToken', 'getUser', 'isActiveAuthSession', 'isSupportOperator', 'findAttachmentForFinalize', 'getErrorStatus', 'getErrorMessage'],
  });
  return { ...loaded, rpcCalls, userRpcCalls, tableCalls, attachment };
};

test('support API binds the verified user to the session_id claim from the access token', async () => {
  const { exports } = loadSupportApi();
  const token = tokenWithSession(sessionId, 'aal2');
  const request = new Request('https://test.invalid', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(exports.sessionIdFromToken(token), sessionId);
  assert.equal(exports.aalFromToken(token), 'aal2');
  assert.equal(exports.aalFromToken(tokenWithSession(sessionId)), 'aal1');
  assert.equal((await exports.getUser(request)).sessionId, sessionId);
  assert.equal((await exports.getUser(request)).aal, 'aal2');
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

test('support API reports a revoked auth session as an authentication failure', () => {
  const { exports } = loadSupportApi();

  assert.equal(exports.getErrorStatus('Support session required'), 401);
  assert.equal(exports.getErrorMessage('Support session required'), 'Authentication required');
});

test('support operator authorization requires AAL2 before querying active membership', async () => {
  const { exports, tableCalls } = loadSupportApi();

  assert.equal(await exports.isSupportOperator(userId, 'aal1'), false);
  assert.deepEqual(tableCalls, []);
  assert.equal(await exports.isSupportOperator(userId, 'aal2'), true);
  assert.deepEqual(tableCalls, ['admin_members']);
});

test('support API requires AAL2 for operator reads while ordinary customer reads stay available at AAL1', async () => {
  const requestFor = (action, aal) => new Request('https://test.invalid', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenWithSession(sessionId, aal)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, conversationId: '40000000-0000-4000-8000-000000000001', lastReadSequence: 0 }),
  });

  for (const action of ['read', 'markRead', 'send']) {
    const operator = loadSupportApi({ hasMembership: true });
    const response = await operator.handler(requestFor(action, 'aal1'));
    assert.equal(response.status, 403, `${action} must require step-up for support members`);
    assert.deepEqual(operator.userRpcCalls, [], `${action} must be denied before the authenticated RPC`);
  }

  const steppedUpOperator = loadSupportApi({ hasMembership: true });
  const operatorRead = await steppedUpOperator.handler(requestFor('read', 'aal2'));
  assert.equal(operatorRead.status, 200);
  assert.equal(steppedUpOperator.userRpcCalls[0][0], 'support_read_conversation');

  const steppedUpOperatorSend = loadSupportApi({ hasMembership: true });
  const operatorSend = await steppedUpOperatorSend.handler(requestFor('send', 'aal2'));
  assert.equal(operatorSend.status, 200);
  assert.equal(steppedUpOperatorSend.userRpcCalls[0][0], 'support_send_message');

  const customer = loadSupportApi({ hasMembership: false });
  const customerRead = await customer.handler(requestFor('read', 'aal1'));
  assert.equal(customerRead.status, 200);
  assert.equal(customer.userRpcCalls[0][0], 'support_read_conversation');

  const customerSender = loadSupportApi({ hasMembership: false });
  const customerSend = await customerSender.handler(requestFor('send', 'aal1'));
  assert.equal(customerSend.status, 200);
  assert.equal(customerSender.userRpcCalls[0][0], 'support_send_message');
});

test('support attachment service access rejects revoked sessions before owner or operator authorization', async () => {
  const revoked = loadSupportApi({ active: false });

  await assert.rejects(
    revoked.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId, aal: 'aal1' }, ''),
    /Support session required/,
  );
  assert.deepEqual(revoked.tableCalls, ['support_attachments']);
  assert.equal(revoked.rpcCalls.length, 1);

  const active = loadSupportApi();
  assert.equal(
    await active.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId, aal: 'aal1' }, ''),
    active.attachment,
  );
  assert.deepEqual(active.tableCalls, ['support_attachments']);
});

test('operator attachment access needs AAL2 while an owner can still access their own attachment at AAL1', async () => {
  const otherUploaderId = '50000000-0000-4000-8000-000000000001';
  const aal1 = loadSupportApi({ uploaderUserId: otherUploaderId });

  await assert.rejects(
    aal1.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId, aal: 'aal1' }, ''),
    /Attachment access required/,
  );
  assert.deepEqual(aal1.tableCalls, ['support_attachments']);

  const aal2 = loadSupportApi({ uploaderUserId: otherUploaderId });
  assert.equal(
    await aal2.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId, aal: 'aal2' }, ''),
    aal2.attachment,
  );
  assert.deepEqual(aal2.tableCalls, ['support_attachments', 'admin_members']);
  const owner = loadSupportApi({ uploaderUserId: userId });
  assert.equal(
    await owner.exports.findAttachmentForFinalize(attachmentId, { id: userId, sessionId, aal: 'aal1' }, ''),
    owner.attachment,
  );
});
