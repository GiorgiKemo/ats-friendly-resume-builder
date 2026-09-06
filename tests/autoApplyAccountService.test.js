import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { deferred } from './helpers/componentHarness.js';

let source;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/autoApplyService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://unit.supabase.co') },
    plugins: [{ name: 'isolated-auto-apply', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase; export const supabaseUrl = globalThis.resolvedUrl;', loader: 'js' }));
    } }],
  });
  source = result.outputFiles[0].text;
});

function setup({ getUser, getSession, query, response, resolvedUrl = 'https://unit.supabase.co' } = {}) {
  const db = [];
  const requests = [];
  const controller = new AbortController();
  const account = { expectedUserId: 'account-a', signal: controller.signal };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    console: { error() {} },
    URL,
    resolvedUrl,
    testSupabase: {
      auth: {
        getUser: getUser || (async () => ({ data: { user: { id: 'account-a' } }, error: null })),
        getSession: getSession || (async () => ({ data: { session: { user: { id: 'account-a' }, access_token: 'token-a' } }, error: null })),
      },
      from(table) {
        const entry = { table, methods: [] }; db.push(entry);
        const builder = { then: (resolve, reject) => Promise.resolve(query?.(entry) || { data: { id: 'row-a' }, error: null }).then(resolve, reject) };
        for (const method of ['select', 'upsert', 'insert', 'update', 'eq', 'order', 'limit', 'maybeSingle', 'single']) {
          builder[method] = (...args) => { entry.methods.push([method, ...args]); return builder; };
        }
        return builder;
      },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return response || { ok: true, json: async () => ({ success: true }) };
    },
  });
  return { ...module.exports, account, controller, db, requests };
}

test('AutoApply mutations refuse an omitted owner and a changed auth lookup before any database write', async () => {
  const app = setup({ getUser: async () => ({ data: { user: { id: 'account-b' } } }) });
  for (const mutate of [
    (account) => app.saveJobPreferences({ sender_name: 'Private A' }, account),
    (account) => app.toggleAutoApply(true, account),
    (account) => app.updateAutoApplyJob('job-a', { status: 'applied' }, account),
    (account) => app.createAutoApplyJob({ job_url: 'https://example.test/job' }, account),
  ]) {
    assert.ok((await mutate()).error);
    assert.match((await mutate(app.account)).error.message, /account changed/);
  }
  assert.equal(app.db.length, 0);
});

test('AutoApply save rejects a cancellation while authentication is pending and preserves captured ownership', async () => {
  const pending = deferred();
  const app = setup({ getUser: () => pending.promise });
  const save = app.saveJobPreferences({ sender_name: 'Private A' }, app.account);
  app.controller.abort();
  pending.resolve({ data: { user: { id: 'account-a' } } });
  assert.ok((await save).error);
  assert.equal(app.db.length, 0);

  const active = setup();
  assert.equal((await active.saveJobPreferences({ sender_name: 'A', user_id: 'spoofed' }, active.account)).error, null);
  const payload = active.db[0].methods.find(([method]) => method === 'upsert')[1];
  assert.equal(payload.user_id, 'account-a');
  assert.equal(payload.sender_name, 'A');
});

test('manual job creation rechecks the account after duplicate lookup before insert', async () => {
  const pending = deferred();
  const app = setup({ query: () => pending.promise });
  const create = app.createAutoApplyJob({ job_url: 'https://example.test/job' }, app.account);
  await new Promise((resolve) => setImmediate(resolve));
  app.controller.abort();
  pending.resolve({ data: null, error: null });
  assert.ok((await create).error);
  assert.equal(app.db.length, 1);
  assert.equal(app.db.some((entry) => entry.methods.some(([method]) => method === 'insert')), false);
});

test('Gmail and discovery never send a request with a different or missing session identity', async () => {
  for (const session of [null, { user: { id: 'account-b' }, access_token: 'token-b' }]) {
    const app = setup({ getSession: async () => ({ data: { session } }) });
    for (const action of [app.connectGmail, app.disconnectGmail, app.scanGmailReplies, (account) => app.triggerAutoApplyRun({}, account)]) {
      assert.match((await action(app.account)).error.message, /account changed/);
    }
    assert.equal(app.requests.length, 0);
  }
});

test('provider admission rechecks cancellation after session lookup and binds bearer plus user ID', async () => {
  const pending = deferred();
  const app = setup({ getSession: () => pending.promise });
  const run = app.triggerAutoApplyRun({}, app.account);
  await new Promise((resolve) => setImmediate(resolve));
  app.controller.abort();
  pending.resolve({ data: { session: { user: { id: 'account-a' }, access_token: 'token-a' } } });
  assert.ok((await run).error);
  assert.equal(app.requests.length, 0);

  const active = setup();
  assert.equal((await active.triggerAutoApplyRun({ discoverOnly: true }, active.account)).error, null);
  assert.equal(active.requests[0].options.headers.Authorization, 'Bearer token-a');
  assert.equal(active.requests[0].options.signal, active.account.signal);
  assert.deepEqual(JSON.parse(active.requests[0].options.body), { user_id: 'account-a', discover_only: true });
});

test('provider requests use the resolved development Supabase project URL', async () => {
  const app = setup({ resolvedUrl: 'http://127.0.0.1:54329' });
  assert.equal((await app.connectGmail(app.account)).error, null);
  assert.equal(app.requests[0].url, 'http://127.0.0.1:54329/functions/v1/gmail-auth');
});

test('Gmail scan HTTP failure is a failure, not a successful empty inbox', async () => {
  const app = setup({ response: { ok: false, json: async () => ({ error: 'Provider unavailable' }) } });
  const result = await app.scanGmailReplies(app.account);
  assert.equal(result.data, null);
  assert.match(result.error.message, /Provider unavailable/);
});

test('auto-apply run errors are not treated as success when the legacy endpoint returns HTTP 200', async () => {
  const app = setup({ response: { ok: true, json: async () => ({ error: 'AI matching unavailable' }) } });
  const result = await app.triggerAutoApplyRun({ discoverOnly: true }, app.account);
  assert.equal(result.data, null);
  assert.match(result.error.message, /AI matching unavailable/);
});
