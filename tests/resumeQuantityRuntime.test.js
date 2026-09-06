import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { setTimeout, clearTimeout } from 'node:timers';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';

// This is a generous responsiveness deadline, not a timing/throughput benchmark.
// A worker keeps regressions from hanging the test runner and is always terminated.
const scanInWorker = async (input) => {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    import(workerData.moduleUrl).then(({ resumeQuantityTokens }) => {
      parentPort.postMessage(resumeQuantityTokens(workerData.input));
    });
  `, { eval: true, workerData: { input, moduleUrl: new URL('../src/utils/resumeQuantities.js', import.meta.url).href } });
  let deadline;
  try {
    return await new Promise((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Quantity scan exceeded the 5-second responsiveness deadline')), 5000);
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => { if (code !== 0) reject(new Error(`Quantity worker exited ${code}`)); });
    });
  } finally {
    clearTimeout(deadline);
    await worker.terminate();
  }
};

const cases = [
  ['the original whitespace near miss', `A${' '.repeat(4000)}Z`, 0],
  ['maximum-source mixed whitespace', `A${' \t\n'.repeat(9999)}Z`, 0],
  ['maximum-source English number near miss', `${'one '.repeat(7498)}Z`, 0],
  ['maximum-source numeric range near miss', `${'9'.repeat(29990)}Z`, 1],
  ['maximum-source Japanese duration near miss', `${'一'.repeat(29990)}Z`, 0],
];
for (const [label, input, count] of cases) {
  test(`quantity scanner handles ${label} without blocking`, { timeout: 15000 }, async () => {
    assert.equal((await scanInWorker(input)).length, count);
  });
}

test('scanner-only whitespace normalization never changes returned source or proposal text', () => {
  const original = 'Handled  12\n\trequests.';
  const proposed = 'Served\t 12  requests.\n\n';
  const source = { workExperience: [{ title: 'Analyst', company: 'Cedar', description: original }] };
  const candidate = (description) => ({ workExperience: [{ title: 'Analyst', company: 'Cedar', description }] });
  assert.equal(enforceAuthenticResumeSections(candidate(proposed), source).workExperience[0].description, proposed);
  assert.equal(enforceAuthenticResumeSections(candidate('Served 13 requests.'), source).workExperience[0].description, original);
});

test('exponent scan normalization preserves exact source and accepted proposal strings', () => {
  const original = 'Handled  10³ requests with ±5% variance.\n';
  const proposed = 'Served\t10³ requests with ±5% variance.\n\n';
  const source = { workExperience: [{ title: 'Analyst', company: 'Cedar', description: original }] };
  const candidate = (description) => ({ workExperience: [{ title: 'Analyst', company: 'Cedar', description }] });
  assert.equal(enforceAuthenticResumeSections(candidate(proposed), source).workExperience[0].description, proposed);
  assert.equal(enforceAuthenticResumeSections(candidate('Served 103 requests with 5% variance.'), source).workExperience[0].description, original);
});
