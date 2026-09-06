import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const selection = { handoffId: 'handoff-1', jobKey: 'https://jobs.example/1', resumeId: 'resume-1', expectedRevision: 2, expectedUserId: 'owner-a' };
const token = 'synthetic-bridge-token-of-valid-length';

function createAppBridge() {
  const listeners = new Set();
  const responses = [];
  const calls = [];
  let revision = 2;
  const window = {
    origin: 'https://resumeats.cv',
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    postMessage(message, origin) { assert.equal(origin, window.origin); responses.push(message); },
  };
  const unused = () => { throw new Error('Unexpected generation, profile, preference, save or upload call'); };
  const module = loadEdgeFunction('src/services/browserAgentAppBridge.js', {
    imports: {
      './supabase': { supabase: { auth: {
        getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      }, storage: { from: unused }, functions: { invoke: unused } } },
      './supabaseService': { getUserResumes: unused, getResumeById: unused },
      './supabaseService.js': { getResumeById: async () => {
        calls.push('load');
        return { id: 'resume-1', user_id: 'owner-a', revision, title: 'Selected', personal_info: { fullName: 'Candidate' }, certifications: [] };
      }, saveResume: unused },
      './browserAgentService': { buildBrowserAgentProfile: unused },
      './applicationAnswerService': { generateApplicationAnswers: unused },
      './userProfileService': { getUserProfile: unused },
      './autoApplyService': { getJobPreferences: unused },
      './resumePdfDocument.js': { buildTextPdf: async () => { calls.push('render'); return { blob: new Blob(['%PDF-1.7\nexample'], { type: 'application/pdf' }) }; } },
    }, globals: { window, Blob },
  }).exports;
  module.initializeBrowserAgentAppBridge();
  const dispatch = async (type, payload, options = {}) => {
    const data = {
      type, payload, source: 'resumeats-browser-agent', target: 'resumeats-web',
      requestId: 'request-1', bridgeToken: token, ...options.data,
    };
    await Promise.all([...listeners].map((listener) => listener({ source: options.source ?? window, origin: options.origin ?? window.origin, data })));
    await setImmediate();
  };
  return { dispatch, responses, calls, setRevision(value) { revision = value; } };
}

test('authenticated app bridge routes exact artifact requests through the real read-only service', async () => {
  const app = createAppBridge();
  await app.dispatch('BRIDGE_READY');
  await app.dispatch('APP_PREPARE_SAVED_RESUME_REQUEST', selection);
  const response = app.responses.at(-1);
  assert.equal(response.type, 'APP_PREPARE_SAVED_RESUME_REQUEST:response');
  assert.equal(response.bridgeToken, token);
  assert.equal(response.success, true);
  assert.equal(response.payload.ownerId, 'owner-a');
  assert.equal(response.payload.resume.revision, 2);
  assert.equal(Buffer.from(response.payload.document.base64, 'base64').toString(), '%PDF-1.7\nexample');
  assert.deepEqual(app.calls, ['load', 'render', 'load']);
});

test('app validation bridge returns identity metadata only and rejects a subsequently changed version', async () => {
  const app = createAppBridge();
  await app.dispatch('BRIDGE_READY');
  await app.dispatch('APP_VALIDATE_SAVED_RESUME_REQUEST', selection);
  assert.deepEqual(JSON.parse(JSON.stringify(app.responses.at(-1).payload)), { ownerId: 'owner-a', resumeId: 'resume-1', revision: 2 });
  app.setRevision(3);
  await app.dispatch('APP_VALIDATE_SAVED_RESUME_REQUEST', selection);
  assert.equal(app.responses.at(-1).success, false);
  assert.match(app.responses.at(-1).error, /changed/);
  assert.equal(app.responses.at(-1).payload, undefined);
  assert.deepEqual(app.calls, ['load', 'load']);
});

test('artifact request allowance does not weaken origin/token checks or the existing small request cap', async () => {
  const app = createAppBridge();
  await app.dispatch('BRIDGE_READY');
  await app.dispatch('APP_PREPARE_SAVED_RESUME_REQUEST', selection, { origin: 'https://untrusted.example' });
  await app.dispatch('APP_PREPARE_SAVED_RESUME_REQUEST', selection, { source: {} });
  await app.dispatch('APP_PREPARE_SAVED_RESUME_REQUEST', selection, { data: { bridgeToken: 'other-token-of-valid-length-here' } });
  await app.dispatch('APP_PREPARE_SAVED_RESUME_REQUEST', { ...selection, unused: 'x'.repeat(256 * 1024) });
  assert.equal(app.responses.length, 0);
  assert.equal(app.calls.length, 0);
});

test('app handoff helpers emit only the explicit IDs and revision, never profile, generation or preference payloads', async () => {
  const listeners = new Set();
  const requests = [];
  const window = {
    origin: 'https://resumeats.cv', setTimeout, clearTimeout,
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    postMessage(message, origin) {
      assert.equal(origin, window.origin);
      requests.push(message);
      queueMicrotask(() => {
        for (const listener of [...listeners]) listener({ source: window, origin, data: {
          source: 'resumeats-browser-agent', target: 'resumeats-web', requestId: message.requestId,
          type: `${message.type}:response`, success: true, payload: { status: 'ready' },
        } });
      });
    },
  };
  const bundled = await build({
    entryPoints: ['src/services/browserAgentService.js'], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'import.meta.env': '{}' }, external: ['./supabase', './browserAgentResumeArtifact.js', './resumePdfDocument.js'],
  });
  const module = { exports: {} };
  vm.runInNewContext(bundled.outputFiles[0].text, {
    module, exports: module.exports, window, crypto,
    require: (name) => {
      if (name === './supabase') return { supabase: {} };
      if (name === './browserAgentResumeArtifact.js') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const app = module.exports;
  await app.getBrowserAgentResumeHandoff('handoff-1');
  await app.completeBrowserAgentResumeHandoff({ ...selection, profile: { private: true }, autoSubmit: true });
  await app.cancelBrowserAgentResumeHandoff('handoff-1');
  assert.deepEqual(requests.map(({ type, payload }) => JSON.parse(JSON.stringify({ type, payload }))), [
    { type: 'GET_RESUME_HANDOFF', payload: { handoffId: 'handoff-1' } },
    { type: 'COMPLETE_RESUME_HANDOFF', payload: { handoffId: 'handoff-1', resumeId: 'resume-1', expectedRevision: 2 } },
    { type: 'CANCEL_RESUME_HANDOFF', payload: { handoffId: 'handoff-1' } },
  ]);
  assert.equal(listeners.size, 0);
});
