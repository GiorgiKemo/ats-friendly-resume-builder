import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInboxEvent,
  buildDedupeKey,
  computeHuntStats,
  mergeStatus,
  normalizeInboxPart,
  reduceInboxEvents,
  shouldCreateApplication,
} from '../src/utils/jobInboxDedupe.js';

test('normalize and buildDedupeKey are stable for company+role', () => {
  assert.equal(normalizeInboxPart('  Acme   Corp!! '), 'acme corp');
  assert.equal(buildDedupeKey('Acme Corp', 'Product Designer'), 'acme corp|product designer');
  assert.equal(buildDedupeKey('Acme', ''), null);
  assert.equal(buildDedupeKey('', 'Engineer'), null);
});

test('send + receipt + interview for same company+role counts as one application', () => {
  const events = [
    {
      category: 'application_sent',
      company_guess: 'Acme',
      position_guess: 'Designer',
      gmail_thread_id: 't1',
      confidence: 0.9,
      internal_date: '2026-01-01T10:00:00.000Z',
      synthetic_id: 'a1',
    },
    {
      category: 'application_receipt',
      company_guess: 'Acme',
      position_guess: 'Designer',
      gmail_thread_id: 't1',
      confidence: 0.95,
      internal_date: '2026-01-01T11:00:00.000Z',
    },
    {
      category: 'interview',
      company_guess: 'Acme',
      position_guess: 'Designer',
      gmail_thread_id: 't1',
      confidence: 0.92,
      internal_date: '2026-01-05T09:00:00.000Z',
    },
  ];
  const { applications, createdCount, updatedCount } = reduceInboxEvents(events);
  assert.equal(applications.length, 1);
  assert.equal(createdCount, 1);
  assert.equal(updatedCount, 1); // interview upgrade (receipt may no-op status)
  assert.equal(applications[0].status, 'interview');
  const stats = computeHuntStats(applications);
  assert.equal(stats.totalApplied, 1);
  assert.equal(stats.interviews, 1);
  assert.equal(stats.gotReply, 1);
});

test('follow-up outbound emails do not create a second application', () => {
  const seed = [{
    id: 'a1',
    company: 'Acme',
    position: 'Designer',
    status: 'applied',
    dedupe_key: 'acme|designer',
    gmail_thread_id: 't1',
  }];
  const { applications, createdCount } = reduceInboxEvents([
    {
      category: 'noise',
      company_guess: 'Acme',
      position_guess: 'Designer',
      gmail_thread_id: 't1',
      confidence: 0.9,
    },
    {
      category: 'application_sent',
      company_guess: 'Acme',
      position_guess: 'Designer',
      gmail_thread_id: 't1',
      confidence: 0.9,
    },
  ], seed);
  assert.equal(createdCount, 0);
  assert.equal(applications.length, 1);
  assert.equal(computeHuntStats(applications).totalApplied, 1);
});

test('two roles at the same company count as two applications', () => {
  const { applications } = reduceInboxEvents([
    {
      category: 'application_sent',
      company_guess: 'Acme',
      position_guess: 'Designer',
      confidence: 0.9,
      synthetic_id: 'd1',
    },
    {
      category: 'application_sent',
      company_guess: 'Acme',
      position_guess: 'Product Manager',
      confidence: 0.9,
      synthetic_id: 'd2',
    },
  ]);
  assert.equal(applications.length, 2);
  assert.equal(computeHuntStats(applications).totalApplied, 2);
});

test('rejection after apply upgrades the same application without doubling', () => {
  const { applications } = reduceInboxEvents([
    {
      category: 'application_receipt',
      company_guess: 'Stripe',
      position_guess: 'Engineer',
      gmail_thread_id: 't2',
      confidence: 0.9,
      synthetic_id: 's1',
    },
    {
      category: 'rejection',
      company_guess: 'Stripe',
      position_guess: 'Engineer',
      gmail_thread_id: 't2',
      confidence: 0.88,
    },
  ]);
  assert.equal(applications.length, 1);
  assert.equal(applications[0].status, 'rejected');
  const stats = computeHuntStats(applications);
  assert.equal(stats.totalApplied, 1);
  assert.equal(stats.rejections, 1);
  assert.equal(stats.gotReply, 1);
});

test('reply alone without matching application does not invent a new applied row', () => {
  const { applications, created, skipped } = applyInboxEvent([], {
    category: 'reply',
    company_guess: 'Unknown Co',
    position_guess: 'Role',
    confidence: 0.9,
  });
  assert.equal(applications.length, 0);
  assert.equal(created, null);
  assert.equal(skipped, true);
  assert.equal(shouldCreateApplication('reply'), false);
  assert.equal(shouldCreateApplication('application_sent'), true);
});

test('mergeStatus never downgrades and never overwrites offer with rejection', () => {
  assert.equal(mergeStatus('applied', 'interview', { confidence: 0.9 }), 'interview');
  assert.equal(mergeStatus('interview', 'reply', { confidence: 0.9 }), null);
  assert.equal(mergeStatus('offer', 'rejection', { confidence: 0.9 }), null);
  assert.equal(mergeStatus('applied', 'interview', { confidence: 0.2 }), null);
  assert.equal(mergeStatus('applied', 'interview', { confidence: 0.2, force: true }), 'interview');
});

test('computeHuntStats excludes saved and does not count email events', () => {
  const stats = computeHuntStats([
    { status: 'saved' },
    { status: 'applied' },
    { status: 'applied' },
    { status: 'screening', response_at: '2026-01-02' },
    { status: 'interview' },
    { status: 'offer' },
    { status: 'rejected' },
  ]);
  assert.equal(stats.totalApplied, 6);
  assert.equal(stats.saved, 1);
  assert.equal(stats.waiting, 2);
  assert.equal(stats.interviews, 2);
  assert.equal(stats.offers, 1);
  assert.equal(stats.rejections, 1);
  assert.equal(stats.gotReply, 4);
  assert.equal(stats.replyRate, 67);
  assert.equal(stats.interviewRate, 33);
});

test('low-confidence interview does not mutate status until forced', () => {
  const seed = [{
    id: 'a1',
    company: 'Acme',
    position: 'Designer',
    status: 'applied',
    dedupe_key: 'acme|designer',
    gmail_thread_id: 't1',
  }];
  const low = applyInboxEvent(seed, {
    category: 'interview',
    company_guess: 'Acme',
    position_guess: 'Designer',
    gmail_thread_id: 't1',
    confidence: 0.4,
  });
  assert.equal(low.updated, null);
  assert.equal(low.applications[0].status, 'applied');
});
