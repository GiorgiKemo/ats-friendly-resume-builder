import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHuntStats, mapStatsFromRpc, reduceInboxEvents } from '../src/utils/jobInboxDedupe.js';

test('rates always use the deduped application set for the selected range', () => {
  const { applications } = reduceInboxEvents([
    { category: 'application_sent', company_guess: 'A', position_guess: 'X', confidence: 0.9, synthetic_id: '1' },
    { category: 'application_receipt', company_guess: 'A', position_guess: 'X', confidence: 0.9 },
    { category: 'interview', company_guess: 'A', position_guess: 'X', confidence: 0.9 },
    { category: 'application_sent', company_guess: 'B', position_guess: 'Y', confidence: 0.9, synthetic_id: '2' },
    { category: 'rejection', company_guess: 'B', position_guess: 'Y', confidence: 0.9 },
    { category: 'application_sent', company_guess: 'C', position_guess: 'Z', confidence: 0.9, synthetic_id: '3' },
  ]);
  // 3 applications despite 6 emails
  assert.equal(applications.length, 3);
  const stats = computeHuntStats(applications);
  assert.equal(stats.totalApplied, 3);
  assert.equal(stats.gotReply, 2);
  assert.equal(stats.interviews, 1);
  assert.equal(stats.rejections, 1);
  assert.equal(stats.waiting, 1); // C still applied
  assert.equal(stats.replyRate, 67);
  assert.equal(stats.interviewRate, 33);
});

test('mapStatsFromRpc mirrors computeHuntStats field names', () => {
  const mapped = mapStatsFromRpc({
    total_applied: 10,
    got_reply: 4,
    interviews: 2,
    waiting: 5,
    rejections: 3,
    offers: 1,
    withdrawn: 0,
    saved: 2,
    reply_rate: 40,
    interview_rate: 20,
  });
  assert.deepEqual(mapped, {
    totalApplied: 10,
    gotReply: 4,
    interviews: 2,
    waiting: 5,
    rejections: 3,
    offers: 1,
    withdrawn: 0,
    saved: 2,
    replyRate: 40,
    interviewRate: 20,
  });
  assert.deepEqual(mapStatsFromRpc(null).totalApplied, 0);
});

test('saved roles never inflate total applied or rates', () => {
  const stats = computeHuntStats([
    { status: 'saved' },
    { status: 'saved' },
    { status: 'applied' },
  ]);
  assert.equal(stats.totalApplied, 1);
  assert.equal(stats.saved, 2);
  assert.equal(stats.replyRate, 0);
  assert.equal(stats.interviewRate, 0);
});
