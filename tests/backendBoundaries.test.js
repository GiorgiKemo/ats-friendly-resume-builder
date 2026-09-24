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

const loadAnalyticsSnapshot = (
  counts,
  cohortResponse = { data: null, error: { code: 'PGRST202' } },
  activationResponse = { data: null, error: { code: 'PGRST202' } },
  retentionResponse = { data: null, error: { code: 'PGRST202' } },
  aggregateResponse = { data: { available: false, metricVersion: 1, reason: 'aggregate_missing_or_invalidated', rows: [] }, error: null },
  rebuildResponse = { data: { available: true, metric: 'daily_first_party_event_counts', metricVersion: 1, rows: 14 }, error: null },
) => {
  const calls = [];
  const { exports } = loadEdgeFunction('supabase/functions/admin-api/index.ts', {
    imports: {
      supabase: {
        createClient: () => ({
          rpc: async (name, args) => {
            calls.push(['rpc', name, args]);
            if (name === 'admin_resume_activation_7d_cohort') return activationResponse;
            if (name === 'admin_product_retention_cohort') return retentionResponse;
            if (name === 'admin_read_analytics_daily_event_aggregates') return aggregateResponse;
            if (name === 'admin_rebuild_analytics_daily_event_aggregates') return rebuildResponse;
            return cohortResponse;
          },
          from: (table) => {
            calls.push(['from', table]);
            assert.equal(table, 'analytics_events');
            let eventName = '';
            const query = {
              select: () => query,
              eq: (column, value) => { if (column === 'event_name') eventName = value; return query; },
              gte: () => query,
              lt: () => query,
              then: (resolve, reject) => Promise.resolve({ count: counts[eventName] ?? 0, error: null }).then(resolve, reject),
            };
            return query;
          },
        }),
      },
      '../_shared/cors.ts': corsStub,
    },
    expose: ['fetchAnalyticsSnapshot', 'buildAnalyticsCsv', 'reviewAnalyticsCohortQuality', 'setAnalyticsQaExclusion', 'fetchCustomerAnalyticsQaExclusion', 'rebuildAnalyticsDailyEventAggregates'],
  });
  return { ...exports, calls };
};

test('signup-to-purchase event ratio divides purchases by account-created events', async () => {
  const { fetchAnalyticsSnapshot } = loadAnalyticsSnapshot({ account_created: 100, purchase_confirmed: 20 });
  const analytics = await fetchAnalyticsSnapshot({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' });

  assert.equal(analytics.eventRatios.purchasesPerAccountCreatedEvent, 20);
});

test('analytics snapshot preserves its reporting timezone in the window and CSV export', async () => {
  const { fetchAnalyticsSnapshot, buildAnalyticsCsv } = loadAnalyticsSnapshot({ account_created: 10 });
  const analytics = await fetchAnalyticsSnapshot({
    from: '2026-09-23T20:00:00.000Z',
    to: '2026-09-24T20:00:00.000Z',
    timeZone: 'Asia/Tbilisi',
  });

  assert.equal(analytics.timeZone, 'Asia/Tbilisi');
  assert.equal(analytics.window.from, '2026-09-23T20:00:00.000Z');
  assert.equal(analytics.window.to, '2026-09-24T20:00:00.000Z');
  assert.equal(analytics.paidConversion.window.timezone, 'Asia/Tbilisi');
  assert.equal(analytics.resumeActivation.window.timezone, 'Asia/Tbilisi');
  assert.equal(analytics.productRetention.window.timezone, 'Asia/Tbilisi');
  assert.match(buildAnalyticsCsv(analytics), /"reporting_timezone","Asia\/Tbilisi"/);
  assert.match(buildAnalyticsCsv(analytics), /"paid_conversion_30d\.window_timezone","Asia\/Tbilisi"/);
  assert.match(buildAnalyticsCsv(analytics), /"resume_activation_7d\.window_timezone","Asia\/Tbilisi"/);
  assert.match(buildAnalyticsCsv(analytics), /"product_retention_exact_day\.window_timezone","Asia\/Tbilisi"/);
  assert.match(buildAnalyticsCsv(analytics), /"daily_aggregates.available","false"/);
});

test('analytics snapshot uses complete daily aggregates and avoids rescanning raw events', async () => {
  const eventNames = [
    'account_created', 'account_confirmed', 'upgrade_click', 'resume_created', 'resume_exported',
    'application_created', 'checkout_started', 'checkout_created', 'purchase_confirmed', 'support_started',
    'support_resolved', 'ai_generation_started', 'ai_generation_completed', 'ai_generation_failed',
  ];
  const aggregateResponse = { data: {
    available: true,
    metric: 'daily_first_party_event_counts',
    metricVersion: 1,
    expectedRows: 14,
    actualRows: 14,
    computedAt: '2026-01-02T00:00:00.000Z',
    rows: eventNames.map((eventName) => ({
      date: '2026-01-01', eventName,
      eventCount: eventName === 'ai_generation_completed' ? 7 : 0,
    })),
  }, error: null };
  const { fetchAnalyticsSnapshot, calls } = loadAnalyticsSnapshot({}, undefined, undefined, undefined, aggregateResponse);
  const analytics = await fetchAnalyticsSnapshot({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
  });

  assert.equal(analytics.metrics.ai_generation_completed, 7);
  assert.equal(analytics.metrics.account_created, 0);
  assert.equal(analytics.dailyAggregates.available, true);
  assert.equal(analytics.dailyAggregates.computedAt, '2026-01-02T00:00:00.000Z');
  assert.equal(calls.some((call) => call[0] === 'from'), false);
});

test('analytics snapshot falls back to source events when aggregates were invalidated', async () => {
  const aggregateResponse = { data: {
    available: false,
    metric: 'daily_first_party_event_counts',
    metricVersion: 1,
    expectedRows: 14,
    actualRows: 13,
    rows: [],
  }, error: null };
  const { fetchAnalyticsSnapshot, calls } = loadAnalyticsSnapshot(
    { ai_generation_failed: 3 }, undefined, undefined, undefined, aggregateResponse,
  );
  const analytics = await fetchAnalyticsSnapshot({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
  });

  assert.equal(analytics.metrics.ai_generation_failed, 3);
  assert.equal(analytics.dailyAggregates.available, false);
  assert.equal(analytics.dailyAggregates.reason, 'aggregate_missing_or_invalidated');
  assert.equal(calls.some((call) => call[0] === 'from' && call[1] === 'analytics_events'), true);
});

test('daily aggregate rebuild calls the bounded RPC with selected timezone and fails closed on errors', async () => {
  const { rebuildAnalyticsDailyEventAggregates, calls } = loadAnalyticsSnapshot({});
  const receipt = await rebuildAnalyticsDailyEventAggregates({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    timeZone: 'UTC',
  });

  assert.equal(receipt.rows, 14);
  const rebuildCall = calls.find((call) => call[1] === 'admin_rebuild_analytics_daily_event_aggregates');
  assert.equal(rebuildCall[2].p_from, '2026-01-01T00:00:00.000Z');
  assert.equal(rebuildCall[2].p_to, '2026-01-02T00:00:00.000Z');
  assert.equal(rebuildCall[2].p_timezone, 'UTC');

  const failed = loadAnalyticsSnapshot({}, undefined, undefined, undefined, undefined, { data: null, error: { code: '42501' } });
  await assert.rejects(failed.rebuildAnalyticsDailyEventAggregates({
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-02T00:00:00.000Z',
    timeZone: 'UTC',
  }), /Could not rebuild daily analytics aggregates/);
});

test('resume activation uses a versioned account cohort and preserves consent-coverage quality', async () => {
  const activation = {
    metric: 'resume_activation_7d',
    metricVersion: 1,
    window: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z', timezone: 'UTC' },
    numerator: 4,
    denominator: 10,
    observedRate: 40,
    rate: null,
    maturing: { confirmed: 2, resumeExportToDate: 1 },
    isComplete: false,
    qualityReasons: ['consent_limited_export_event_coverage'],
  };
  const { fetchAnalyticsSnapshot, calls } = loadAnalyticsSnapshot(
    { account_confirmed: 10 },
    { data: null, error: { code: 'PGRST202' } },
    { data: activation, error: null },
  );
  const analytics = await fetchAnalyticsSnapshot({ from: activation.window.from, to: activation.window.to });

  assert.equal(analytics.resumeActivation.available, true);
  assert.equal(analytics.resumeActivation.metricVersion, 1);
  assert.equal(analytics.resumeActivation.observedRate, 40);
  assert.equal(analytics.resumeActivation.rate, null);
  assert.equal(analytics.resumeActivation.isComplete, false);
  assert.equal(analytics.resumeActivation.qualityReasons[0], 'consent_limited_export_event_coverage');
  const activationCall = calls.find((call) => call[1] === 'admin_resume_activation_7d_cohort');
  assert.equal(activationCall[2].p_from, activation.window.from);
  assert.equal(activationCall[2].p_to, activation.window.to);
});

test('product retention uses exact-day cohort RPCs and never presents incomplete event coverage as a final rate', async () => {
  const retention = {
    metric: 'product_retention_exact_day',
    metricVersion: 1,
    window: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z', timezone: 'UTC' },
    d7: { numerator: 2, denominator: 10, rate: null, observedRate: 20, maturing: { accounts: 1, observedActive: 1 } },
    d30: { numerator: 3, denominator: 10, rate: null, observedRate: 30, maturing: { accounts: 2, observedActive: 1 } },
    isComplete: false,
    qualityReasons: ['product_action_event_coverage_incomplete'],
  };
  const { fetchAnalyticsSnapshot, buildAnalyticsCsv, calls } = loadAnalyticsSnapshot(
    { account_confirmed: 10 },
    { data: null, error: { code: 'PGRST202' } },
    { data: null, error: { code: 'PGRST202' } },
    { data: retention, error: null },
  );
  const analytics = await fetchAnalyticsSnapshot({ from: retention.window.from, to: retention.window.to, timeZone: 'Asia/Tbilisi' });

  assert.equal(analytics.productRetention.available, true);
  assert.equal(analytics.productRetention.d7.observedRate, 20);
  assert.equal(analytics.productRetention.d7.rate, null);
  assert.equal(analytics.productRetention.d30.observedRate, 30);
  assert.equal(analytics.productRetention.isComplete, false);
  assert.deepEqual(analytics.productRetention.qualityReasons, ['product_action_event_coverage_incomplete']);
  const retentionCall = calls.find((call) => call[1] === 'admin_product_retention_cohort');
  assert.equal(retentionCall[2].p_from, retention.window.from);
  assert.equal(retentionCall[2].p_to, retention.window.to);
  assert.equal(retentionCall[2].p_timezone, 'Asia/Tbilisi');
  assert.match(buildAnalyticsCsv(analytics), /"product_retention_exact_day\.d7\.rate",""/);
  assert.match(buildAnalyticsCsv(analytics), /"product_retention_exact_day\.d30\.observed_rate","30"/);
});

test('analytics snapshot rejects unsupported reporting timezones', async () => {
  const { fetchAnalyticsSnapshot } = loadAnalyticsSnapshot({});
  await assert.rejects(
    fetchAnalyticsSnapshot({ timeZone: 'Europe/Paris' }),
    /Analytics timezone is invalid/,
  );
});

test('signup-to-purchase event ratio is unavailable when the signup denominator is zero', async () => {
  const { fetchAnalyticsSnapshot } = loadAnalyticsSnapshot({ account_created: 0, purchase_confirmed: 5 });
  const analytics = await fetchAnalyticsSnapshot({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' });

  assert.equal(analytics.eventRatios.purchasesPerAccountCreatedEvent, null);
});

test('paid conversion cohort uses the selected signup window and keeps the database quality result', async () => {
  const cohort = {
    metric: 'signup_to_paid_30d',
    metricVersion: 1,
    window: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z', timezone: 'UTC' },
    numerator: 2,
    denominator: 10,
    rate: 20,
    maturing: { confirmed: 0, firstPaidToDate: 0 },
    excludedAtConfirmation: 0,
    isComplete: true,
    qualityReasons: [],
  };
  const { fetchAnalyticsSnapshot, calls } = loadAnalyticsSnapshot(
    { account_created: 10, purchase_confirmed: 2 },
    { data: cohort, error: null },
  );
  const analytics = await fetchAnalyticsSnapshot({ from: cohort.window.from, to: cohort.window.to });

  assert.equal(analytics.paidConversion.available, true);
  assert.equal(analytics.paidConversion.rate, 20);
  const cohortCall = calls.find((call) => call[1] === 'admin_paid_conversion_cohort');
  assert.equal(cohortCall[0], 'rpc');
  assert.equal(cohortCall[2].p_from, cohort.window.from);
  assert.equal(cohortCall[2].p_to, cohort.window.to);
  assert.ok(Number.isFinite(Date.parse(cohortCall[2].p_as_of)));
});

test('paid conversion fails closed when the cohort migration is absent', async () => {
  const { fetchAnalyticsSnapshot } = loadAnalyticsSnapshot({ account_created: 10, purchase_confirmed: 2 });
  const analytics = await fetchAnalyticsSnapshot({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' });

  assert.equal(analytics.paidConversion.available, false);
  assert.equal(analytics.paidConversion.rate, null);
  assert.equal(analytics.paidConversion.qualityReasons.join(','), 'cohort_migration_not_applied');
});

test('analytics quality review calls the audited owner review RPC and does not leak raw database errors', async () => {
  const reviewReceipt = { metric: 'signup_to_paid_30d', metricVersion: 1, qaExclusionPeriodCount: 2 };
  const { reviewAnalyticsCohortQuality, calls } = loadAnalyticsSnapshot({}, { data: reviewReceipt, error: null });
  const result = await reviewAnalyticsCohortQuality('owner-1');

  assert.equal(result.qaExclusionPeriodCount, 2);
  assert.equal(calls[0][0], 'rpc');
  assert.equal(calls[0][1], 'admin_review_analytics_cohort_quality');
  assert.equal(calls[0][2].p_actor_user_id, 'owner-1');

  const failed = loadAnalyticsSnapshot({}, { data: null, error: { code: '42501', message: 'sensitive db detail' } });
  await assert.rejects(failed.reviewAnalyticsCohortQuality('owner-1'), /Could not record analytics exclusion review/);
});

test('QA exclusion changes call the audited owner RPC with only the selected policy fields', async () => {
  const receipt = { changed: true, operation: 'exclude', category: 'synthetic_fixture', scope: 'from_confirmation' };
  const targetUserId = '30000000-0000-4000-8000-000000000001';
  const { setAnalyticsQaExclusion, calls } = loadAnalyticsSnapshot({}, { data: receipt, error: null });
  const result = await setAnalyticsQaExclusion('owner-1', {
    userId: targetUserId,
    operation: 'exclude',
    category: 'synthetic_fixture',
    scope: 'from_confirmation',
  });

  assert.equal(result.changed, true);
  assert.equal(calls[0][1], 'admin_set_analytics_qa_exclusion');
  assert.equal(calls[0][2].p_actor_user_id, 'owner-1');
  assert.equal(calls[0][2].p_target_user_id, targetUserId);
  assert.equal(calls[0][2].p_operation, 'exclude');
  assert.equal(calls[0][2].p_category, 'synthetic_fixture');
  assert.equal(calls[0][2].p_scope, 'from_confirmation');

  const failed = loadAnalyticsSnapshot({}, { data: null, error: { code: '42501', message: 'sensitive db detail' } });
  await assert.rejects(
    failed.setAnalyticsQaExclusion('owner-1', { userId: targetUserId, operation: 'include' }),
    /Could not update analytics QA exclusion/,
  );
});

test('customer QA exclusion reads fail closed when the migration is unavailable', async () => {
  const { fetchCustomerAnalyticsQaExclusion } = loadAnalyticsSnapshot({});
  const exclusion = await fetchCustomerAnalyticsQaExclusion('30000000-0000-4000-8000-000000000001');

  assert.equal(exclusion.available, false);
  assert.equal(exclusion.excluded, false);
});

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
      '../_shared/aiAccess.ts': { resolveAllowedModel: () => 'test-model', hasAnalyticsConsent: () => false, recordAiGenerationEvent: async () => false },
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
