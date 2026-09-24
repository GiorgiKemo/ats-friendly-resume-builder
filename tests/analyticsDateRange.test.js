import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const { exports } = loadEdgeFunction('src/utils/analyticsDateRange.js');

test('analytics date inputs use the configured reporting timezone rather than the browser timezone', () => {
  assert.equal(
    exports.formatDateInputValueInTimeZone(new Date('2026-09-24T21:30:00.000Z'), 'Asia/Tbilisi'),
    '2026-09-25',
  );
  assert.equal(
    exports.formatDateInputValueInTimeZone(new Date('2026-09-24T21:30:00.000Z'), 'UTC'),
    '2026-09-24',
  );
});

test('analytics window timestamps display at the reporting timezone boundary', () => {
  assert.equal(
    exports.formatAnalyticsTimestamp('2026-09-23T20:00:00.000Z', 'Asia/Tbilisi'),
    '2026-09-24 00:00',
  );
  assert.equal(
    exports.formatAnalyticsTimestamp('2026-09-23T20:00:00.000Z', 'UTC'),
    '2026-09-23 20:00',
  );
});

test('selected Tbilisi calendar days map to their exact half-open UTC interval', () => {
  const range = exports.getAnalyticsDateRange('2026-09-24', '2026-09-24', 'Asia/Tbilisi');
  assert.equal(range.from, '2026-09-23T20:00:00.000Z');
  assert.equal(range.to, '2026-09-24T20:00:00.000Z');
  assert.equal(range.timeZone, 'Asia/Tbilisi');
});

test('analytics date shifting and range construction preserve calendar-day boundaries', () => {
  assert.equal(exports.shiftDateInputValue('2026-10-01', -30), '2026-09-01');
  const range = exports.getAnalyticsDateRange('2026-01-01', '2026-01-02', 'UTC');
  assert.equal(range.from, '2026-01-01T00:00:00.000Z');
  assert.equal(range.to, '2026-01-03T00:00:00.000Z');
  assert.equal(range.timeZone, 'UTC');
});

test('invalid analytics dates, reversed ranges, and unsupported timezones fail closed', () => {
  assert.throws(() => exports.getAnalyticsDateRange('2026-02-30', '2026-03-01'), /valid analytics date/);
  assert.throws(() => exports.getAnalyticsDateRange('2026-03-02', '2026-03-01'), /must not follow/);
  assert.throws(() => exports.getAnalyticsDateRange('2026-03-01', '2026-03-01', 'Europe/Paris'), /Unsupported/);
});
