import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApplicationEmailHtml, isSingleEmailAddress } from '../supabase/functions/_shared/emailSafety.ts';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const supabaseImport = 'https://esm.sh/@supabase/supabase-js@2';
const corsStub = {
  getCorsHeaders: () => ({}), isOriginAllowed: () => true,
  authenticateUser: async () => ({ userId: 'user-1' }),
};
const user = { id: 'user-1', email: 'owner@example.com', email_confirmed_at: '2026-01-01', app_metadata: { role: 'owner', is_admin: true } };
const membership = { id: 'member-1', user_id: user.id, role: 'support', is_active: true };

function loadAdmin(results) {
  const calls = [];
  const client = { from: (table) => { calls.push(['from', table]); return queryResult(results.shift(), calls); } };
  const { exports } = loadEdgeFunction('supabase/functions/admin-api/index.ts', {
    imports: { supabase: { createClient: () => client }, '../_shared/cors.ts': corsStub },
    expose: ['findAdminMembership', 'setBan', 'requestDeletion', 'ensureTargetIsNotActiveAdmin'],
  });
  return { ...exports, calls };
}

const adminSessionId = '20000000-0000-4000-8000-000000000001';
const adminSessionToken = (claims = {}) => `header.${btoa(JSON.stringify({
  sub: user.id,
  session_id: adminSessionId,
  ...claims,
})).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}.signature`;

function loadRequireAdmin(sessionResult) {
  const calls = [];
  const client = {
    auth: {
      getUser: async (token) => {
        calls.push(['getUser', token]);
        return { data: { user }, error: null };
      },
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return sessionResult;
    },
    from: (table) => {
      calls.push(['from', table]);
      return queryResult({ data: { ...membership, role: 'owner' }, error: null }, calls);
    },
  };
  const { exports } = loadEdgeFunction('supabase/functions/admin-api/index.ts', {
    imports: { supabase: { createClient: () => client }, '../_shared/cors.ts': corsStub },
    expose: ['requireAdmin'],
  });
  return { requireAdmin: exports.requireAdmin, calls };
}

test('admin Auth user reads continue past the first full page', async () => {
  const calls = [];
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    id: `user-${index}`,
    email: `user-${index}@example.com`,
    created_at: '2026-01-01T00:00:00.000Z',
  }));
  const secondPage = [{
    id: 'user-1000',
    email: 'user-1000@example.com',
    created_at: '2026-01-01T00:00:00.000Z',
  }];
  const client = {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          calls.push({ page, perPage });
          return { data: { users: page === 1 ? firstPage : secondPage }, error: null };
        },
      },
    },
  };
  const { exports } = loadEdgeFunction('supabase/functions/admin-api/index.ts', {
    imports: { supabase: { createClient: () => client }, '../_shared/cors.ts': corsStub },
    expose: ['listAuthUsers'],
  });

  const users = await exports.listAuthUsers();
  assert.equal(users.length, 1001);
  assert.deepEqual(calls, [{ page: 1, perPage: 1000 }, { page: 2, perPage: 1000 }]);
});

test('revoked database membership cannot regain admin access through stale metadata', async () => {
  const { findAdminMembership, calls } = loadAdmin([{ data: { ...membership, is_active: false }, error: null }]);
  assert.equal(await findAdminMembership(user), null);
  assert.equal(calls.filter(([method]) => method === 'from').length, 1);
});

test('missing membership and database errors both fail closed despite owner metadata', async () => {
  const missing = loadAdmin([{ data: null }, { data: null }]);
  assert.equal(await missing.findAdminMembership(user), null);
  const failure = loadAdmin([{ data: null, error: { message: 'database unavailable' } }]);
  await assert.rejects(failure.findAdminMembership(user), /Could not verify admin access/);
});

test('database role wins over stale owner metadata', async () => {
  const { findAdminMembership } = loadAdmin([{ data: membership }]);
  assert.equal((await findAdminMembership(user)).role, 'support');
});

test('ban and deletion requests reject every active admin membership before external work', async () => {
  const activeMembership = { data: [{ id: 'active-member' }], error: null };
  const ban = loadAdmin([{ ...activeMembership }]);
  await assert.rejects(ban.setBan('different-actor', { userId: user.id, banned: true }), /Revoke active admin access/);
  assert.deepEqual(ban.calls.filter(([method]) => method === 'from'), [['from', 'admin_members']]);

  const deletion = loadAdmin([{ ...activeMembership }]);
  await assert.rejects(deletion.requestDeletion('different-actor', { userId: user.id }), /Revoke active admin access/);
  assert.deepEqual(deletion.calls.filter(([method]) => method === 'from'), [['from', 'admin_members']]);
});

test('admin ban and deletion safeguards fail closed when membership cannot be checked', async () => {
  const ban = loadAdmin([{ data: null, error: { message: 'database unavailable' } }]);
  await assert.rejects(ban.setBan('different-actor', { userId: user.id, banned: true }), /Could not verify active admin membership/);

  const deletion = loadAdmin([{ data: null, error: { message: 'database unavailable' } }]);
  await assert.rejects(deletion.requestDeletion('different-actor', { userId: user.id }), /Could not verify active admin membership/);
});

test('admin invitation matching uses equality, requires verified email and cannot claim linked accounts', async () => {
  const unverified = loadAdmin([{ data: null }]);
  assert.equal(await unverified.findAdminMembership({ ...user, email_confirmed_at: null }), null);
  assert.equal(unverified.calls.filter(([method]) => method === 'from').length, 1);

  const claimed = { ...membership, user_id: user.id };
  const invitation = loadAdmin([{ data: null }, { data: { ...membership, user_id: null } }, { data: claimed }]);
  assert.equal((await invitation.findAdminMembership(user)).user_id, user.id);
  assert.ok(invitation.calls.some(([method, column, value]) => method === 'eq' && column === 'email' && value === user.email));
  assert.equal(invitation.calls.filter(([method, column, value]) => method === 'is' && column === 'user_id' && value === null).length, 2);
});

test('concurrently revoked invitations do not grant access after a failed claim', async () => {
  const { findAdminMembership } = loadAdmin([{ data: null }, { data: membership }, { data: null }]);
  assert.equal(await findAdminMembership(user), null);
});

test('admin requests require an active Auth session row before membership access', async () => {
  const active = loadRequireAdmin({ data: true, error: null });
  const context = await active.requireAdmin(new Request('https://edge.test/admin', {
    headers: { Authorization: `Bearer ${adminSessionToken()}` },
  }));
  assert.equal(context.membership.role, 'owner');
  const rpcCall = active.calls.find(([kind]) => kind === 'rpc');
  assert.equal(rpcCall[1], 'admin_auth_session_is_active');
  assert.equal(rpcCall[2].p_user_id, user.id);
  assert.equal(rpcCall[2].p_session_id, adminSessionId);

  const revoked = loadRequireAdmin({ data: false, error: null });
  await assert.rejects(revoked.requireAdmin(new Request('https://edge.test/admin', {
    headers: { Authorization: `Bearer ${adminSessionToken()}` },
  })), /Invalid session/);
  assert.equal(revoked.calls.some(([kind]) => kind === 'from'), false);
});

test('admin session validation fails closed on missing claims and database errors', async () => {
  const missingClaim = loadRequireAdmin({ data: true, error: null });
  await assert.rejects(missingClaim.requireAdmin(new Request('https://edge.test/admin', {
    headers: { Authorization: `Bearer ${adminSessionToken({ session_id: undefined })}` },
  })), /Invalid session/);
  assert.equal(missingClaim.calls.some(([kind]) => kind === 'rpc'), false);

  const mismatchedSubject = loadRequireAdmin({ data: true, error: null });
  await assert.rejects(mismatchedSubject.requireAdmin(new Request('https://edge.test/admin', {
    headers: { Authorization: `Bearer ${adminSessionToken({ sub: '30000000-0000-4000-8000-000000000001' })}` },
  })), /Invalid session/);
  assert.equal(mismatchedSubject.calls.some(([kind]) => kind === 'rpc'), false);

  const malformedSessionId = loadRequireAdmin({ data: true, error: null });
  await assert.rejects(malformedSessionId.requireAdmin(new Request('https://edge.test/admin', {
    headers: { Authorization: `Bearer ${adminSessionToken({ session_id: 'not-a-uuid' })}` },
  })), /Invalid session/);
  assert.equal(malformedSessionId.calls.some(([kind]) => kind === 'rpc'), false);

  const databaseFailure = loadRequireAdmin({ data: null, error: { message: 'database unavailable' } });
  await assert.rejects(databaseFailure.requireAdmin(new Request('https://edge.test/admin', {
    headers: { Authorization: `Bearer ${adminSessionToken()}` },
  })), /Invalid session/);
  assert.equal(databaseFailure.calls.some(([kind]) => kind === 'from'), false);
});

test('application HTML escapes generated content and rejects unsafe reply links', () => {
  const html = buildApplicationEmailHtml('<img src=x onerror="attack()">\nA & B', '" onclick="attack()');
  assert.match(html, /&lt;img/);
  assert.match(html, /A &amp; B/);
  assert.doesNotMatch(html, /<img|<a /);
  assert.match(buildApplicationEmailHtml('Hello', 'candidate@example.com'), /mailto:candidate@example.com/);
});

test('single-recipient validation rejects CRLF injection and additional recipients', () => {
  for (const email of ['one@example.com\r\nBcc: attacker@example.com', 'one@example.com,two@example.com', 'one@example.com;two@example.com', 'a@example.com\0']) {
    assert.equal(isSingleEmailAddress(email), false, email);
  }
  assert.equal(isSingleEmailAddress('candidate+jobs@example.co.uk'), true);
});

test('Gmail refuses injected headers or filenames before sending or refreshing a token', async () => {
  let requests = 0;
  const { exports: { sendViaGmail } } = loadEdgeFunction('supabase/functions/_shared/gmailSend.ts', {
    fetch: () => { requests++; throw new Error('must not send'); },
  });
  const base = { fromEmail: 'candidate@example.com', toEmail: 'hiring@example.com', subject: 'Application', textContent: 'Hello', htmlContent: '<p>Hello</p>', tokenExpiresAt: '2000-01-01' };
  for (const changes of [
    { toEmail: 'hiring@example.com\r\nBcc: attacker@example.com' },
    { replyTo: 'candidate@example.com\r\nX-Injected: true' },
    { attachmentFilename: 'resume.pdf"\r\nX-Injected: true' },
  ]) {
    assert.equal((await sendViaGmail({ ...base, ...changes })).success, false);
  }
  assert.equal(requests, 0);
});

function loadDisconnect(deleteError = null, fetch = async () => new Response(null, { status: 200 })) {
  const results = [
    { data: { access_token: 'access-secret', refresh_token: 'refresh-secret' }, error: null },
    { error: deleteError },
  ];
  return loadEdgeFunction('supabase/functions/gmail-disconnect/index.ts', {
    imports: { [supabaseImport]: { createClient: () => ({ from: () => queryResult(results.shift()) }) }, '../_shared/cors.ts': corsStub },
    fetch,
  }).handler;
}

test('Gmail disconnect revokes refresh token in POST body, never URL', async () => {
  const handler = loadDisconnect(null, async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/revoke');
    assert.equal(options.body.get('token'), 'refresh-secret');
    return new Response(null, { status: 200 });
  });
  const response = await handler(new Request('https://edge.test/disconnect', { method: 'POST' }));
  assert.deepEqual(await response.json(), { success: true, revoked: true });
});

test('Gmail disconnect cannot report success when database deletion fails', async () => {
  const handler = loadDisconnect({ message: 'delete failed' });
  const response = await handler(new Request('https://edge.test/disconnect', { method: 'POST' }));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Could not remove Gmail connection/);
});

test('Gmail disconnect remains available during Google outage and reports revocation status accurately', async () => {
  const handler = loadDisconnect(null, async () => { throw new Error('Google is unavailable'); });
  const response = await handler(new Request('https://edge.test/disconnect', { method: 'POST' }));
  assert.deepEqual(await response.json(), { success: true, revoked: false });
});

function loadAutoApply() {
  return loadEdgeFunction('supabase/functions/auto-apply-run/index.ts', {
    imports: {
      [supabaseImport]: { createClient: () => { throw new Error('Must not start a run'); } },
      jspdf: {},
      '../_shared/cors.ts': corsStub,
      '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model' },
    },
    expose: ['sendApplicationEmail'],
  });
}

test('unconfigured discovery returns an actionable failure, never fabricated jobs or queued counts', async () => {
  const { handler } = loadAutoApply();
  const response = await handler(new Request('https://edge.test/auto-apply', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /not configured/);
  assert.equal(body.success, undefined);
  assert.equal(body.jobs_queued, undefined);
});

test('malformed auto-apply requests are rejected before beginning a run', async () => {
  const { handler } = loadAutoApply();
  for (const body of ['null', '[]', '{bad', '{"discover_only":"false"}']) {
    const response = await handler(new Request('https://edge.test/auto-apply', { method: 'POST', body }));
    assert.equal(response.status, 400, body);
  }
});

test('missing Brevo credentials never create a successful dry-run message ID', async () => {
  const { exports: { sendApplicationEmail } } = loadAutoApply();
  assert.equal(await sendApplicationEmail('hiring@example.com', 'Candidate', '', 'Application', 'Hello', 'job-1'), null);
});
