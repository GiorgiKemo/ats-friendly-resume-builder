import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

function bridgeHarness({ pendingSync = false } = {}) {
  const listeners = new Set();
  const runtimeListeners = new Set();
  const posted = [];
  const runtimeRequests = [];
  const timers = new Map();
  let timerId = 0;
  let connectedApp = false;
  const window = {
    origin: 'https://resumeats.cv',
    addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
    setTimeout(handler) { timers.set(++timerId, handler); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    postMessage(message, origin) {
      assert.equal(origin, window.origin);
      posted.push(message);
      if (connectedApp) queueMicrotask(() => { void dispatch(message); });
    },
  };
  window.top = window;
  const chrome = {
    runtime: {
      id: 'extension-1',
      onMessage: { addListener(listener) { runtimeListeners.add(listener); }, removeListener(listener) { runtimeListeners.delete(listener); } },
      async sendMessage(message) { runtimeRequests.push(message); return { ok: true, status: 'review_required' }; },
    },
    storage: { local: {
      async get(key) { return pendingSync && key === 'resumeatsBrowserAgentPendingProfileSync' ? { [key]: { requestedAt: new Date().toISOString() } } : {}; },
      async remove() {},
    }, onChanged: { addListener() {}, removeListener() {} } },
  };
  const inject = () => loadEdgeFunction('browser-agent/content-app-bridge.js', {
    globals: { window, chrome, document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' } },
  });
  inject();
  const dispatch = async (data, overrides = {}) => {
    for (const listener of [...listeners]) listener({ source: window, origin: window.origin, data, ...overrides });
    await setImmediate();
  };
  const request = (type, payload = {}) => {
    let response;
    let resolve;
    const done = new Promise(finish => { resolve = finish; });
    for (const listener of runtimeListeners) listener({ type, payload }, { id: chrome.runtime.id }, value => { response = value; resolve(value); });
    const sent = posted.at(-1);
    return {
      sent,
      done,
      get response() { return response; },
      reply: (payload, overrides) => dispatch({
        source: 'resumeats-web', target: 'resumeats-browser-agent', type: `${type}:response`,
        requestId: sent.requestId, bridgeToken: sent.bridgeToken, success: true, payload,
      }, overrides),
    };
  };
  const connectApp = async () => {
    const unused = () => { throw new Error('Unexpected provider, write, preference or upload call'); };
    const app = loadEdgeFunction('src/services/browserAgentAppBridge.js', {
      imports: {
        './supabase': { supabase: { auth: {
          getUser: async () => ({ data: { user: { id: 'owner-a' } } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        }, storage: { from: unused }, functions: { invoke: unused } } },
        './supabaseService': { getUserResumes: unused, getResumeById: unused },
        './supabaseService.js': { getResumeById: async () => ({ id: 'saved', user_id: 'owner-a', revision: 2, title: 'Chosen version', personal_info: { fullName: 'Candidate' } }), saveResume: unused },
        './browserAgentService': { buildBrowserAgentProfile: unused },
        './applicationAnswerService': { generateApplicationAnswers: unused },
        './userProfileService': { getUserProfile: unused },
        './autoApplyService': { getJobPreferences: unused },
        './resumePdfDocument.js': { buildTextPdf: async () => ({ blob: new Blob(['%PDF-1.7\nexact saved fixture'], { type: 'application/pdf' }) }) },
      }, globals: { window, Blob },
    }).exports;
    app.initializeBrowserAgentAppBridge();
    connectedApp = true;
    await dispatch(posted.find(message => message.type === 'BRIDGE_READY'));
  };
  const runPendingSync = async () => {
    const [id, callback] = [...timers][0];
    timers.delete(id);
    callback();
    await setImmediate();
  };
  return { window, request, posted, dispatch, runtimeRequests, inject, connectApp, runPendingSync };
}

test('post-login retry requests contact-only sync and strips an older app response before runtime forwarding', async () => {
  const h = bridgeHarness({ pendingSync: true });
  await h.runPendingSync();
  const pending = h.posted.find(message => message.type === 'APP_SYNC_PROFILE_REQUEST');
  assert.deepEqual(JSON.parse(JSON.stringify(pending.payload)), { profileOnly: true });
  await h.dispatch({
    source: 'resumeats-web', target: 'resumeats-browser-agent', type: 'APP_SYNC_PROFILE_REQUEST:response',
    requestId: pending.requestId, bridgeToken: pending.bridgeToken, success: true,
    payload: { profile: { candidate: { userId: 'owner-a' }, documents: { resumePdfUrl: 'https://legacy.example/signed.pdf' } } },
  });
  assert.equal(h.runtimeRequests.length, 1);
  assert.equal(h.runtimeRequests[0].type, 'SYNC_PROFILE');
  assert.deepEqual(JSON.parse(JSON.stringify(h.runtimeRequests[0].payload)), { candidate: { userId: 'owner-a' }, documents: {} });
});

test('app profile broadcasts cannot forward legacy signed-document metadata but preserve explicit logout', async () => {
  const h = bridgeHarness();
  const message = { source: 'resumeats-web', target: 'resumeats-browser-agent', type: 'SYNC_PROFILE', requestId: 'sync-a',
    payload: { candidate: { userId: 'owner-a' }, documents: { resumePdfUrl: 'https://legacy.example/signed.pdf' } } };
  await h.dispatch(message);
  assert.deepEqual(JSON.parse(JSON.stringify(h.runtimeRequests[0].payload)), { candidate: { userId: 'owner-a' }, documents: {} });
  await h.dispatch({ ...message, requestId: 'logout', payload: null });
  assert.equal(h.runtimeRequests[1].payload, null);
});

test('artifact-only response channel carries more than 256KiB without generic forwarding or raising ordinary request allowance', async () => {
  const h = bridgeHarness();
  const call = h.request('APP_PREPARE_SAVED_RESUME_REQUEST', { resumeId: 'saved', expectedRevision: 2 });
  assert.equal(call.sent.type, 'APP_PREPARE_SAVED_RESUME_REQUEST');
  const payload = { status: 'ready', ownerId: 'owner', document: { base64: 'A'.repeat(400000) } };
  await call.reply(payload);
  assert.equal(call.response.ok, true);
  assert.equal(call.response.document.base64.length, 400000);
  assert.equal(h.runtimeRequests.length, 0, 'Page responses are not rebroadcast as generic extension requests');
  await h.dispatch({ source: 'resumeats-web', target: 'resumeats-browser-agent', type: 'COMPLETE_RESUME_HANDOFF', requestId: 'oversized', payload: { extra: 'a'.repeat(262145) } });
  assert.equal(h.runtimeRequests.length, 0);
  assert.match(h.posted.at(-1).error, /256 KiB/);
});

test('response budgets use UTF-8 byte length and remain small for metadata-only validation', async () => {
  const h = bridgeHarness();
  const oversized = h.request('APP_PREPARE_SAVED_RESUME_REQUEST');
  await oversized.reply({ document: { base64: 'x'.repeat(1572864) } });
  assert.equal(oversized.response.ok, false);
  const unicode = h.request('APP_PREPARE_SAVED_RESUME_REQUEST');
  await unicode.reply({ title: '界'.repeat(530000) });
  assert.equal(unicode.response.ok, false);
  const validation = h.request('APP_VALIDATE_SAVED_RESUME_REQUEST');
  await validation.reply({ ownerId: 'owner', resumeId: 'saved', revision: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(validation.response)), { ok: true, ownerId: 'owner', resumeId: 'saved', revision: 2 });
  const ordinary = h.request('APP_VALIDATE_SAVED_RESUME_REQUEST');
  await ordinary.reply({ unwanted: 'x'.repeat(262145) });
  assert.equal(ordinary.response.ok, false);
});

test('all three privileged handoff requests are forwarded only from the app window and response types are never forwarded', async () => {
  const h = bridgeHarness();
  for (const type of ['GET_RESUME_HANDOFF', 'COMPLETE_RESUME_HANDOFF', 'CANCEL_RESUME_HANDOFF']) {
    const message = { source: 'resumeats-web', target: 'resumeats-browser-agent', requestId: type, type, payload: { handoffId: 'opaque' } };
    await h.dispatch(message, { origin: 'https://employer.example' });
    await h.dispatch(message, { source: {} });
    assert.equal(h.runtimeRequests.length, ['GET_RESUME_HANDOFF', 'COMPLETE_RESUME_HANDOFF', 'CANCEL_RESUME_HANDOFF'].indexOf(type));
    await h.dispatch(message);
  }
  assert.deepEqual(h.runtimeRequests.map(message => message.type), ['GET_RESUME_HANDOFF', 'COMPLETE_RESUME_HANDOFF', 'CANCEL_RESUME_HANDOFF']);
});

test('forged artifact responses do not resolve a request, and reinjection invalidates pending old transport callbacks', async () => {
  const h = bridgeHarness();
  const call = h.request('APP_PREPARE_SAVED_RESUME_REQUEST');
  await call.reply({ status: 'ready' }, { origin: 'https://employer.example' });
  await call.reply({ status: 'ready' }, { source: {} });
  assert.equal(call.response, undefined);
  h.inject();
  await call.reply({ status: 'ready', document: { base64: 'stale' } });
  assert.equal(call.response.ok, false);
  assert.equal(call.response.document, undefined);
  assert.equal(h.runtimeRequests.length, 0);
});

test('real content and app bridges deliver exact saved artifact and read-only version validation without generic byte forwarding', async () => {
  const h = bridgeHarness();
  await h.connectApp();
  const selection = { handoffId: 'handoff-1', jobKey: 'https://employer.example/jobs/1', resumeId: 'saved', expectedRevision: 2, expectedUserId: 'owner-a' };
  const prepared = await h.request('APP_PREPARE_SAVED_RESUME_REQUEST', selection).done;
  assert.equal(prepared.ok, true);
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.ownerId, 'owner-a');
  assert.equal(prepared.resume.revision, 2);
  assert.equal(Buffer.from(prepared.document.base64, 'base64').toString(), '%PDF-1.7\nexact saved fixture');
  const validation = await h.request('APP_VALIDATE_SAVED_RESUME_REQUEST', selection).done;
  assert.deepEqual(JSON.parse(JSON.stringify(validation)), { ok: true, ownerId: 'owner-a', resumeId: 'saved', revision: 2 });
  assert.equal(h.runtimeRequests.length, 0);
});
