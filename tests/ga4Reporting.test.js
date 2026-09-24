import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const window = {
  from: '2026-08-31T20:00:00.000Z',
  to: '2026-09-03T20:00:00.000Z',
  timeZone: 'Asia/Tbilisi',
};

const serviceAccount = JSON.stringify({
  client_email: 'analytics-reader@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----',
});

const apiReport = {
  dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }],
  metricHeaders: [
    { name: 'sessions' },
    { name: 'totalUsers' },
    { name: 'newUsers' },
    { name: 'sessionKeyEventRate:sign_up' },
  ],
  rows: [{
    dimensionValues: [{ value: 'Organic Search' }],
    metricValues: [{ value: '100' }, { value: '80' }, { value: '60' }, { value: '0.125' }],
  }],
  totals: [{ metricValues: [{ value: '100' }, { value: '80' }, { value: '60' }, { value: '0.125' }] }],
  rowCount: 1,
  metadata: { timeZone: 'Asia/Tbilisi' },
};

function loadReport({
  env = {},
  cacheRead = { data: null, error: null },
  cacheWrite = { error: null },
  apiResponse = apiReport,
  apiError = null,
} = {}) {
  const calls = [];
  class GoogleAuth {
    constructor(options) {
      calls.push(['google-auth', options]);
    }

    async getClient() {
      return {
        request: async (request) => {
          calls.push(['google-request', request]);
          if (apiError) throw apiError;
          return { data: apiResponse };
        },
      };
    }
  }

  const client = {
    from(table) {
      assert.equal(table, 'admin_ga_report_cache');
      const query = {
        select: (columns) => { calls.push(['select', columns]); return query; },
        eq: (column, value) => { calls.push(['eq', column, value]); return query; },
        maybeSingle: async () => cacheRead,
        upsert: async (row, options) => { calls.push(['upsert', row, options]); return cacheWrite; },
        delete: () => {
          const deletion = {
            lt: (column, value) => { calls.push(['prune', column, value]); return deletion; },
            then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
          };
          return deletion;
        },
      };
      return query;
    },
  };

  const { exports } = loadEdgeFunction('supabase/functions/_shared/ga4Reporting.ts', {
    env: {
      GA4_SERVICE_ACCOUNT_JSON: serviceAccount,
      GA4_PROPERTY_ID: '552904382',
      ...env,
    },
    imports: { 'google-auth-library': { GoogleAuth } },
    expose: ['fetchGa4AcquisitionReport'],
  });
  return { fetchReport: exports.fetchGa4AcquisitionReport, calls, client };
}

test('GA4 report stays explicitly disconnected when its service-account credential is absent', async () => {
  const { fetchReport, calls, client } = loadReport({ env: { GA4_SERVICE_ACCOUNT_JSON: '' } });
  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'not_connected');
  assert.equal(report.available, false);
  assert.equal(report.reason, 'credentials_missing');
  assert.equal(report.totals.sessions, null);
  assert.equal(calls.length, 0);
});

test('GA4 report reads a fresh server cache without spending an Analytics API request', async () => {
  const cachedPayload = {
    available: true,
    source: 'google_analytics_4',
    propertyId: '552904382',
    propertyTimeZone: 'Asia/Tbilisi',
    window: { startDate: '2026-09-01', endDate: '2026-09-03', reportingTimeZone: 'Asia/Tbilisi' },
    totals: { sessions: 100, totalUsers: 80, newUsers: 60, signUpSessionConversionRate: 0.125 },
    channels: [],
  };
  const { fetchReport, calls, client } = loadReport({
    cacheRead: {
      data: {
        report_payload: cachedPayload,
        fetched_at: '2026-09-24T09:55:00.000Z',
        expires_at: '2026-09-24T10:10:00.000Z',
      },
      error: null,
    },
  });

  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'connected');
  assert.equal(report.cacheHit, true);
  assert.equal(report.totals.sessions, 100);
  assert.equal(calls.some(([kind]) => kind === 'google-request'), false);
});

test('GA4 channel acquisition report uses bounded date-only dimensions and caches normalized totals', async () => {
  const { fetchReport, calls, client } = loadReport();
  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'connected');
  assert.equal(report.available, true);
  assert.equal(report.totals.sessions, 100);
  assert.equal(report.totals.totalUsers, 80);
  assert.equal(report.totals.newUsers, 60);
  assert.equal(report.totals.signUpSessionConversionRate, 0.125);
  assert.equal(report.channels[0].channel, 'Organic Search');
  assert.equal(report.window.startDate, '2026-09-01');
  assert.equal(report.window.endDate, '2026-09-03');
  assert.equal(report.window.reportingTimeZone, 'Asia/Tbilisi');
  assert.equal(report.propertyTimeZone, 'Asia/Tbilisi');

  const request = calls.find(([kind]) => kind === 'google-request')?.[1];
  assert.match(request.url, /properties\/552904382:runReport$/);
  assert.equal(JSON.stringify(request.data.dateRanges), JSON.stringify([{ startDate: '2026-09-01', endDate: '2026-09-03' }]));
  assert.equal(JSON.stringify(request.data.dimensions), JSON.stringify([{ name: 'sessionDefaultChannelGroup' }]));
  assert.equal(JSON.stringify(request.data.metrics.map(({ name }) => name)), JSON.stringify([
    'sessions', 'totalUsers', 'newUsers', 'sessionKeyEventRate:sign_up',
  ]));
  assert.equal(request.data.limit, '25');
  assert.equal(request.data.metricAggregations[0], 'TOTAL');

  const write = calls.find(([kind]) => kind === 'upsert')?.[1];
  assert.equal(write.property_id, '552904382');
  assert.equal(write.report_kind, 'acquisition_by_channel_v1');
  assert.equal(write.report_payload.totals.sessions, 100);
  assert.equal(calls.some(([kind]) => kind === 'prune'), true);
});

test('GA4 report is unavailable and not cached when property timezone differs from the selected reporting timezone', async () => {
  const { fetchReport, calls, client } = loadReport({
    apiResponse: { ...apiReport, metadata: { timeZone: 'UTC' } },
  });

  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'unavailable');
  assert.equal(report.available, false);
  assert.equal(report.reason, 'reporting_timezone_mismatch');
  assert.equal(report.totals.sessions, null);
  assert.equal(calls.some(([kind]) => kind === 'upsert'), false);
});

test('GA4 report is unavailable and not cached when Google omits the property timezone', async () => {
  const { fetchReport, calls, client } = loadReport({
    apiResponse: { ...apiReport, metadata: {} },
  });

  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'unavailable');
  assert.equal(report.available, false);
  assert.equal(report.reason, 'reporting_timezone_missing');
  assert.equal(calls.some(([kind]) => kind === 'upsert'), false);
});

test('GA4 report does not reuse a fresh cache generated under a different property timezone', async () => {
  const { fetchReport, calls, client } = loadReport({
    cacheRead: {
      data: {
        report_payload: {
          available: true,
          source: 'google_analytics_4',
          propertyId: '552904382',
          propertyTimeZone: 'UTC',
          window: { startDate: '2026-09-01', endDate: '2026-09-03', reportingTimeZone: 'Asia/Tbilisi' },
          totals: { sessions: 100, totalUsers: 80, newUsers: 60, signUpSessionConversionRate: 0.125 },
          channels: [],
        },
        fetched_at: '2026-09-24T09:55:00.000Z',
        expires_at: '2026-09-24T10:10:00.000Z',
      },
      error: null,
    },
  });

  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'connected');
  assert.equal(report.propertyTimeZone, 'Asia/Tbilisi');
  assert.equal(report.cacheHit, false);
  assert.equal(calls.some(([kind]) => kind === 'google-request'), true);
  assert.equal(calls.some(([kind]) => kind === 'upsert'), true);
});

test('GA4 does not serve stale cached data from a different property timezone after refresh fails', async () => {
  const { fetchReport, client } = loadReport({
    cacheRead: {
      data: {
        report_payload: {
          available: true,
          source: 'google_analytics_4',
          propertyId: '552904382',
          propertyTimeZone: 'UTC',
          window: { startDate: '2026-09-01', endDate: '2026-09-03', reportingTimeZone: 'Asia/Tbilisi' },
          totals: { sessions: 100, totalUsers: 80, newUsers: 60, signUpSessionConversionRate: 0.125 },
          channels: [],
        },
        fetched_at: '2026-09-24T09:00:00.000Z',
        expires_at: '2026-09-24T09:15:00.000Z',
      },
      error: null,
    },
    apiError: Object.assign(new Error('provider details must not be returned'), { response: { status: 429 } }),
  });

  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'unavailable');
  assert.equal(report.available, false);
  assert.equal(report.reason, 'google_quota_exceeded');
  assert.equal(report.totals.sessions, null);
});

test('GA4 quota failure serves a bounded stale cache and labels it stale', async () => {
  const cachedPayload = {
    available: true,
    source: 'google_analytics_4',
    propertyId: '552904382',
    propertyTimeZone: 'Asia/Tbilisi',
    window: { startDate: '2026-09-01', endDate: '2026-09-03', reportingTimeZone: 'Asia/Tbilisi' },
    totals: { sessions: 100, totalUsers: 80, newUsers: 60, signUpSessionConversionRate: 0.125 },
    channels: [],
  };
  const quotaError = Object.assign(new Error('provider details must not be returned'), { response: { status: 429 } });
  const { fetchReport, client } = loadReport({
    cacheRead: {
      data: {
        report_payload: cachedPayload,
        fetched_at: '2026-09-24T09:00:00.000Z',
        expires_at: '2026-09-24T09:15:00.000Z',
      },
      error: null,
    },
    apiError: quotaError,
  });

  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'stale');
  assert.equal(report.available, true);
  assert.equal(report.stale, true);
  assert.equal(report.reason, 'google_quota_exceeded');
  assert.equal(JSON.stringify(report).includes('provider details must not be returned'), false);
});

test('GA4 does not make an uncached provider call when the private cache schema is unavailable', async () => {
  const { fetchReport, calls, client } = loadReport({
    cacheRead: { data: null, error: { code: 'PGRST205' } },
  });
  const report = await fetchReport(client, window, new Date('2026-09-24T10:00:00.000Z'));

  assert.equal(report.status, 'unavailable');
  assert.equal(report.available, false);
  assert.equal(report.reason, 'cache_not_configured');
  assert.equal(calls.some(([kind]) => kind === 'google-request'), false);
});
