import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteMigrationVersions } from '../scripts/productionMigrationStatus.js';

test('production migration comparison uses remote versions, never local-only entries', () => {
  const remote = remoteMigrationVersions([
    { local: '20260923000001', remote: '20260923000001' },
    { local: '20260923000002', remote: '' },
    { local: '20260923000003', remote: null },
  ]);

  assert.deepEqual([...remote], ['20260923000001']);
  assert.equal(remote.has('20260923000002'), false);
  assert.equal(remote.has('20260923000003'), false);
});

test('production migration comparison accepts remote-only versions and plain version rows', () => {
  const remote = remoteMigrationVersions([
    { local: '', remote: '20260923000004' },
    { version_id: '20260923000005' },
    '20260923000006',
    { local: 'not-a-version', remote: 'bad' },
  ]);

  assert.deepEqual([...remote], ['20260923000004', '20260923000005', '20260923000006']);
});
