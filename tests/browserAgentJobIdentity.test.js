import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual matcher and its preparation/cached-snapshot callsites.
// Only frame capture is synthetic; no browser, app or provider is contacted.
const source = readFileSync(new URL('../browser-agent/background.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('background.js', source, ts.ScriptTarget.Latest, true);
const selected = new Set(['normalizeUrl', 'urlsMatch', 'snapshotMatchesTab', 'ensureSnapshotForTab', 'prepareActiveTabAutofillContext', 'performActiveTabAutofillParallel']);
const functions = [];
const collect = (node) => {
  if (ts.isVariableDeclaration(node) && selected.has(node.name.getText(parsed))) {
    functions.push(`const ${node.name.getText(parsed)} = ${node.initializer.getText(parsed)};`);
  }
  ts.forEachChild(node, collect);
};
collect(parsed);
assert.equal(functions.length, selected.size);

function setup({ captureFails = false, state = {}, actionTab = {} } = {}) {
  const captures = [];
  const fills = [];
  const api = vm.runInNewContext(`${functions.join('\n')}\n({ ${[...selected].join(', ')} })`, {
    URL,
    isInspectableJobTab: (tab) => Boolean(tab?.url?.startsWith('https://jobs.example/')),
    captureJobPostingFromTab: async (tab) => {
      captures.push(tab.url);
      if (captureFails) throw new Error('Page unavailable');
      return { url: tab.url, title: 'Fresh application page' };
    },
    getVerifiedAutofillState: async () => state,
    getResumeSelectionForTab: async () => ({ ownerId: 'owner-a', jobSnapshot: { url: actionTab.url, title: actionTab.title, company: '' }, selection: { resume: { id: 'selected', revision: 1 } } }),
    getMissingAutofillProfileFields: () => [],
    resolveActionTab: async () => actionTab,
    prepareResumeForJob: () => { throw new Error('Unexpected generation attempt'); },
    getProfileWithoutResumeUpload: (profile) => profile,
    autofillTabWithFallbacks: async (_tabId, payload) => { fills.push(payload); return { ok: true, filledCount: 1 }; },
    mergeParallelAutofillResponses: (_early, final) => final,
    getState: async () => state,
    getStateSummary: (value) => value,
  });
  return { ...api, captures, fills };
}

test('a prepared resume for job 1 cannot satisfy job 10 or a different origin/path', () => {
  const app = setup();
  const prepared = { documents: { resumePdfUrl: 'synthetic-pdf', preparedForUrl: 'https://jobs.example/jobs/1' } };
  for (const target of ['https://jobs.example/jobs/10', 'https://jobs.example/jobs/1-other', 'https://other.example/jobs/1']) {
    assert.equal(app.urlsMatch(prepared.documents.preparedForUrl, target), false);
  }
  assert.equal(app.urlsMatch('https://jobs.example', 'https://jobs.example.evil.test'), false);
});

test('identity-bearing query parameters and SPA fragments are preserved rather than prefix matched', () => {
  const app = setup();
  for (const [left, right] of [
    ['https://jobs.example/apply?jobId=1', 'https://jobs.example/apply?jobId=10'],
    ['https://jobs.example/apply?jobId=1', 'https://jobs.example/apply?jobId=1&opening=2'],
    ['https://jobs.example/#/jobs/1', 'https://jobs.example/#/jobs/10'],
  ]) assert.equal(app.urlsMatch(left, right), false);
});

test('same HTTP(S) identity tolerates URL case/default port and a trailing path slash only', () => {
  const app = setup();
  assert.equal(app.urlsMatch('https://JOBS.example:443/jobs/1', 'https://jobs.example/jobs/1/'), true);
  assert.equal(app.urlsMatch('https://jobs.example/jobs/1/?jobId=1#apply', 'https://jobs.example/jobs/1?jobId=1#apply'), true);
  assert.equal(app.urlsMatch('http://jobs.example/jobs/1', 'https://jobs.example/jobs/1'), false);
  for (const value of ['', 'not a URL', 'javascript:alert(1)', 'https://user:secret@jobs.example/jobs/1']) {
    assert.equal(app.urlsMatch(value, value), false);
  }
});

test('the actual snapshot callback scans job 10 instead of returning cached job 1 facts', async () => {
  const app = setup();
  const previous = { url: 'https://jobs.example/jobs/1', title: 'Old role' };
  const result = await app.ensureSnapshotForTab({ url: 'https://jobs.example/jobs/10' }, { lastJobSnapshot: previous });
  assert.equal(result.title, 'Fresh application page');
  assert.deepEqual(app.captures, ['https://jobs.example/jobs/10']);
});

test('a changed apply route remains capturable but does not inherit unverified cached facts', async () => {
  const app = setup();
  const previous = { url: 'https://jobs.example/jobs/1', title: 'Original listing' };
  const application = { url: 'https://jobs.example/jobs/1/apply?jobId=1' };
  const result = await app.ensureSnapshotForTab(application, { lastJobSnapshot: previous });
  assert.equal(result.url, application.url);
  assert.equal(app.captures.length, 1);
  assert.equal(app.urlsMatch(previous.url, application.url), false);
});

test('failed capture on a mismatched application does not fall back to another job snapshot', async () => {
  const app = setup({ captureFails: true });
  const result = await app.ensureSnapshotForTab({ url: 'https://jobs.example/jobs/10' }, {
    lastJobSnapshot: { url: 'https://jobs.example/jobs/1', title: 'Wrong candidate target' },
  });
  assert.equal(result, null);
  assert.equal(app.captures.length, 1);
});

test('matching cached pages avoid redundant capture and app-tab recent-import behavior is preserved', async () => {
  const app = setup();
  const previous = { url: 'https://jobs.example/jobs/1', title: 'Original listing' };
  assert.equal(await app.ensureSnapshotForTab({ url: previous.url }, { lastJobSnapshot: previous }), previous);
  assert.equal(await app.ensureSnapshotForTab({ url: 'https://resumeats.cv/#/ai-generator' }, { lastJobSnapshot: previous }), previous);
  assert.deepEqual(app.captures, []);
});

for (const parallel of [false, true]) test(`${parallel ? 'autofill' : 'preparation'} caller uses selected job facts, never a mismatched recent cache`, async () => {
  const actionTab = { id: 3, url: 'https://jobs.example/jobs/10', title: 'Current application' };
  const state = {
    profile: { candidate: { userId: 'owner-a' }, documents: { resumePdfUrl: 'synthetic-pdf', preparedForUrl: actionTab.url } },
    lastJobSnapshot: { url: 'https://jobs.example/jobs/1', title: 'Wrong title', company: 'Wrong company', description: 'Wrong description' },
  };
  const app = setup({ captureFails: true, actionTab, state });
  const result = parallel ? await app.performActiveTabAutofillParallel({}) : await app.prepareActiveTabAutofillContext({});
  const job = parallel ? app.fills[0].job : result.activeJob;
  assert.equal(job.title, actionTab.title);
  assert.equal(job.company, '');
  assert.equal(job.description, undefined);
  assert.equal(app.captures.length, 0);
});
