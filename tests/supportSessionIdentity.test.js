import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const storage = (initial = {}) => ({
  values: { ...initial },
  getItem(key) { return Object.hasOwn(this.values, key) ? this.values[key] : null; },
  setItem(key, value) { this.values[key] = String(value); },
  removeItem(key) { delete this.values[key]; },
});

const supportService = (session) => loadEdgeFunction('src/services/supportService.js', {
  imports: {
    './supabase': {
      supabase: {
        auth: { getSession: async () => ({ data: { session: null } }) },
        functions: { invoke: async () => ({ data: { ok: true, data: { conversationId: 'new-conversation' } }, error: null }) },
      },
    },
  },
  globals: {
    window: { sessionStorage: session },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
  },
});

test('support conversation storage is isolated by account identity', () => {
  const session = storage({
    'resumeats.support.session': JSON.stringify({ guestToken: 'guest-token', conversationId: 'account-a-conversation', ownerKey: 'account-a' }),
  });
  const { exports } = supportService(session);

  assert.equal(exports.getActiveSupportConversationId('account-a'), 'account-a-conversation');
  assert.equal(exports.getActiveSupportConversationId('account-b'), '');
  assert.equal(exports.getActiveSupportConversationId('anonymous'), '');
});

test('new support conversations persist their identity owner', async () => {
  const session = storage();
  const { exports } = supportService(session);

  await exports.startSupportConversation({ subject: 'Subject', body: 'Body', sessionOwnerKey: 'account-b' });
  assert.equal(exports.getActiveSupportConversationId('account-b'), 'new-conversation');
  assert.equal(exports.getActiveSupportConversationId('account-a'), '');
  assert.equal(JSON.parse(session.values['resumeats.support.session']).ownerKey, 'account-b');
});
