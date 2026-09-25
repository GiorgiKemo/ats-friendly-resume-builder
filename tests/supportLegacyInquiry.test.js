import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const operatorId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const conversationId = '40000000-0000-4000-8000-000000000001';
const inquiryId = '50000000-0000-4000-8000-000000000001';
const alreadyLinkedInquiryId = '50000000-0000-4000-8000-000000000002';
const linkedElsewhereInquiryId = '50000000-0000-4000-8000-000000000003';

const tokenWithSession = (id, aal = 'aal2') => {
  const payload = btoa(JSON.stringify({ session_id: id, aal }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
};

const loadSupportApi = ({ confirmed = true, email = 'Owner@Example.com', role = 'support' } = {}) => {
  const linkedAt = '2026-09-20T10:00:00.000Z';
  const conversations = [{ id: conversationId, customer_user_id: '60000000-0000-4000-8000-000000000001' }];
  const inquiries = [
    { id: inquiryId, name: 'Owner', email: 'owner@example.com', email_normalized: 'owner@example.com', subject: 'Resume import', message: 'Historical body', source: 'website', status: 'new', created_at: '2026-09-10T10:00:00.000Z' },
    { id: alreadyLinkedInquiryId, name: 'Owner', email: 'OWNER@example.com', email_normalized: 'owner@example.com', subject: 'Export question', message: 'Second historical body', source: 'help-page', status: 'read', created_at: '2026-09-11T10:00:00.000Z' },
    { id: linkedElsewhereInquiryId, name: 'Owner', email: 'owner@example.com', email_normalized: 'owner@example.com', subject: 'Other account case', message: 'Must stay hidden', source: 'website', status: 'new', created_at: '2026-09-12T10:00:00.000Z' },
  ];
  const links = [
    { contact_inquiry_id: alreadyLinkedInquiryId, conversation_id: conversationId, linked_by: operatorId, linked_at: linkedAt },
    { contact_inquiry_id: linkedElsewhereInquiryId, conversation_id: '40000000-0000-4000-8000-000000000002', linked_by: operatorId, linked_at: linkedAt },
  ];
  const touchedTables = [];
  const serviceClient = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email, email_confirmed_at: confirmed ? linkedAt : null } }, error: null }) } },
    rpc: async (name) => ({ data: name === 'admin_auth_session_is_active', error: null }),
    from(table) {
      touchedTables.push(table);
      const filters = [];
      let inserted = null;
      let sortColumn = '';
      let sortAscending = true;
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return query; },
        order(column, options = {}) { sortColumn = column; sortAscending = options.ascending !== false; return query; },
        limit() { return query; },
        insert(row) { inserted = row; return query; },
        async maybeSingle() {
          const rows = table === 'support_conversations' ? conversations
            : table === 'contact_inquiries' ? inquiries
              : table === 'support_legacy_inquiry_links' ? links
                : table === 'admin_members' ? [{ id: 'member-1', user_id: operatorId, role, is_active: true }] : [];
          if (inserted) {
            const existing = links.find((link) => link.contact_inquiry_id === inserted.contact_inquiry_id);
            if (!existing) {
              const link = { ...inserted, linked_at: linkedAt };
              links.push(link);
              return { data: link, error: null };
            }
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          const row = rows.find((candidate) => filters.every((filter) => filter(candidate)));
          return { data: row || null, error: null };
        },
        then(resolve, reject) {
          const rows = table === 'contact_inquiries' ? inquiries
            : table === 'support_legacy_inquiry_links' ? links : [];
          const filtered = rows.filter((row) => filters.every((filter) => filter(row)));
          if (sortColumn) filtered.sort((left, right) => `${left[sortColumn]}`.localeCompare(`${right[sortColumn]}`) * (sortAscending ? 1 : -1));
          return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const createClient = (_url, key) => key === 'publishable-test-key'
    ? { auth: { getUser: async () => ({ data: { user: { id: operatorId } }, error: null }) } }
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
  return { ...loaded, links, touchedTables };
};

const request = (action, payload = {}, { aal = 'aal2', authenticated = true } = {}) => new Request('https://test.invalid', {
  method: 'POST',
  headers: {
    ...(authenticated ? { Authorization: `Bearer ${tokenWithSession(sessionId, aal)}` } : {}),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action, conversationId, ...payload }),
});

test('legacy inquiry candidates require a confirmed exact-email customer and hide inquiries linked elsewhere', async () => {
  const app = loadSupportApi();
  const response = await app.handler(request('legacyInquiries'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.items.map((item) => item.id), [alreadyLinkedInquiryId, inquiryId]);
  assert.equal(body.data.items[0].linkedToCurrentConversation, true);
  assert.equal(body.data.items[1].message, 'Historical body');
  assert.equal(body.data.items[1].sourceCreatedAt, '2026-09-10T10:00:00.000Z');
  assert.equal(app.touchedTables.includes('support_messages'), false);

  const unconfirmed = loadSupportApi({ confirmed: false });
  const noEmailProof = await unconfirmed.handler(request('legacyInquiries'));
  assert.deepEqual((await noEmailProof.json()).data.items, []);
});

test('legacy inquiry links are idempotent, provenance-only, and cannot claim another conversation link', async () => {
  const app = loadSupportApi();
  const payload = { inquiryId };
  const first = await app.handler(request('linkLegacyInquiry', payload));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).data.item.id, inquiryId);
  assert.equal(app.links.find((link) => link.contact_inquiry_id === inquiryId).linked_by, operatorId);

  const repeated = await app.handler(request('linkLegacyInquiry', payload));
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).data.alreadyLinked, true);
  assert.equal(app.links.filter((link) => link.contact_inquiry_id === inquiryId).length, 1);

  const elsewhere = await app.handler(request('linkLegacyInquiry', { inquiryId: linkedElsewhereInquiryId }));
  assert.equal(elsewhere.status, 409);
  assert.equal(app.touchedTables.includes('support_messages'), false);
});

test('legacy inquiry operations reject guests and AAL1 callers before exposing records', async () => {
  const app = loadSupportApi();
  const guest = await app.handler(request('legacyInquiries', {}, { authenticated: false }));
  assert.equal(guest.status, 401);

  const aal1 = await app.handler(request('legacyInquiries', {}, { aal: 'aal1' }));
  assert.equal(aal1.status, 403);

  const nonOperator = loadSupportApi({ role: 'viewer' });
  const deniedOperator = await nonOperator.handler(request('legacyInquiries'));
  assert.equal(deniedOperator.status, 403);
});

test('legacy inquiries cannot be linked by an unconfirmed or nonmatching account email', async () => {
  const unconfirmed = loadSupportApi({ confirmed: false });
  const unconfirmedLink = await unconfirmed.handler(request('linkLegacyInquiry', { inquiryId }));
  assert.equal(unconfirmedLink.status, 404);

  const wrongEmail = loadSupportApi({ email: 'different@example.com' });
  const mismatchedLink = await wrongEmail.handler(request('linkLegacyInquiry', { inquiryId }));
  assert.equal(mismatchedLink.status, 404);
});
