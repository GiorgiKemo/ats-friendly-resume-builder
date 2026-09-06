import test from 'node:test';
import assert from 'node:assert/strict';
import { autoApplyRunStatus } from '../src/utils/autoApplyRunStatus.js';

test('expired discovery runs stop claiming to be active without inventing a successful outcome', () => {
  const started_at = '2026-09-07T10:00:00Z';
  const now = Date.parse(started_at) + 16 * 60 * 1000;
  assert.equal(autoApplyRunStatus({ status: 'running', started_at }, now), 'interrupted');
  assert.equal(autoApplyRunStatus({ status: 'running', started_at }, now - 120000), 'running');
  assert.equal(autoApplyRunStatus({ status: 'completed', started_at }, now), 'completed');
  assert.equal(autoApplyRunStatus({ status: 'failed', started_at }, now), 'failed');
});
