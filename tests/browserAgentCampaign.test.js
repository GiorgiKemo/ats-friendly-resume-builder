import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCampaign, mergeApplicationQueue, attemptsToday, campaignCanRun } from '../browser-agent/campaign.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import '../browser-agent/saved-answers.js';

const ownerId = 'candidate-a';
const appTab = { id: 1, url: 'https://resumeats.cv/auto-apply', status: 'complete' };
const jobs = [1, 2].map(id => ({ id: `job-${id}`, url: `https://jobs.example/${id}`, title: `Job ${id}`, status: 'queued' }));
const profile = { version: '2026-09-04', candidate: { userId: ownerId, fullName: 'Alex Morgan', email: 'alex@example.com', phone: '+15550123', location: 'Remote' }, documents: {} };
const options = { confirmed: true, resumeId: 'resume-1', expectedRevision: 3, mode: 'prepare', limit: 10 };

async function setup({ response = { ok: true, needsReview: true, reviewFields: [{ label: 'Start date', reason: 'Missing answer' }] } } = {}) {
  const local = { resumeatsBrowserAgentState: { profile, queue: structuredClone(jobs), isRunning: false } };
  const session = {};
  const tabs = new Map([[1, appTab]]);
  const calls = [];
  let handler, alarmHandler;
  let nextTabId = 2;
  let identity = ownerId;
  const store = target => ({ async get(key) { return { [key]: structuredClone(target[key]) }; }, async set(values) { Object.assign(target, structuredClone(values)); }, async remove(key) { delete target[key]; } });
  const chrome = {
    runtime: { id: 'extension', getURL: path => `chrome-extension://extension/${path}`, getManifest: () => ({ version: '0.3.0', content_scripts: [{ js: ['content-app-bridge.js'], matches: ['https://resumeats.cv/*'] }] }),
      onInstalled: { addListener() {} }, onConnect: { addListener() {} }, onMessage: { addListener(fn) { handler = fn; } } },
    alarms: { async create() {}, async clear() {}, onAlarm: { addListener(fn) { alarmHandler = fn; } } },
    storage: { local: store(local), session: store(session) },
    tabs: { async query() { return [...tabs.values()]; }, get(id, callback) { const tab = tabs.get(id); if (callback) { callback(tab); return undefined; } return Promise.resolve(tab); },
      async create(config) { const tab = { ...config, id: nextTabId++, status: 'loading' }; tabs.set(tab.id, tab); return tab; },
      async update(id, config) { Object.assign(tabs.get(id), config); return tabs.get(id); }, async remove(id) { tabs.delete(id); },
      onUpdated: { addListener() {}, removeListener() {} }, onRemoved: { addListener() {}, removeListener() {} },
      async sendMessage(tabId, message, _options, callback) {
        calls.push({ tabId, ...message });
        let result = { ok: true };
        if (message.type === 'APP_AUTH_STATE_REQUEST') result.userId = identity;
        if (message.type === 'APP_VALIDATE_SAVED_RESUME_REQUEST') Object.assign(result, { ownerId: identity, resumeId: 'resume-1', revision: 3 });
        if (message.type === 'APP_PREPARE_SAVED_RESUME_REQUEST') {
          const binary = '%PDF-1.4\nsynthetic campaign fixture';
          const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(binary))).toString('hex');
          result = { status: 'ready', handoffId: message.payload.handoffId, jobKey: message.payload.jobKey, ownerId: identity,
            resume: { id: 'resume-1', revision: 3, title: 'Approved resume' },
            document: { mimeType: 'application/pdf', filename: 'Resume.pdf', rendererVersion: 'test', byteLength: binary.length, base64: btoa(binary), sha256, artifactId: `sha256:${sha256}` } };
        }
        if (message.type === 'AUTOFILL_APPLICATION') result = response;
        if (callback) callback(result);
        return result;
      } },
    scripting: { async executeScript() { return []; } },
  };
  const api = loadEdgeFunction('browser-agent/background.js', { globals: { chrome, setTimeout(fn, ms) { if (ms <= 1200) queueMicrotask(fn); return 1; }, clearTimeout() {} },
    expose: ['getState', 'queueNextJob', 'handleJobPageReady', 'authorizeCampaignAction', 'pauseCampaign'] }).exports;
  const sender = { id: 'extension', tab: appTab, url: appTab.url, frameId: 0 };
  const send = (type, payload, from = sender) => new Promise(resolve => handler({ type, payload }, from, resolve));
  const flush = async () => { for (let i = 0; i < 12; i++) await setImmediate(); };
  return { local, session, tabs, calls, api, send, flush, get alarm() { return alarmHandler; }, setIdentity(value) { identity = value; } };
}

test('campaign requires explicit mode, bounded limit, and saved revision', () => {
  const input = { ...options, ownerId, appTabId: 1, appOrigin: 'https://resumeats.cv' };
  for (const patch of [{ confirmed: false }, { mode: 'anything' }, { limit: 0 }, { limit: 51 }, { expectedRevision: 0 }]) assert.throws(() => createCampaign({ ...input, ...patch }, jobs));
  const campaign = createCampaign(input, jobs, 1000);
  assert.equal(campaignCanRun(campaign, { profile, campaign }, 2000), true);
  assert.equal(campaignCanRun(campaign, { profile, campaign }, campaign.expiresAt), false);
  assert.equal(campaignCanRun(campaign, { profile: { candidate: { userId: 'other' } }, campaign }, 2000), false);
});

test('rediscovery preserves completed and unresolved jobs across alternate IDs and tracking parameters', () => {
  const previous = [{ ...jobs[0], status: 'completed', submittedAt: '2026-09-07T10:00:00Z' }, { ...jobs[1], status: 'needs_review', tabId: 4 }];
  assert.deepEqual(mergeApplicationQueue(previous, [{ ...jobs[0], id: 'duplicate', url: `${jobs[0].url}?utm_source=feed` }, jobs[1]]), previous);
  assert.equal(mergeApplicationQueue(previous, [{ id: 'unsafe', url: 'javascript:alert(1)' }]).length, 2);
  assert.equal(attemptsToday([{ attemptedAt: '2026-09-07T23:59:59Z' }], Date.parse('2026-09-08T00:00:00Z')), 0);
});

test('saved answers match exact questions and employer scope without ambiguous fallback', () => {
  const resolve = globalThis.ResumeATSSavedAnswers.resolve;
  const entries = [{ question: 'When can you start?', answer: 'Two weeks' }, { question: 'When can you start?', answer: 'September 20', hostname: 'jobs.example' }];
  assert.equal(resolve('When can you start?', entries, 'jobs.example'), 'September 20');
  assert.equal(resolve('When can you start?', entries, 'another.example'), 'Two weeks');
  assert.equal(resolve('When can you start in Germany?', entries, 'jobs.example'), '');
  assert.equal(resolve('When can you start?', [...entries, { ...entries[1], answer: 'Tomorrow' }], 'jobs.example'), '');
});

test('campaign prepares one PDF, reuses it for the next job, and isolates review items', async () => {
  const app = await setup();
  const result = await app.send('START_CAMPAIGN', options);
  assert.equal(result.ok, undefined);
  assert.equal(result.campaign.mode, 'prepare');
  await app.flush();
  let state = await app.api.getState();
  const first = state.queue[0];
  await app.api.handleJobPageReady({}, { tab: app.tabs.get(first.tabId), frameId: 0 });
  await app.flush();
  state = await app.api.getState();
  assert.equal(state.queue[0].status, 'needs_review');
  assert.equal(state.queue[0].reviewFields[0].label, 'Start date');
  assert.equal(state.queue[1].status, 'opening');
  assert.equal(state.isRunning, true);
  await app.api.handleJobPageReady({}, { tab: app.tabs.get(state.queue[1].tabId), frameId: 0 });
  await app.flush();
  assert.equal(app.calls.filter(call => call.type === 'APP_PREPARE_SAVED_RESUME_REQUEST').length, 1);
  assert.equal(app.calls.filter(call => call.type === 'AUTOFILL_APPLICATION').length, 2);
  assert.equal((await app.api.getState()).isRunning, false);
  const status = await app.send('GET_STATE');
  assert.ok(!JSON.stringify(status).includes('base64'));
  assert.ok(!JSON.stringify(app.local).includes('base64'));
});

test('employer pages cannot start campaigns or change their queue', async () => {
  const app = await setup();
  const sender = { id: 'extension', tab: { id: 3, url: jobs[0].url }, url: jobs[0].url, frameId: 0 };
  for (const type of ['START_CAMPAIGN', 'RESUME_CAMPAIGN', 'RETRY_CAMPAIGN_JOB']) assert.equal((await app.send(type, options, sender)).ok, false);
  assert.equal(app.calls.length, 0);
});

test('daily limit covers started applications and does not stop at the first unresolved job', async () => {
  const app = await setup();
  await app.send('START_CAMPAIGN', { ...options, limit: 1 });
  await app.flush();
  const state = await app.api.getState();
  await app.api.handleJobPageReady({}, { tab: app.tabs.get(state.queue[0].tabId), frameId: 0 });
  await app.flush();
  const after = await app.api.getState();
  assert.equal(after.isRunning, false);
  assert.equal(after.queue[1].status, 'queued');
});

test('account changes clear campaign artifacts before another job can use them', async () => {
  const app = await setup();
  await app.send('START_CAMPAIGN', options);
  await app.flush();
  app.setIdentity('other-account');
  await app.send('RESUME_CAMPAIGN');
  assert.equal(Object.keys(app.session).length, 0);
  assert.equal((await app.api.getState()).profile, null);
});

test('concurrent submit authorization records one durable attempt and cannot be retried after a pause', async () => {
  const app = await setup({ response: { ok: true, pendingNavigation: true } });
  await app.send('START_CAMPAIGN', { ...options, mode: 'submit' });
  await app.flush();
  let state = await app.api.getState();
  const tab = app.tabs.get(state.queue[0].tabId);
  await app.api.handleJobPageReady({}, { tab, frameId: 0 });
  const sender = { id: 'extension', tab, url: tab.url, frameId: 0 };
  const payload = { campaignId: state.campaign.id, action: 'submit', targetUrl: tab.url };
  const results = await Promise.allSettled([app.api.authorizeCampaignAction(payload, sender), app.api.authorizeCampaignAction(payload, sender)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  state = await app.api.getState();
  assert.ok(state.queue[0].submitAttemptedAt);
  await app.send('PAUSE_CAMPAIGN');
  assert.equal((await app.send('RETRY_CAMPAIGN_JOB', { jobId: 'job-1' })).ok, false);
  await assert.rejects(app.api.authorizeCampaignAction(payload, sender), /paused|authorized/);
});

test('worker watchdog hands off an interrupted submission without repeating it', async () => {
  const app = await setup();
  await app.send('START_CAMPAIGN', options);
  await app.flush();
  const first = app.local.resumeatsBrowserAgentState.queue[0];
  first.submitAttemptedAt = new Date().toISOString();
  first.heartbeatAt = 0;
  app.alarm({ name: 'resumeats-campaign-watchdog' });
  await app.flush();
  const state = await app.api.getState();
  assert.equal(state.queue[0].status, 'needs_review');
  assert.ok(state.queue[0].submitAttemptedAt);
  assert.equal(app.calls.filter(call => call.type === 'AUTOFILL_APPLICATION').length, 0);
  assert.equal(state.queue[1].status, 'opening');
});

test('parallel queue wakeups reserve only one application tab', async () => {
  const app = await setup();
  await app.send('START_CAMPAIGN', options);
  await Promise.all([app.api.queueNextJob(), app.api.queueNextJob(), app.api.queueNextJob()]);
  await app.flush();
  const state = await app.api.getState();
  assert.equal(state.isRunning, true);
  assert.equal(state.queue.filter(job => job.status === 'opening').length, 1);
  assert.equal(app.tabs.size, 2);
});
