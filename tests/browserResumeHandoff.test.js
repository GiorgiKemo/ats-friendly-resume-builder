import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { deferred } from './helpers/componentHarness.js';
import { setImmediate } from 'node:timers/promises';
import { createResumeHandoffStore, HANDOFF_STORAGE_KEY, HANDOFF_TTL_MS, validateSavedResumeArtifact, canonicalJobUrl } from '../browser-agent/resume-handoff.js';

const stateKey = 'resumeatsBrowserAgentState';
const extensionId = 'synthetic-extension';
const profile = { version: '2026-09-04', candidate: { userId: 'owner-a', fullName: 'Alex Morgan', email: 'alex@example.com', phone: '+1 202 555 0100', location: 'Remote' }, documents: {} };
const pdf = Buffer.from('%PDF-1.4\n% Synthetic local test only\n%%EOF');
const sha256 = createHash('sha256').update(pdf).digest('hex');
const document = { artifactId: `sha256:${sha256}`, mimeType: 'application/pdf', filename: 'Alex_Morgan.pdf', byteLength: pdf.length, sha256, base64: pdf.toString('base64'), rendererVersion: 'resumeats-text-pdf-v1' };
const memoryArea = (values = {}) => ({
  values,
  async get(key) { return structuredClone({ [key]: values[key] }); },
  async set(next) { Object.assign(values, structuredClone(next)); },
  async remove(key) { delete values[key]; },
});

function setup({ session = memoryArea(), local = memoryArea(), onRequest, onGetTab, frames = [0, 3] } = {}) {
  let handler;
  let alarmHandler;
  const removedHandlers = new Set();
  let api;
  const messages = [];
  const updates = [];
  const alarms = [];
  const tabs = new Map([
    [1, { id: 1, url: 'https://resumeats.cv/#/dashboard', status: 'complete', active: false }],
    [2, { id: 2, url: 'https://jobs.example/jobs/1?opening=1', title: 'Engineer', status: 'complete', active: true }],
  ]);
  const controls = { owner: 'owner-a', revision: 3, responseChange: null };
  local.values[stateKey] ||= { profile, queue: [], isRunning: false, activeJobId: null, lastJobSnapshot: { url: tabs.get(2).url, title: 'Engineer', company: 'Synthetic', description: 'Source job facts' } };
  const chrome = {
    runtime: {
      id: extensionId, getURL: (part) => `chrome-extension://${extensionId}/${part}`,
      getManifest: () => ({ content_scripts: [{ js: ['content-app-bridge.js'], matches: ['https://resumeats.cv/*'] }] }),
      onInstalled: { addListener() {} }, onMessage: { addListener(fn) { handler = fn; } }, onConnect: { addListener() {} },
    },
    storage: { local, ...(session ? { session } : {}) },
    alarms: { async create(name, data) { alarms.push({ name, ...data }); }, onAlarm: { addListener(fn) { alarmHandler = fn; } } },
    scripting: { async executeScript(payload) { messages.push({ type: 'EXECUTE_SCRIPT', payload }); return [{ result: { ok: true, filledCount: 1 } }]; } },
    webNavigation: { getAllFrames(_details, callback) { callback(frames.map((frameId) => ({ frameId, url: tabs.get(2).url }))); } },
    tabs: {
      async query(options = {}) { return [...tabs.values()].filter((tab) => !options.active || tab.active); },
      get(id, callback) {
        if (callback) { callback(structuredClone(tabs.get(id))); return undefined; }
        return (async () => { await onGetTab?.(id, api, controls); if (!tabs.has(id)) throw new Error('No tab'); return structuredClone(tabs.get(id)); })();
      },
      async update(id, changes) {
        if (!tabs.has(id)) throw new Error('No tab');
        updates.push({ id, ...changes });
        if (changes.active) for (const tab of tabs.values()) tab.active = false;
        Object.assign(tabs.get(id), changes); return structuredClone(tabs.get(id));
      },
      async create() { throw new Error('Unexpected new tab'); },
      async remove(id) { tabs.delete(id); },
      onRemoved: { addListener(fn) { removedHandlers.add(fn); }, removeListener(fn) { removedHandlers.delete(fn); } },
      onUpdated: { addListener() {}, removeListener() {} },
      async sendMessage(tabId, message, options, callback) {
        messages.push({ tabId, ...structuredClone(message), frameId: options?.frameId });
        await onRequest?.(message, api, controls);
        if (message.type === 'APP_AUTH_STATE_REQUEST') return { ok: true, userId: controls.owner };
        if (message.type === 'APP_SYNC_PROFILE_REQUEST') return { ok: true, profile: { ...profile, candidate: { ...profile.candidate, userId: controls.owner } } };
        if (message.type === 'APP_VALIDATE_SAVED_RESUME_REQUEST') return controls.validationError || { ownerId: controls.owner, resumeId: message.payload.resumeId, revision: controls.revision };
        if (message.type === 'APP_PREPARE_SAVED_RESUME_REQUEST') {
          const response = { status: 'ready', handoffId: message.payload.handoffId, jobKey: message.payload.jobKey, ownerId: controls.owner, resume: { id: message.payload.resumeId, revision: controls.revision, title: 'Approved source resume' }, document };
          controls.responseChange?.(response); return response;
        }
        if (message.type.startsWith('APP_')) throw new Error(`Unexpected app operation ${message.type}`);
        const response = { ok: true, filledCount: 1, resumeAttached: options?.frameId === 0, requiresManualSubmission: true };
        callback?.(response); return response;
      },
    },
  };
  api = loadEdgeFunction('browser-agent/background.js', {
    expose: ['prepareActiveTabResume', 'getVerifiedHandoff', 'completeResumeHandoff', 'requestAutofillApplication', 'performActiveTabAutofillParallel', 'invalidateProfileSession', 'runMainWorldAutofill', 'handleJobPageReady', 'resumeHandoffs'],
    globals: { chrome, setTimeout(fn, ms) { if (ms <= 1200) queueMicrotask(fn); return 1; }, clearTimeout() {} },
  }).exports;
  const sender = () => ({ id: extensionId, url: tabs.get(1).url, tab: structuredClone(tabs.get(1)), frameId: 0 });
  const runtime = (type, payload, from = sender()) => new Promise((resolve) => handler({ type, payload }, from, resolve));
  const begin = () => api.prepareActiveTabResume({ tab: structuredClone(tabs.get(2)), frameId: 0 });
  const complete = (handoffId, version = 3) => api.completeResumeHandoff({ handoffId, resumeId: 'resume-a', expectedRevision: version }, sender());
  return { api, chrome, controls, tabs, messages, updates, alarms, local, session, sender, runtime, begin, complete, fireAlarm: () => alarmHandler({ name: 'resumeats-resume-handoff-expiry' }), removeTab: (id) => Promise.all([...removedHandlers].map((fn) => fn(id))) };
}

test('begin freezes one exact job and only opens app selection; it never generates, fills, saves or queues', async () => {
  const app = setup();
  const before = structuredClone(app.local.values[stateKey]);
  const begun = await app.begin();
  assert.equal(begun.status, 'review_required');
  assert.equal(begun.appTabId, 1);
  assert.match(app.tabs.get(1).url, /#\/ai-generator\?extensionRequest=/);
  assert.equal(app.alarms.length, 1);
  assert.deepEqual(app.local.values[stateKey], before);
  assert.deepEqual(app.messages.map((item) => item.type), ['APP_AUTH_STATE_REQUEST', 'APP_AUTH_STATE_REQUEST']);
  app.local.values[stateKey].lastJobSnapshot.description = 'Different later job';
  const got = await app.runtime('GET_RESUME_HANDOFF', { handoffId: begun.handoffId });
  assert.equal(got.jobSnapshot.description, 'Source job facts');
  assert.equal(got.expiresAt - got.createdAt, HANDOFF_TTL_MS);
  assert.equal(JSON.stringify(got).includes('base64'), false);
});

test('exact saved completion returns metadata, reuses acknowledgment and never fills or writes persistent artifacts', async () => {
  const app = setup(); const begun = await app.begin();
  const ready = await app.complete(begun.handoffId);
  assert.deepEqual(JSON.parse(JSON.stringify(ready)), { ok: true, status: 'ready', handoffId: begun.handoffId, resume: { id: 'resume-a', revision: 3, title: 'Approved source resume' } });
  await app.complete(begun.handoffId);
  assert.equal(app.messages.filter((m) => m.type === 'APP_PREPARE_SAVED_RESUME_REQUEST').length, 1);
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
  assert.equal(app.local.values[stateKey].queue.length, 0);
  assert.equal(JSON.stringify(app.local.values).includes(document.base64), false);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY].selection.document.base64, document.base64);
  assert.equal(JSON.stringify(await app.runtime('GET_STATE')).includes('base64'), false);
  assert.equal(JSON.stringify(await app.runtime('GET_RESUME_HANDOFF', { handoffId: begun.handoffId })).includes('base64'), false);
  await assert.rejects(app.complete(begun.handoffId, 4), /different version/);
});

test('missing selection fails before any partial fill, provider call or mainworld execution', async () => {
  const app = setup();
  await assert.rejects(app.api.performActiveTabAutofillParallel({ tab: app.tabs.get(2) }), { code: 'resume_selection_required' });
  await assert.rejects(app.api.runMainWorldAutofill(2, profile), { code: 'resume_selection_required' });
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION' || m.type === 'EXECUTE_SCRIPT' || m.type.includes('PREPARE')), false);
});

test('explicit autofill releases exact bytes only to original top frame; other frames get profile-only and cannot submit', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  const result = await app.api.requestAutofillApplication(2, { profile, job: { url: app.tabs.get(2).url }, autoSubmit: true, resumeAttachment: { artifact: 'forged' } });
  const fills = app.messages.filter((m) => m.type === 'AUTOFILL_APPLICATION');
  assert.equal(fills.length, 2); assert.equal(fills[0].frameId, 0);
  assert.equal(fills[0].payload.resumeAttachment.artifact.base64, document.base64);
  assert.equal(fills[1].payload.resumeAttachment, undefined);
  assert.equal(fills[1].payload.profileOnly, true);
  assert.ok(fills.every((m) => m.payload.autoSubmit === false));
  assert.ok(fills.every((m) => !JSON.stringify(m.payload.profile).includes('base64')));
  assert.equal(result.resumeAttached, true);
  assert.equal(app.messages.filter((m) => m.type === 'APP_PREPARE_SAVED_RESUME_REQUEST').length, 1);
});

test('legacy local document cleanup leaves the exact selected session PDF intact and out of every profile injection', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  const exactSession = structuredClone(app.session.values);
  const legacyProfile = { ...profile, documents: { resumePdfUrl: 'https://legacy.example/mutable.pdf?token=synthetic', resumePdfPath: 'owner-a/resume-a.pdf', preparedResumeTitle: 'Obsolete' } };
  app.local.values[stateKey].profile = legacyProfile;
  const summary = await app.runtime('GET_STATE');
  await setImmediate();
  assert.equal(summary.resumeSelection.resume.revision, 3);
  assert.equal(summary.resumeReady, undefined);
  assert.deepEqual(app.local.values[stateKey].profile.documents, {});
  assert.deepEqual(app.session.values, exactSession);
  await app.api.requestAutofillApplication(2, { profile: legacyProfile });
  await app.api.runMainWorldAutofill(2, legacyProfile);
  for (const message of app.messages.filter(item => item.type === 'AUTOFILL_APPLICATION')) {
    assert.deepEqual(message.payload.profile.documents, {});
    assert.ok(!JSON.stringify(message.payload.profile).includes('legacy.example'));
  }
  for (const message of app.messages.filter(item => item.type === 'EXECUTE_SCRIPT')) {
    assert.ok(!JSON.stringify(message.payload.args).includes('legacy.example'));
    assert.ok(!JSON.stringify(message.payload.args).includes(document.base64));
  }
  assert.deepEqual(app.session.values, exactSession);
});

for (const changed of ['https://jobs.example/jobs/10?opening=1', 'https://jobs.example/jobs/1?opening=10', 'https://jobs.example/jobs/1/apply?opening=1', 'https://jobs.example/jobs/1?opening=1#other']) test(`navigation invalidates selection: ${changed}`, async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  app.tabs.get(2).url = changed;
  await assert.rejects(app.api.requestAutofillApplication(2, { profile }), { code: 'resume_selection_required' });
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
});

test('a newer saved revision is rejected before attachment without rendering another PDF', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId); app.controls.revision = 4;
  await assert.rejects(app.api.requestAutofillApplication(2, { profile }), /saved resume changed/);
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
  assert.equal(app.messages.filter((m) => m.type.includes('PREPARE')).length, 1);
});

test('another app tab, employer page, subframe and forged extension cannot complete or read a handoff', async () => {
  const app = setup(); const begun = await app.begin();
  for (const from of [
    { ...app.sender(), tab: { id: 99, url: app.sender().url } },
    { ...app.sender(), url: app.tabs.get(2).url, tab: app.tabs.get(2) },
    { ...app.sender(), frameId: 3 }, { ...app.sender(), id: 'other-extension' },
  ]) {
    for (const type of ['GET_RESUME_HANDOFF', 'COMPLETE_RESUME_HANDOFF', 'CANCEL_RESUME_HANDOFF']) {
      const result = await app.runtime(type, { handoffId: begun.handoffId, resumeId: 'resume-a', expectedRevision: 3 }, from);
      assert.equal(result.ok, false);
    }
  }
  assert.equal(app.messages.some((m) => m.type.includes('PREPARE')), false);
});

test('owner changes during render cannot acknowledge or restore the session selection', async () => {
  const app = setup({ onRequest: async (message, api) => { if (message.type === 'APP_PREPARE_SAVED_RESUME_REQUEST') await api.invalidateProfileSession(); } });
  const begun = await app.begin();
  await assert.rejects(app.complete(begun.handoffId), /session changed/);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY], undefined);
  assert.equal(app.local.values[stateKey].profile, null);
});

test('cancellation and replacement defeat an in-flight completion; old callbacks cannot erase a new handoff', async () => {
  const entered = deferred(); const release = deferred();
  const app = setup({ onRequest: async (message) => { if (message.type === 'APP_PREPARE_SAVED_RESUME_REQUEST') { entered.resolve(); await release.promise; } } });
  const first = await app.begin(); const pending = app.complete(first.handoffId); await entered.promise;
  const second = await app.begin(); release.resolve();
  await assert.rejects(pending, /expired or was replaced/);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY].handoffId, second.handoffId);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY].selection, undefined);
});

test('duplicate concurrent completion renders once and uses one idempotent acknowledgment', async () => {
  const entered = deferred(); const release = deferred();
  const app = setup({ onRequest: async (message) => { if (message.type === 'APP_PREPARE_SAVED_RESUME_REQUEST') { entered.resolve(); await release.promise; } } });
  const begun = await app.begin(); const first = app.complete(begun.handoffId); await entered.promise;
  const second = app.complete(begun.handoffId); release.resolve();
  assert.deepEqual(await first, await second);
  assert.equal(app.messages.filter((m) => m.type.includes('PREPARE')).length, 1);
});

test('a slow earlier begin cannot overwrite the newer same-account selection', async () => {
  const entered = deferred(); const release = deferred(); let firstIdentity = true;
  const app = setup({ onRequest: async (message) => {
    if (message.type === 'APP_AUTH_STATE_REQUEST' && firstIdentity) { firstIdentity = false; entered.resolve(); await release.promise; }
  } });
  const first = app.begin(); await entered.promise;
  const newer = await app.begin(); release.resolve();
  await assert.rejects(first, /newer resume selection/);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY].handoffId, newer.handoffId);
  assert.match(app.tabs.get(1).url, new RegExp(newer.handoffId));
});

test('cold-profile handoff autofill requests contact-only sync with no default PDF preparation', async () => {
  const app = setup(); app.local.values[stateKey].profile = null;
  const begun = await app.begin(); await app.complete(begun.handoffId);
  await app.api.performActiveTabAutofillParallel({ tab: app.tabs.get(2) });
  const syncs = app.messages.filter((m) => m.type === 'APP_SYNC_PROFILE_REQUEST');
  assert.equal(syncs.length, 1); assert.equal(syncs[0].payload.profileOnly, true);
  assert.equal(app.messages.filter((m) => m.type.includes('PREPARE')).length, 1);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY].handoffId, begun.handoffId);
});

test('first same-owner app profile sync does not erase the pending cold-profile handoff', async () => {
  const app = setup(); app.local.values[stateKey].profile = null;
  const begun = await app.begin();
  const result = await app.runtime('SYNC_PROFILE', profile);
  assert.equal(result.hasProfile, true);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY].handoffId, begun.handoffId);
});

test('fresh attachment authorization is metadata-only and fails after cancellation or for a forged/subframe target', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  const request = { handoffId: begun.handoffId, artifactId: document.artifactId, targetUrl: app.tabs.get(2).url };
  const employer = { id: extensionId, tab: app.tabs.get(2), url: app.tabs.get(2).url, frameId: 0 };
  const valid = await app.runtime('AUTHORIZE_RESUME_ATTACHMENT', request, employer);
  assert.deepEqual(JSON.parse(JSON.stringify(valid)), { ok: true, ...request });
  assert.equal(JSON.stringify(valid).includes('base64'), false);
  for (const sender of [{ ...employer, frameId: 3 }, app.sender(), { ...employer, id: 'forged-extension' }]) {
    assert.equal((await app.runtime('AUTHORIZE_RESUME_ATTACHMENT', request, sender)).ok, false);
  }
  const cancelled = await app.runtime('CANCEL_RESUME_HANDOFF', { handoffId: begun.handoffId });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.handoffId, begun.handoffId);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY], undefined);
  assert.equal((await app.runtime('AUTHORIZE_RESUME_ATTACHMENT', request, employer)).ok, false);
});

test('corrupted cached artifact never leaves the background and is removed on attempted use', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  app.session.values[HANDOFF_STORAGE_KEY].selection.document.base64 = 'AAAA';
  await assert.rejects(app.api.requestAutofillApplication(2, { profile }), { code: 'resume_selection_required' });
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY], undefined);
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
});

test('worker restart restores session selection but empty browser-session storage requires reselection', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  const resumed = setup({ session: app.session, local: app.local });
  await resumed.api.requestAutofillApplication(2, { profile });
  assert.equal(resumed.messages.some((m) => m.type === 'APP_PREPARE_SAVED_RESUME_REQUEST'), false);
  const restarted = setup({ local: app.local });
  await assert.rejects(restarted.api.requestAutofillApplication(2, { profile }), { code: 'resume_selection_required' });
});

test('missing storage.session and quota errors fail closed without a persistent fallback', async () => {
  const unavailable = setup({ session: null });
  await assert.rejects(unavailable.begin(), /cannot keep a resume safely/);
  assert.equal(JSON.stringify(unavailable.local.values).includes('sessionNonce'), false);
  const quota = setup({ session: { ...memoryArea(), async set() { throw new Error('Quota exceeded'); } } });
  await assert.rejects(quota.begin(), /session memory/);
  assert.equal(JSON.stringify(quota.local.values).includes('sessionNonce'), false);
});

test('queue without selection pauses; completion does not start or advance it', async () => {
  const app = setup();
  app.local.values[stateKey].queue = [{ id: 'job-1', status: 'opening', url: app.tabs.get(2).url, tabId: 2 }];
  app.local.values[stateKey].activeJobId = 'job-1'; app.local.values[stateKey].isRunning = true;
  const result = await app.api.handleJobPageReady({}, { tab: app.tabs.get(2), frameId: 0 });
  assert.equal(result.needsResumeSelection, true);
  assert.equal(app.local.values[stateKey].queue[0].status, 'needs_resume_selection');
  assert.equal(app.local.values[stateKey].isRunning, false);
  const begun = await app.begin(); await app.complete(begun.handoffId);
  assert.equal(app.local.values[stateKey].queue[0].status, 'needs_resume_selection');
  assert.equal(app.local.values[stateKey].isRunning, false);
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
  await app.runtime('START_RUN', {});
  assert.equal(app.local.values[stateKey].queue[0].status, 'needs_review');
  assert.equal(app.local.values[stateKey].isRunning, false);
});

test('late queued frame response after account change cannot overwrite the new account queue', async () => {
  let app;
  const nextState = { profile: { ...profile, candidate: { ...profile.candidate, userId: 'owner-b' } }, queue: [{ id: 'new-owner-job', status: 'queued' }], activeJobId: null, isRunning: false };
  app = setup({ onRequest: async (message, api) => {
    if (message.type === 'AUTOFILL_APPLICATION') {
      await api.invalidateProfileSession();
      app.local.values[stateKey] = structuredClone(nextState);
    }
  } });
  const begun = await app.begin(); await app.complete(begun.handoffId);
  Object.assign(app.local.values[stateKey], { queue: [{ id: 'job-1', status: 'opening', url: app.tabs.get(2).url, tabId: 2 }], activeJobId: 'job-1', isRunning: true });
  const result = await app.api.handleJobPageReady({}, { tab: app.tabs.get(2), frameId: 0 });
  assert.equal(result.ignored, true);
  assert.deepEqual(app.local.values[stateKey], nextState);
});

test('queued different job cannot reuse the current selection even on a matching tab ID', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  Object.assign(app.local.values[stateKey], { queue: [{ id: 'job-10', status: 'opening', url: 'https://jobs.example/jobs/10?opening=1', tabId: 2 }], activeJobId: 'job-10', isRunning: true });
  const result = await app.api.handleJobPageReady({}, { tab: app.tabs.get(2), frameId: 0 });
  assert.equal(result.needsResumeSelection, true);
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
});

test('deleted saved resume pauses queued work rather than advancing after a typed app error', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  Object.assign(app.local.values[stateKey], { queue: [{ id: 'job-1', status: 'opening', url: app.tabs.get(2).url, tabId: 2 }], activeJobId: 'job-1', isRunning: true });
  app.controls.validationError = { ok: false, code: 'RESUME_NOT_FOUND', error: 'This saved resume was deleted.' };
  const result = await app.api.handleJobPageReady({}, { tab: app.tabs.get(2), frameId: 0 });
  assert.equal(result.needsResumeSelection, true);
  assert.equal(app.local.values[stateKey].queue[0].status, 'needs_resume_selection');
  assert.equal(app.local.values[stateKey].isRunning, false);
  assert.equal(app.messages.some((m) => m.type === 'AUTOFILL_APPLICATION'), false);
});

test('a closed tab missed by the removal event still fails with the selection-required contract', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  app.tabs.delete(2);
  await assert.rejects(app.api.requestAutofillApplication(2, { profile }), { code: 'resume_selection_required' });
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY], undefined);
});

test('closed original tab clears the selected PDF without touching other tabs', async () => {
  const app = setup(); const begun = await app.begin(); await app.complete(begun.handoffId);
  await app.removeTab(2);
  assert.equal(app.session.values[HANDOFF_STORAGE_KEY], undefined);
});

test('session expiry is clock-gated and removes bytes, including after worker wake', async () => {
  const storage = memoryArea(); let now = 1000;
  const store = createResumeHandoffStore({ storage, now: () => now });
  const record = await store.begin({ ownerId: 'owner-a', tabId: 2, appTabId: 1, appOrigin: 'https://resumeats.cv', targetUrl: 'https://jobs.example/jobs/1', jobSnapshot: {} });
  await store.commit(record, { resume: { id: 'resume-a', revision: 3, title: 'Saved' }, document });
  now += HANDOFF_TTL_MS;
  assert.equal(await store.read(), null);
  await store.expire(); assert.equal(storage.values[HANDOFF_STORAGE_KEY], undefined);
});

test('artifact validation rejects identity, metadata, encoding, PDF signature, size and checksum corruption', async () => {
  const record = { ownerId: 'owner-a', handoffId: 'handoff', jobKey: 'https://jobs.example/jobs/1' };
  const response = () => ({ ...record, status: 'ready', resume: { id: 'resume-a', revision: 3, title: 'Saved' }, document: { ...document } });
  await validateSavedResumeArtifact(response(), record, 'resume-a', 3);
  const mutations = [
    (r) => { r.ownerId = 'owner-b'; }, (r) => { r.jobKey += '0'; }, (r) => { r.handoffId = 'other'; },
    (r) => { r.resume.revision = 4; }, (r) => { r.resume.id = 'other'; },
    (r) => { r.document.filename = '../resume.pdf'; }, (r) => { r.document.mimeType = 'text/html'; },
    (r) => { r.document.byteLength += 1; }, (r) => { r.document.byteLength = 1048577; },
    (r) => { r.document.base64 += '\n'; }, (r) => { r.document.base64 = 'AAAA'; },
    (r) => { r.document.base64 = Buffer.from('NOT A PDF').toString('base64'); r.document.byteLength = 9; },
    (r) => { r.document.sha256 = '0'.repeat(64); r.document.artifactId = `sha256:${r.document.sha256}`; },
    (r) => { r.extra = 'x'.repeat(1536 * 1024); },
  ];
  for (const mutate of mutations) { const value = response(); mutate(value); await assert.rejects(validateSavedResumeArtifact(value, record, 'resume-a', 3), { code: 'resume_selection_required' }); }
});

test('job identity preserves search and fragment; disallows credentials, controls and prefix collisions', () => {
  assert.equal(canonicalJobUrl('https://JOBS.example:443/jobs/1/?id=1#one'), 'https://jobs.example/jobs/1?id=1#one');
  assert.notEqual(canonicalJobUrl('https://jobs.example/jobs/1'), canonicalJobUrl('https://jobs.example/jobs/10'));
  for (const value of ['https://name:secret@jobs.example/1', 'https://jobs.example/\n1', 'file:///jobs/1']) assert.throws(() => canonicalJobUrl(value));
});
