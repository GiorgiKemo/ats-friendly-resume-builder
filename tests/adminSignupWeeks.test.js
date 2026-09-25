import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSignupWeeks, resolveSignupWeeks } from '../src/utils/adminSignupWeeks.js';

const now = new Date('2026-09-26T12:00:00.000Z');

test('signup weeks are the five UTC weeks ending with the current week', () => {
  const weeks = buildSignupWeeks([
    '2026-08-23T23:00:00.000Z',
    '2026-08-24T00:00:00.000Z',
    '2026-09-20T18:00:00.000Z',
    '2026-09-26T01:00:00.000Z',
    'not-a-date',
  ], now);

  assert.deepEqual(weeks.map((week) => week.label), ['Aug 24', 'Aug 31', 'Sep 7', 'Sep 14', 'Sep 21']);
  assert.deepEqual(weeks.map((week) => week.count), [1, 0, 0, 1, 1]);
});

test('a partial directory does not invent a signup chart', () => {
  assert.equal(resolveSignupWeeks({
    signupWeeks: null,
    createdAts: ['2026-09-26T01:00:00.000Z'],
    complete: false,
    now,
  }), null);
});

test('a complete directory builds the chart when the server series is absent', () => {
  const weeks = resolveSignupWeeks({
    createdAts: ['2026-09-26T01:00:00.000Z'],
    complete: true,
    now,
  });
  assert.equal(weeks.at(-1).count, 1);
  assert.equal(weeks.at(-1).label, 'Sep 21');
});
