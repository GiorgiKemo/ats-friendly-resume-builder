import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { runPsql } from '../scripts/lib/run-psql.mjs';

test('psql runner drains all successful output before resolving', async () => {
  const length = 512 * 1024;
  const output = await runPsql(process.execPath, ['-e', `process.stdin.resume(); process.stdout.write('x'.repeat(${length}) + 'FINAL_ROW');`], 'SELECT 1;');
  assert.equal(output.length, length + 'FINAL_ROW'.length);
  assert.ok(output.endsWith('FINAL_ROW'));
});

test('psql runner retains trailing conflict diagnostics across concurrent failures', async () => {
  const length = 256 * 1024;
  const results = await Promise.allSettled(Array.from({ length: 16 }, () => runPsql(process.execPath, [
    '-e', `process.stdin.resume(); process.stderr.write('x'.repeat(${length}) + '\\nPT409: PROFILE_CONFLICT'); process.exitCode = 1;`,
  ], 'SELECT conflicting_save();')));
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.ok(result.reason.message.length >= length);
    assert.match(result.reason.message, /PT409: PROFILE_CONFLICT \(code=1, signal=none\)$/);
  }
});

test('psql runner rejects unavailable binaries and preserves exit diagnostics', async () => {
  await assert.rejects(runPsql('resumeats-deliberately-missing-binary', [], ''), /ENOENT/);
  await assert.rejects(runPsql(process.execPath, ['-e', 'process.stdin.resume(); process.exitCode = 2;'], ''), /psql exited without stderr \(code=2, signal=none\)/);
});
