import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

// Connect both production bridge implementations. Only browser transport, clocks,
// and the authenticated service are synthetic; no bridge message is stubbed out.
function createHandshakeHarness() {
  const listeners = new Map();
  const runtimeListeners = new Set();
  const timers = new Map();
  const messages = [];
  const errors = [];
  let timerId = 0;
  let owner = 'synthetic-user-a';
  const fakeWindow = {
    origin: 'https://resumeats.cv',
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    setTimeout(handler) { timers.set(++timerId, handler); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    postMessage(message, targetOrigin) {
      assert.equal(targetOrigin, fakeWindow.origin);
      messages.push(message);
      queueMicrotask(() => dispatch(message));
    },
  };
  const dispatch = (message, origin = fakeWindow.origin, source = fakeWindow) => {
    for (const handler of [...(listeners.get('message') || [])]) {
      Promise.resolve(handler({ source, origin, data: message })).catch((error) => errors.push(error));
    }
  };
  const chrome = {
    runtime: {
      onMessage: {
        addListener(handler) { runtimeListeners.add(handler); },
        removeListener(handler) { runtimeListeners.delete(handler); },
      },
      async sendMessage() { return { ok: true }; },
    },
    storage: {
      onChanged: { addListener() {}, removeListener() {} },
      local: { async get() { return {}; }, async remove() {} },
    },
  };
  const imports = Object.fromEntries([
    './applicationAnswerService', './userProfileService', './autoApplyService',
    './supabaseService', './browserAgentService', './enhancedOpenaiService',
    '../utils/resumeDataMapper', '../utils/resumeTitle.js', '../utils/resumeAuthenticity',
  ].map((name) => [name, {}]));
  imports['./supabase'] = {
    supabase: { auth: { async getUser() { return { data: { user: owner ? { id: owner } : null }, error: null }; } } },
  };
  const app = loadEdgeFunction('src/services/browserAgentAppBridge.js', {
    imports, globals: { window: fakeWindow },
  }).exports;
  let cleanup = app.initializeBrowserAgentAppBridge();
  const flush = async () => {
    await setImmediate();
    await setImmediate();
    assert.deepEqual(errors, []);
  };
  const injectContent = async () => {
    loadEdgeFunction('browser-agent/content-app-bridge.js', {
      globals: {
        window: fakeWindow, chrome,
        document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
      },
    });
    await flush();
  };
  const authRequest = async () => {
    let response;
    assert.equal(runtimeListeners.size, 1, 'Reinjection must leave one runtime receiver');
    for (const handler of runtimeListeners) {
      handler({ type: 'APP_AUTH_STATE_REQUEST', payload: {} }, {}, (value) => { response = value; });
    }
    await flush();
    assert.ok(response, 'A real round-trip must respond without timing out');
    return response;
  };
  return {
    fakeWindow, messages, dispatch, flush, injectContent, authRequest,
    setOwner(value) { owner = value; },
    restartApp() { cleanup(); cleanup = app.initializeBrowserAgentAppBridge(); },
  };
}

test('real app/content handshake supports repeated authenticated requests without reinjection', async () => {
  const bridge = createHandshakeHarness();
  await bridge.injectContent();
  const firstToken = bridge.messages.find((message) => message.type === 'BRIDGE_READY').bridgeToken;
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(JSON.parse(JSON.stringify(await bridge.authRequest())), { ok: true, userId: 'synthetic-user-a' });
  }
  assert.equal(bridge.messages.filter((message) => message.type === 'BRIDGE_READY').length, 1);
  assert.ok(bridge.messages.filter((message) => message.type === 'APP_AUTH_STATE_REQUEST:response')
    .every((message) => message.bridgeToken === firstToken));
});

test('legitimate content reinjection rotates correlation token without locking out auth requests', async () => {
  const bridge = createHandshakeHarness();
  await bridge.injectContent();
  assert.equal((await bridge.authRequest()).ok, true);
  await bridge.injectContent();
  const ready = bridge.messages.filter((message) => message.type === 'BRIDGE_READY');
  assert.equal(ready.length, 2);
  assert.notEqual(ready[0].bridgeToken, ready[1].bridgeToken);
  bridge.setOwner('synthetic-user-b');
  assert.equal((await bridge.authRequest()).userId, 'synthetic-user-b');
  bridge.restartApp();
  assert.equal((await bridge.authRequest()).userId, 'synthetic-user-b');
});

test('wrong-origin or foreign-window handshakes cannot rotate the accepted token', async () => {
  const bridge = createHandshakeHarness();
  await bridge.injectContent();
  const original = bridge.fakeWindow.__resumeatsExtensionBridgeToken;
  const spoofed = {
    source: 'resumeats-browser-agent', target: 'resumeats-web', type: 'BRIDGE_READY',
    bridgeToken: 'forged-bridge-token-of-valid-length',
  };
  bridge.dispatch(spoofed, 'https://untrusted.example');
  bridge.dispatch(spoofed, bridge.fakeWindow.origin, {});
  await bridge.flush();
  assert.equal(bridge.fakeWindow.__resumeatsExtensionBridgeToken, original);
  assert.equal((await bridge.authRequest()).ok, true);
});

test('authenticated identity round-trip reports signed-out state rather than cached identity', async () => {
  const bridge = createHandshakeHarness();
  await bridge.injectContent();
  assert.equal((await bridge.authRequest()).userId, 'synthetic-user-a');
  bridge.setOwner(null);
  const response = await bridge.authRequest();
  assert.equal(response.ok, false);
  assert.match(response.error, /Sign in/);
  assert.equal(response.userId, undefined);
});

test('lazy app loader rejects foreign origins before retaining a handshake or loading the bridge', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('App.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let handlerSource;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'handleExtensionBridgeMessage') {
      handlerSource = node.initializer.getText(parsed);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(handlerSource);
  let loads = 0;
  const fakeWindow = { origin: 'https://resumeats.cv' };
  const handler = vm.runInNewContext(`(${handlerSource})`, {
    window: fakeWindow, AGENT_SOURCE: 'resumeats-browser-agent', APP_SOURCE: 'resumeats-web',
    BRIDGE_REQUEST_TYPES: new Set(['BRIDGE_READY']), cleanupBridge: null,
    loadBridge() { loads += 1; },
  });
  const data = {
    source: 'resumeats-browser-agent', target: 'resumeats-web', type: 'BRIDGE_READY',
    bridgeToken: 'valid-synthetic-correlation-token',
  };
  handler({ source: fakeWindow, origin: 'https://untrusted.example', data });
  handler({ source: {}, origin: fakeWindow.origin, data });
  assert.equal(loads, 0);
  assert.equal(fakeWindow.__resumeatsPendingBridgeMessages, undefined);
  handler({ source: fakeWindow, origin: fakeWindow.origin, data });
  assert.equal(loads, 1);
  assert.equal(fakeWindow.__resumeatsPendingBridgeMessages.length, 1);
});
