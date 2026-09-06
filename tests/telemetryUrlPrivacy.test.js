import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const recoveryUrl = 'https://private-user:private-pass@resumeats.cv/app?code=query-secret#/update-password?access_token=access-secret&refresh_token=refresh-secret';
const safeUrl = 'https://resumeats.cv/app#/update-password';
const assertNoUrlSecrets = (value) => assert.doesNotMatch(JSON.stringify(value), /private-user|private-pass|query-secret|access-secret|refresh-secret|access_token|refresh_token/);
let clientSource;

before(async () => {
  const result = await build({
    entryPoints: ['src/services/monitoringService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': JSON.stringify({ DEV: true }) },
    plugins: [{ name: 'isolated-monitoring', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase;', loader: 'js' }));
    } }],
  });
  clientSource = result.outputFiles[0].text;
});

function client({ url = recoveryUrl } = {}) {
  const calls = [];
  const logs = [];
  const listeners = new Map();
  const module = { exports: {} };
  vm.runInNewContext(clientSource, {
    module, exports: module.exports, URL,
    testSupabase: { functions: { invoke: async (name, options) => {
      calls.push({ name, body: JSON.parse(JSON.stringify(options.body)) });
      return { data: { ok: true }, error: null };
    } } },
    window: { location: { href: url }, addEventListener: (name, handler) => listeners.set(name, handler) },
    navigator: { userAgent: 'test-browser' },
    console: Object.fromEntries(['log', 'warn', 'error'].map((name) => [name, (...args) => logs.push(args)])),
    fetch: () => { throw new Error('Unexpected network request'); },
  });
  return { ...module.exports, calls, logs, listeners };
}

function edge() {
  const writes = [];
  let attemptNumber = 0;
  const client = {
    rpc: async (name) => {
      if (name === 'claim_public_engagement_attempt') {
        attemptNumber += 1;
        return { data: [{ allowed: true, attempt_id: `attempt-${attemptNumber}` }], error: null };
      }
      if (name === 'finalize_public_engagement_attempt') return { data: true, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
    const calls = [];
    writes.push({ table, calls });
    return queryResult({ error: null, count: 0 }, calls);
    },
  };
  const { handler } = loadEdgeFunction('supabase/functions/report-client-error/index.ts', {
    env: { SUPABASE_URL: 'https://fixture.supabase.co', SB_SECRET_KEY: 'fixture-server-key', SB_PUBLISHABLE_KEY: 'fixture-public-key' },
    imports: {
      supabase: { createClient: () => client },
      'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
    },
  });
  return { writes, async report(body) {
    const response = await handler(new Request('https://fixture.invalid/report', {
      method: 'POST', headers: { Origin: 'https://resumeats.cv', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 200);
    return writes.filter((entry) => entry.table === 'app_error_events').at(-1).calls.find(([method]) => method === 'insert')[1];
  } };
}

test('client strips URL credentials and recovery parameters before transmission and development logging', async () => {
  const app = client();
  await app.logEvent('error.ui', `Failure at ${recoveryUrl}`, {
    location: recoveryUrl, filename: recoveryUrl,
    nested: [{ url: recoveryUrl, normalValue: 'Retain useful error context' }],
  });
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.url, safeUrl);
  assert.equal(app.calls[0].body.context.location, safeUrl);
  assert.equal(app.calls[0].body.context.nested[0].url, safeUrl);
  assert.equal(app.calls[0].body.context.nested[0].normalValue, 'Retain useful error context');
  assertNoUrlSecrets(app.calls);
  assertNoUrlSecrets(app.logs);
});

test('client global errors sanitize filename, reason, message and stack URL copies', async () => {
  const app = client();
  app.installGlobalErrorHandlers();
  app.listeners.get('error')({ error: { message: `Failed ${recoveryUrl}`, stack: `at ${recoveryUrl}` }, filename: recoveryUrl, lineno: 1 });
  app.listeners.get('unhandledrejection')({ reason: `Rejected ${recoveryUrl}` });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.calls.length, 2);
  assertNoUrlSecrets(app.calls);
  assert.equal(app.calls[0].body.context.filename, safeUrl);
  assert.equal(app.calls[0].body.stack, `at ${safeUrl}`);
});

test('auth telemetry uses the reporting boundary once and does not call a third-party IP service', async () => {
  const app = client();

  await app.trackFailedLogin('candidate@example.com', 'Invalid login credentials');
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.context.ipAddress, undefined);

  await app.logError(new Error('One report only'), 'ui.auth');
  assert.equal(app.calls.length, 2);
});

test('server sanitizes raw direct reports independently of the client across all URL-bearing fields', async () => {
  const app = edge();
  const stored = await app.report({
    severity: 'error', source: `source ${recoveryUrl}`, message: `Failure at ${recoveryUrl}`, stack: `at ${recoveryUrl}`,
    url: recoveryUrl, userAgent: `browser ${recoveryUrl}`,
    context: { location: recoveryUrl, filename: recoveryUrl, nested: [{ referrer: recoveryUrl }], note: 'Preserved' },
  });
  assert.equal(stored.url, safeUrl);
  assert.equal(stored.context.location, safeUrl);
  assert.equal(stored.context.filename, safeUrl);
  assert.equal(stored.context.nested[0].referrer, safeUrl);
  assert.equal(stored.context.note, 'Preserved');
  assertNoUrlSecrets(stored);
});

test('both telemetry boundaries preserve only safe hash route paths and reject unsupported top-level URLs', async () => {
  for (const [url, expected] of [
    ['https://resumeats.cv/#access_token=access-secret&refresh_token=refresh-secret', 'https://resumeats.cv/'],
    ['https://resumeats.cv/#/preview/abc-123?code=query-secret#access_token=access-secret', 'https://resumeats.cv/#/preview/abc-123'],
    ['https://resumeats.cv/#/update-password&refresh_token=refresh-secret', 'https://resumeats.cv/#/update-password'],
    ['https://resumeats.cv/#//private-user:private-pass@example.test/path', 'https://resumeats.cv/'],
    ['javascript:access_token=access-secret', ''],
    ['not a URL', ''],
  ]) {
    const browser = client({ url });
    await browser.logEvent('error.ui', 'Fixture');
    assert.equal(browser.calls[0].body.url, expected);
    const server = edge();
    assert.equal((await server.report({ message: 'Fixture', url })).url, expected);
  }
});
