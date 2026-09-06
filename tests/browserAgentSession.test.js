import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { deferred } from './helpers/componentHarness.js';
import { setImmediate } from 'node:timers/promises';

const extensionId = 'synthetic-extension';
const appTab = { id: 1, url: 'https://resumeats.cv/#/dashboard', status: 'complete' };
const profileFor = (userId) => ({ version: '2026-09-04', candidate: { userId, fullName: 'Alex Morgan', email: 'alex@example.com', phone: '+1 555 0123', location: 'Remote' }, documents: {} });
const legacyDocuments = { resumePdfUrl: 'https://legacy.example/signed.pdf?token=synthetic', resumePdfPath: 'account-a/resume-a.pdf', resumeFilename: 'Legacy.pdf', preparedResumeTitle: 'Old PDF', preparedAt: '2020-01-01', preparedForUrl: 'https://jobs.example/old' };

function setup({ cachedOwner = 'account-a', signedInOwner = 'account-a', signedOut = false, cachedDocuments = {}, syncedDocuments = {}, onPrepare, onIdentity, onStorageRead, onStorageWrite } = {}) {
  const stateKey = 'resumeatsBrowserAgentState';
  const storage = { [stateKey]: { profile: { ...profileFor(cachedOwner), documents: cachedDocuments }, queue: [{ id: 'old-job' }], isRunning: true } };
  const messages = [];
  let handler;
  let installedHandler;
  let api;
  let stateReads = 0;
  const chrome = {
    runtime: {
      id: extensionId, getURL: (part) => `chrome-extension://${extensionId}/${part}`,
      getManifest: () => ({ content_scripts: [{ js: ['content-app-bridge.js'], matches: ['https://resumeats.cv/*', 'https://www.resumeats.cv/*'] }] }),
      onInstalled: { addListener(fn) { installedHandler = fn; } }, onMessage: { addListener(fn) { handler = fn; } }, onConnect: { addListener() {} },
    },
    storage: { local: {
      async get(key) {
        const value = structuredClone(storage[key]);
        if (key === stateKey) {
          stateReads += 1;
          await onStorageRead?.(api, stateReads);
        }
        return { [key]: value };
      },
      async set(values) { await onStorageWrite?.(api, values); Object.assign(storage, structuredClone(values)); },
      async remove(key) { delete storage[key]; },
    } },
    scripting: { async executeScript() { return []; } },
    tabs: {
      async query() { return [appTab]; },
      get(_id, callback) { callback(appTab); },
      onRemoved: { addListener() {}, removeListener() {} }, onUpdated: { addListener() {}, removeListener() {} },
      async sendMessage(_tabId, message, _options, callback) {
        messages.push(message.type);
        if (message.type === 'APP_AUTH_STATE_REQUEST') {
          if (onIdentity) await onIdentity(api);
          return signedOut ? { ok: false, error: 'Sign in to ResumeATS first.' } : { ok: true, userId: signedInOwner };
        }
        if (message.type === 'APP_SYNC_PROFILE_REQUEST') return { ok: true, profile: { ...profileFor(signedInOwner), documents: syncedDocuments }, resume: { id: 'resume-a', title: 'Saved', resumePdfUrl: 'https://legacy.example/signed.pdf', filename: 'Legacy.pdf' } };
        if (message.type === 'APP_PREPARE_RESUME_REQUEST') {
          if (onPrepare) await onPrepare(api);
          return { ok: true, profile: profileFor(signedInOwner) };
        }
        if (callback) callback({ ok: true, filledCount: 1 });
        return { ok: true };
      },
    },
  };
  api = loadEdgeFunction('browser-agent/background.js', {
    expose: ['getState', 'saveState', 'getVerifiedAutofillState', 'requestAutofillApplication', 'invalidateProfileSession', 'isTrustedMessageSender', 'syncProfileFromResumeAts', 'isSameAppOrigin'],
    globals: { chrome, setTimeout(fn, ms) { if (ms <= 1200) fn(); return 1; }, clearTimeout() {} },
  }).exports;
  return { api, storage, messages, stateKey, handler, installedHandler };
}

test('app-tab reuse compares exact trusted origins instead of URL prefixes', () => {
  const { api } = setup();
  assert.equal(api.isSameAppOrigin('https://resumeats.cv/#/dashboard', 'https://resumeats.cv'), true);
  assert.equal(api.isSameAppOrigin('https://resumeats.cv.evil.example/#/dashboard', 'https://resumeats.cv'), false);
  assert.equal(api.isSameAppOrigin('https://other.resumeats.cv/#/dashboard', 'https://resumeats.cv'), false);
});

test('extension companion pages work in tabs without trusting embedded or foreign pages', () => {
  const { api } = setup();
  for (const page of ['popup.html', 'sidepanel.html']) {
    const sender = { id: extensionId, url: `chrome-extension://${extensionId}/${page}`, tab: { id: 7 }, frameId: 0 };
    assert.equal(api.isTrustedMessageSender({ type: 'GET_STATE' }, sender), true);
    assert.equal(api.isTrustedMessageSender({ type: 'GET_STATE' }, { ...sender, frameId: 1 }), false);
    assert.equal(api.isTrustedMessageSender({ type: 'GET_STATE' }, { ...sender, id: 'another-extension' }), false);
    assert.equal(api.isTrustedMessageSender({ type: 'GET_STATE' }, { ...sender, url: `${sender.url}.evil` }), false);
  }
});

test('account switch clears cached personal data and queued work before any autofill', async () => {
  const { api, storage, stateKey, messages } = setup({ signedInOwner: 'account-b' });
  await assert.rejects(api.requestAutofillApplication(2, { profile: profileFor('account-a') }), /account changed/);
  assert.equal(storage[stateKey].profile, null);
  assert.equal(storage[stateKey].queue.length, 0);
  assert.equal(storage[stateKey].isRunning, false);
  assert.equal(messages.includes('AUTOFILL_APPLICATION'), false);
});

test('installed runtime reads hide obsolete PDF readiness and scrub only legacy cached documents', async () => {
  const app = setup({ cachedDocuments: legacyDocuments });
  const before = structuredClone(app.storage[app.stateKey]);
  const sender = { id: extensionId, url: appTab.url, tab: appTab, frameId: 0 };
  const send = (type) => new Promise(resolve => app.handler({ type }, sender, resolve));
  const summary = await send('GET_STATE');
  assert.equal(summary.resumeReady, undefined);
  assert.equal(summary.preparedResumeTitle, undefined);
  const cached = await send('GET_SYNCED_PROFILE');
  assert.deepEqual(JSON.parse(JSON.stringify(cached.profile.documents)), {});
  assert.ok(!JSON.stringify([summary, cached]).includes('legacy.example'));
  await setImmediate();
  assert.deepEqual(app.storage[app.stateKey], { ...before, profile: { ...before.profile, documents: {} } });
});

test('installed profile sync and app refresh never persist or return legacy document metadata', async () => {
  const app = setup({ syncedDocuments: legacyDocuments });
  const sender = { id: extensionId, url: appTab.url, tab: appTab, frameId: 0 };
  await new Promise(resolve => app.handler({ type: 'SYNC_PROFILE', payload: { ...profileFor('account-a'), documents: legacyDocuments } }, sender, resolve));
  assert.deepEqual(app.storage[app.stateKey].profile.documents, {});
  const result = await app.api.syncProfileFromResumeAts({ openLoginOnFailure: false });
  assert.deepEqual(JSON.parse(JSON.stringify(result.profile.documents)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(result.resume)), { id: 'resume-a', title: 'Saved' });
  assert.ok(!JSON.stringify(result).includes('legacy.example'));
  assert.deepEqual(app.storage[app.stateKey].profile.documents, {});
});

test('queued cache cleanup cannot restore an earlier account or overwrite its replacement queue', async () => {
  const reached = deferred();
  const release = deferred();
  const app = setup({ cachedDocuments: legacyDocuments, onStorageRead: async (_api, count) => {
    if (count === 1) { reached.resolve(); await release.promise; }
  } });
  const oldRead = app.api.getState();
  await reached.promise;
  const sender = { id: extensionId, url: appTab.url, tab: appTab, frameId: 0 };
  const send = (message) => new Promise(resolve => app.handler(message, sender, resolve));
  await send({ type: 'SYNC_PROFILE', payload: profileFor('account-b') });
  await send({ type: 'QUEUE_JOBS', payload: { jobs: [{ id: 'new-job', title: 'New job', url: 'https://jobs.example/new' }] } });
  release.resolve();
  const oldResult = await oldRead;
  assert.deepEqual(JSON.parse(JSON.stringify(oldResult.profile.documents)), {});
  await setImmediate();
  assert.equal(app.storage[app.stateKey].profile.candidate.userId, 'account-b');
  assert.deepEqual(app.storage[app.stateKey].profile.documents, {});
  assert.equal(app.storage[app.stateKey].queue.length, 1);
  assert.equal(app.storage[app.stateKey].queue[0].id, 'new-job');
});

test('extension update sanitization is serialized before concurrent account and queue writes', async () => {
  const migrationWriteReached = deferred();
  const releaseMigrationWrite = deferred();
  let held = false;
  const app = setup({ cachedDocuments: legacyDocuments, onStorageWrite: async (_api, values) => {
    const next = values.resumeatsBrowserAgentState;
    if (!held && next?.profile?.candidate?.userId === 'account-a' && next?.queue?.[0]?.id === 'old-job') {
      held = true;
      migrationWriteReached.resolve();
      await releaseMigrationWrite.promise;
    }
  } });
  const update = app.installedHandler({ reason: 'update' });
  await migrationWriteReached.promise;
  const currentWrite = app.api.saveState({
    profile: profileFor('account-b'),
    queue: [{ id: 'new-job', title: 'New job', url: 'https://jobs.example/new' }],
    isRunning: false,
  });
  const raced = await Promise.race([currentWrite.then(() => 'wrote'), setImmediate().then(() => 'queued')]);
  assert.equal(raced, 'queued', 'current state writes must wait behind the installed-state migration');
  releaseMigrationWrite.resolve();
  await Promise.all([update, currentWrite]);
  assert.equal(app.storage[app.stateKey].profile.candidate.userId, 'account-b');
  assert.deepEqual(app.storage[app.stateKey].profile.documents, {});
  assert.deepEqual(app.storage[app.stateKey].queue.map((job) => job.id), ['new-job']);
});

test('signed-out app cannot use a complete cached profile to autofill', async () => {
  const { api, messages, storage, stateKey } = setup({ signedOut: true });
  await assert.rejects(api.requestAutofillApplication(2, { profile: profileFor('account-a') }), /Sign in/);
  assert.equal(storage[stateKey].profile, null);
  assert.equal(messages.includes('AUTOFILL_APPLICATION'), false);
});

test('legacy cache without owner requires fresh authenticated app sync', async () => {
  const { api, messages } = setup({ cachedOwner: '' });
  const state = await api.getVerifiedAutofillState();
  assert.equal(state.profile.candidate.userId, 'account-a');
  assert.deepEqual(messages, ['APP_AUTH_STATE_REQUEST', 'APP_SYNC_PROFILE_REQUEST']);
});

test('verified matching account still requires session resume selection before frame autofill', async () => {
  const { api, messages } = setup();
  await assert.rejects(api.requestAutofillApplication(2, { profile: profileFor('account-a') }), { code: 'resume_selection_required' });
  assert.deepEqual(messages, ['APP_AUTH_STATE_REQUEST']);
});

test('pre-audit profiles with inferred sensitive defaults must be freshly rebuilt', async () => {
  const { api, messages, storage, stateKey } = setup();
  storage[stateKey].profile.version = '2026-04-06';
  const state = await api.getVerifiedAutofillState();
  assert.equal(state.profile.version, '2026-09-04');
  assert.deepEqual(messages, ['APP_AUTH_STATE_REQUEST', 'APP_SYNC_PROFILE_REQUEST']);
});

test('logout during the identity check cannot allow a cached profile to be sent', async () => {
  const { api, messages } = setup({ onIdentity: (target) => target.invalidateProfileSession() });
  await assert.rejects(api.requestAutofillApplication(2, { profile: profileFor('account-a') }), /session changed/);
  assert.equal(messages.includes('AUTOFILL_APPLICATION'), false);
});

test('logout clears cached profile even when no session resume storage exists', async () => {
  const { api, storage, stateKey } = setup();
  await api.invalidateProfileSession();
  assert.equal(storage[stateKey].profile, null);
});

test('privileged runtime requests reject job pages, subframes and forged extension senders', async () => {
  const { api, handler, storage, stateKey } = setup();
  const sender = { id: extensionId, url: appTab.url, tab: appTab, frameId: 0 };
  assert.equal(api.isTrustedMessageSender({ type: 'SYNC_PROFILE' }, sender), true);
  for (const untrusted of [
    { ...sender, id: 'another-extension' },
    { ...sender, frameId: 1 },
    { ...sender, url: 'https://jobs.example.com/apply' },
    { ...sender, url: 'https://resumeats.cv.evil.example/apply' },
    { ...sender, url: 'https://other.resumeats.cv/apply' },
  ]) {
    const response = await new Promise((resolve) => handler({ type: 'SYNC_PROFILE', payload: profileFor('attacker') }, untrusted, resolve));
    assert.equal(response.ok, false);
    assert.equal(storage[stateKey].profile.candidate.userId, 'account-a');
  }
});

test('logout during the sync storage read cannot resurrect the old profile', async () => {
  const reached = deferred();
  const release = deferred();
  const { api, storage, stateKey } = setup({ onStorageRead: async (_api, count) => {
    if (count === 1) { reached.resolve(); await release.promise; }
  } });
  const sync = api.syncProfileFromResumeAts({ openLoginOnFailure: false });
  await reached.promise;
  await api.invalidateProfileSession();
  release.resolve();
  await assert.rejects(sync, /session changed/i);
  assert.equal(storage[stateKey].profile, null);
  assert.equal(storage[stateKey].queue.length, 0);
});

test('a slow storage write cannot finish after the queued logout clear', async () => {
  const reached = deferred();
  const release = deferred();
  let held = false;
  const { api, storage, stateKey } = setup({ onStorageWrite: async (_api, values) => {
    if (!held && values.resumeatsBrowserAgentState?.profile) {
      held = true;
      reached.resolve();
      await release.promise;
    }
  } });
  const sync = api.syncProfileFromResumeAts({ openLoginOnFailure: false });
  await reached.promise;
  const logout = api.invalidateProfileSession();
  release.resolve();
  await Promise.allSettled([sync, logout]);
  assert.equal(storage[stateKey].profile, null);
  assert.equal(storage[stateKey].queue.length, 0);
});

test('rejecting an old sync preserves the newly synced account and its queue', async () => {
  const reached = deferred();
  const release = deferred();
  const { api, storage, stateKey, handler } = setup({ onStorageRead: async (_api, count) => {
    if (count === 1) { reached.resolve(); await release.promise; }
  } });
  const sender = { id: extensionId, url: appTab.url, tab: appTab, frameId: 0 };
  const send = (message) => new Promise((resolve) => handler(message, sender, resolve));
  const oldSync = api.syncProfileFromResumeAts({ openLoginOnFailure: false });
  await reached.promise;
  await send({ type: 'SYNC_PROFILE', payload: profileFor('account-b') });
  await send({ type: 'QUEUE_JOBS', payload: { jobs: [{ id: 'new-job', title: 'New application', url: 'https://jobs.example.com/new' }] } });
  release.resolve();
  await assert.rejects(oldSync, /session changed/i);
  assert.equal(storage[stateKey].profile.candidate.userId, 'account-b');
  assert.equal(storage[stateKey].queue.length, 1);
  assert.equal(storage[stateKey].queue[0].title, 'New application');
});

test('an obsolete identity check cannot clear the newly connected account and queue', async () => {
  const reached = deferred();
  const release = deferred();
  const { api, storage, stateKey, handler, messages } = setup({ onIdentity: async () => {
    reached.resolve();
    await release.promise;
  } });
  const sender = { id: extensionId, url: appTab.url, tab: appTab, frameId: 0 };
  const send = (message) => new Promise((resolve) => handler(message, sender, resolve));
  const oldCheck = api.requestAutofillApplication(2, { profile: profileFor('account-a') });
  await reached.promise;
  await send({ type: 'SYNC_PROFILE', payload: profileFor('account-b') });
  await send({ type: 'QUEUE_JOBS', payload: { jobs: [{ id: 'new-job', title: 'New application', url: 'https://jobs.example.com/new' }] } });
  release.resolve();
  await assert.rejects(oldCheck, /session changed/i);
  assert.equal(messages.includes('AUTOFILL_APPLICATION'), false);
  assert.equal(storage[stateKey].profile.candidate.userId, 'account-b');
  assert.equal(storage[stateKey].queue.length, 1);
  assert.equal(storage[stateKey].queue[0].title, 'New application');
});
