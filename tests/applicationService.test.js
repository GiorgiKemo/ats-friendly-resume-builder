import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createQaServer, QA_EMAIL, QA_PASSWORD, QA_USER_ID } from './fixtures/qa-server.mjs';

let vite;
let fixtures;
let service;
before(async () => {
  fixtures = createQaServer({ empty: true });
  await new Promise((resolve) => fixtures.server.listen(0, '127.0.0.1', resolve));
  vite = await createServer({
    configFile: false, cacheDir: 'node_modules/.vite-qa-services',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
    define: {
      'import.meta.env.VITE_SUPABASE_URL_DEV': JSON.stringify(`http://127.0.0.1:${fixtures.server.address().port}`),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY_DEV': JSON.stringify('qa-local-anon-key'),
    },
  });
  const { supabase } = await vite.ssrLoadModule('/src/services/supabase.js');
  assert.equal((await supabase.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD })).error, null);
  service = await vite.ssrLoadModule('/src/services/applicationService.js');
});
after(async () => {
  await vite?.close();
  if (fixtures) await new Promise((resolve) => { fixtures.server.close(resolve); fixtures.server.closeAllConnections(); });
});

test('application service preserves saved-vs-submitted dates and safely saves a joined edit form', async () => {
  const created = await service.createApplication({ company: ' Fixture Company ', position: 'Designer', status: 'saved' });
  assert.equal(created.error, null);
  assert.equal(created.data.company, 'Fixture Company');
  assert.equal(created.data.applied_at, null);
  const edited = await service.updateApplication(created.data.id, {
    ...created.data, status: 'screening', notes: 'Phone conversation', user_id: 'spoof', resumes: { id: 'joined-row' },
  });
  assert.equal(edited.error, null);
  assert.equal(edited.data.status, 'screening');
  assert.ok(edited.data.applied_at);
  assert.ok(edited.data.response_at);
  const stored = fixtures.state.job_applications.find((row) => row.id === created.data.id);
  assert.equal(stored.user_id, QA_USER_ID);
  assert.equal(stored.resumes, undefined, 'Relation columns must not be sent to the database');
});

test('application analytics use all-time submitted cohort and only recent dates for weekly activity', async () => {
  fixtures.state.job_applications = [
    { id: 'saved', user_id: QA_USER_ID, status: 'saved', applied_at: null },
    { id: 'old', user_id: QA_USER_ID, status: 'screening', applied_at: new Date(Date.now() - 50 * 86400000).toISOString() },
    { id: 'recent', user_id: QA_USER_ID, status: 'applied', applied_at: new Date().toISOString() },
  ];
  const result = await service.getApplicationAnalytics();
  assert.equal(result.error, null);
  assert.equal(result.metrics.totalApplications, 2);
  assert.equal(result.metrics.responseRate, 50);
  assert.equal(result.metrics.statusCounts.screening, 1);
  assert.deepEqual(result.recentApplications.map((app) => app.id), ['recent']);
  assert.equal(result.weeklyData.reduce((total, week) => total + week.count, 0), 1);
  const performance = await service.getResumePerformance();
  assert.equal(performance.error, null);
  assert.equal(performance.data[0].total_applications, 2);
  assert.equal(performance.data[0].responses, 1);
  assert.equal(performance.data[0].response_rate, 50);
});

test('tracker and analytics paginate past the Supabase 1,000-row default cap', async () => {
  fixtures.state.job_applications = Array.from({ length: 1002 }, (_, index) => ({
    id: `application-${String(index).padStart(4, '0')}`, user_id: QA_USER_ID,
    status: index < 1000 ? 'applied' : 'screening', applied_at: '2026-01-01T12:00:00Z',
  }));
  const tracker = await service.getApplications();
  assert.equal(tracker.data.length, 1002);
  assert.equal(new Set(tracker.data.map((application) => application.id)).size, 1002);
  const analytics = await service.getApplicationAnalytics();
  assert.equal(analytics.metrics.totalApplications, 1002);
  assert.equal(analytics.metrics.statusCounts.screening, 2);
  const performance = await service.getResumePerformance();
  assert.equal(performance.data[0].total_applications, 1002);
});

test('bulk status transitions preserve existing dates and initialize only missing dates', async () => {
  fixtures.state.job_applications = [
    { id: 'saved', user_id: QA_USER_ID, status: 'saved', applied_at: null, response_at: null },
    { id: 'applied', user_id: QA_USER_ID, status: 'applied', applied_at: '2026-08-01', response_at: null },
    { id: 'responded', user_id: QA_USER_ID, status: 'interview', applied_at: '2026-07-01', response_at: '2026-07-03' },
  ];
  const result = await service.bulkUpdateStatus(['saved', 'applied', 'responded', 'saved'], 'offer');
  assert.equal(result.error, null);
  assert.equal(result.data.length, 3);
  const [saved, applied, responded] = fixtures.state.job_applications;
  assert.equal(saved.status, 'offer');
  assert.ok(saved.applied_at);
  assert.ok(saved.response_at);
  assert.equal(applied.applied_at, '2026-08-01');
  assert.ok(applied.response_at);
  assert.equal(responded.applied_at, '2026-07-01');
  assert.equal(responded.response_at, '2026-07-03');
  const withdrawn = await service.bulkUpdateStatus(['saved', 'applied'], 'withdrawn');
  assert.equal(withdrawn.error, null);
  assert.equal(withdrawn.data[0].response_at, result.data.find((row) => row.id === withdrawn.data[0].id).response_at);
});
