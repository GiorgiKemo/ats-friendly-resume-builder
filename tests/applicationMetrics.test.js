import test from 'node:test';
import assert from 'node:assert/strict';
import { getApplicationMetrics, getApplicationUpdates } from '../src/utils/applicationMetrics.js';

test('metrics use canonical screening statuses and exclude saved roles from rates', () => {
  const metrics = getApplicationMetrics([
    { status: 'saved', response_at: '2026-01-01' },
    { status: 'applied' }, { status: 'screening' }, { status: 'interview' },
    { status: 'offer' }, { status: 'rejected' }, { status: 'withdrawn' },
  ]);
  assert.equal(metrics.totalApplications, 6);
  assert.equal(metrics.savedCount, 1);
  assert.equal(metrics.statusCounts.screening, 1);
  assert.equal(metrics.responseCount, 4);
  assert.equal(metrics.responseRate, 67);
  assert.equal(metrics.interviewCount, 2);
  assert.equal(metrics.offerCount, 1);
  assert.equal('phone_screen' in metrics.statusCounts, false);
});

test('metrics retain explicitly recorded responses after withdrawal and handle empty data', () => {
  assert.equal(getApplicationMetrics([{ status: 'withdrawn', response_at: '2026-01-01' }]).responseRate, 100);
  assert.equal(getApplicationMetrics([{ status: 'saved' }]).responseRate, 0);
  assert.equal(getApplicationMetrics().totalApplications, 0);
});

test('application edits discard joined rows, identity and caller-controlled timestamps', () => {
  const result = getApplicationUpdates({
    id: 'other', user_id: 'other-user', resumes: { id: 'joined' }, created_at: 'bad',
    applied_at: 'bad', response_at: 'bad', company: ' Company ', notes: 'New notes', resume_id: '',
  });
  assert.deepEqual(result, { company: 'Company', resume_id: null, notes: 'New notes' });
});

test('status transitions set truthful timestamps and do not count withdrawal as a response', () => {
  const timestamp = '2026-09-04T12:00:00.000Z';
  assert.deepEqual(getApplicationUpdates({ status: 'screening' }, { status: 'saved' }, timestamp), { status: 'screening', applied_at: timestamp, response_at: timestamp });
  assert.deepEqual(getApplicationUpdates({ status: 'withdrawn' }, { status: 'applied', applied_at: '2026-09-01' }, timestamp), { status: 'withdrawn' });
  assert.deepEqual(getApplicationUpdates({ status: 'saved' }, { status: 'applied' }, timestamp), { status: 'saved', applied_at: null, response_at: null });
  assert.deepEqual(getApplicationUpdates({ status: 'offer' }, { status: 'interview', applied_at: '2026-08-01', response_at: '2026-08-03' }, timestamp), { status: 'offer' });
});

test('application edits reject blank required fields and unsupported statuses', () => {
  assert.throws(() => getApplicationUpdates({ company: '  ' }), /Company is required/);
  assert.throws(() => getApplicationUpdates({ position: '' }), /Position is required/);
  assert.throws(() => getApplicationUpdates({ status: 'phone_screen' }), /Invalid application status/);
  for (const job_url of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:secret@example.com', 'not a URL']) {
    assert.throws(() => getApplicationUpdates({ job_url }), /valid HTTP or HTTPS link/);
  }
  assert.equal(getApplicationUpdates({ job_url: ' https://example.com/jobs/1 ' }).job_url, 'https://example.com/jobs/1');
});
