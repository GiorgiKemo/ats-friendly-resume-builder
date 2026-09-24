import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const manifestPath = 'docs/admin-dashboard-plan/evidence/analytics-emission-coverage.json';
const coverage = JSON.parse(await readFile(path.join(root, manifestPath), 'utf8'));
const trackedSymbols = coverage.callSiteCounts.map(({ symbol }) => symbol);

async function listFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(relativePath);
    return /\.(?:[cm]?[jt]sx?|sql)$/.test(entry.name) ? [relativePath] : [];
  }));
  return nested.flat();
}

const sourceFiles = (await Promise.all(['src', 'supabase/functions', 'supabase/migrations'].map(listFiles))).flat();

test('analytics coverage manifest accounts for every known helper callsite', async () => {
  const actualCounts = new Map(trackedSymbols.map((symbol) => [symbol, 0]));
  const invocationPatterns = new Map(trackedSymbols.map((symbol) => [symbol, new RegExp(`\\b${symbol}\\s*\\(`, 'g')]));

  for (const file of sourceFiles) {
    const source = await readFile(path.join(root, file), 'utf8');
    for (const [symbol, pattern] of invocationPatterns) {
      for (const match of source.matchAll(pattern)) {
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        const lineEnd = source.indexOf('\n', match.index);
        const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
        if (/\b(?:async\s+)?function\s+$/.test(line.slice(0, match.index - lineStart))) continue;
        actualCounts.set(symbol, actualCounts.get(symbol) + 1);
      }
    }
  }

  assert.deepEqual(
    Object.fromEntries(actualCounts),
    Object.fromEntries(coverage.callSiteCounts.map(({ symbol, count }) => [symbol, count])),
  );
});

test('analytics direct emitters and database event triggers retain their documented source markers', async () => {
  for (const check of coverage.sourceChecks) {
    const source = await readFile(path.join(root, check.file), 'utf8');
    const occurrences = source.split(check.marker).length - 1;
    assert.equal(occurrences, check.count, `${check.file} marker ${JSON.stringify(check.marker)}`);
  }

  for (const check of coverage.directCallCounts) {
    let occurrences = 0;
    const pattern = new RegExp(check.pattern, 'g');
    for (const file of sourceFiles) {
      const source = await readFile(path.join(root, file), 'utf8');
      occurrences += [...source.matchAll(pattern)].length;
      pattern.lastIndex = 0;
    }
    assert.equal(occurrences, check.count, check.description);
  }

  for (const check of coverage.eventArgumentCounts) {
    let occurrences = 0;
    const pattern = new RegExp(`\\b${check.symbol}\\s*\\(\\s*['"]${check.event}['"]`, 'g');
    for (const file of sourceFiles) {
      const source = await readFile(path.join(root, file), 'utf8');
      occurrences += [...source.matchAll(pattern)].length;
      pattern.lastIndex = 0;
    }
    assert.equal(occurrences, check.count, `${check.symbol} event ${check.event}`);
  }

  for (const check of coverage.serverEventFieldCounts) {
    let occurrences = 0;
    const pattern = new RegExp(`eventName:\\s*['"]${check.event}['"]`, 'g');
    for (const file of sourceFiles) {
      const source = await readFile(path.join(root, file), 'utf8');
      occurrences += [...source.matchAll(pattern)].length;
      pattern.lastIndex = 0;
    }
    assert.equal(occurrences, check.count, `server event ${check.event}`);
  }
});
