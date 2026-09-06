import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred } from './helpers/componentHarness.js';

function setup() {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let componentSource;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'AuthRecoveryBridge') {
      componentSource = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(componentSource);
  const request = deferred();
  const redirects = [];
  const logs = [];
  let cleanup;
  const bridge = vm.runInNewContext(`(${componentSource})`, {
    useEffect(callback) { cleanup = callback(); },
    extractRecoverySessionFromUrl: () => ({ accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' }),
    supabase: { auth: { setSession: () => request.promise } },
    window: { location: { origin: 'http://127.0.0.1:5175', replace: (url) => redirects.push(url) } },
    console: { error: (...args) => logs.push(args) },
  });
  bridge();
  return { request, redirects, logs, unmount: () => cleanup() };
}

test('recovery bridge establishes session before navigating to a token-free URL', async () => {
  const app = setup();
  assert.deepEqual(app.redirects, []);
  app.request.resolve({ error: null });
  await setImmediate();
  assert.deepEqual(app.redirects, ['http://127.0.0.1:5175/#/update-password']);
});

test('recovery bridge catches rejected setup and does not log session-bearing errors', async () => {
  const app = setup();
  app.request.reject(new Error('synthetic-access storage failure'));
  await setImmediate();
  assert.deepEqual(app.redirects, ['http://127.0.0.1:5175/#/forgot-password']);
  assert.equal(app.logs.length, 1);
  assert.doesNotMatch(JSON.stringify(app.logs), /synthetic-access/);
});

test('recovery bridge ignores setup completion after unmount', async () => {
  const app = setup();
  app.unmount();
  app.request.reject(new Error('late rejection'));
  await setImmediate();
  assert.deepEqual(app.redirects, []);
  assert.deepEqual(app.logs, []);
});
