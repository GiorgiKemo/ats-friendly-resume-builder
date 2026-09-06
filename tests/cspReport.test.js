import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

function setup({ enabled = 'true', insertError, throwError = false, configured = true } = {}) {
  const writes = [];
  let clients = 0;
  const { exports } = loadEdgeFunction('api/csp-report.js', {
    imports: {
      'node:buffer': { Buffer },
      '@supabase/supabase-js': { createClient: () => {
        clients++;
        return { from: (table) => ({ insert: async (rows) => {
          writes.push({ table, rows: JSON.parse(JSON.stringify(rows)) });
          if (throwError) throw new Error('private provider details');
          return { error: insertError };
        } }) };
      } },
    },
    globals: { process: { env: {
      CSP_REPORT_PERSISTENCE_ENABLED: enabled,
      ...(configured ? { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key' } : {}),
    } } },
  });
  return {
    writes,
    get clients() { return clients; },
    async request(body, headers = {}, method = 'POST') {
      const result = { status: null, sends: 0 };
      const response = { status(value) { result.status = value; return this; }, send() { result.sends++; } };
      await exports.default({ method, body, headers }, response);
      assert.deepEqual(result, { status: 204, sends: 1 });
    },
  };
}

const legacy = (fields = {}) => ({ 'csp-report': {
  'document-uri': 'https://resumeats.cv/account?code=private#access_token=private',
  'effective-directive': 'script-src-elem',
  'blocked-uri': 'inline',
  disposition: 'enforce',
  ...fields,
} });

test('CSP persistence is opt-in and disabled/non-POST requests never initialize privileged clients', async () => {
  for (const enabled of [undefined, '', 'false', 'TRUE', '1']) {
    const app = setup({ enabled: enabled ?? '' });
    await app.request(legacy());
    assert.equal(app.clients, 0);
  }
  const app = setup();
  await app.request(legacy(), {}, 'GET');
  assert.equal(app.clients, 0);
});

test('CSP rejects malformed, unwrapped and non-CSP payloads without database access', async () => {
  const app = setup();
  const circular = {}; circular.self = circular;
  for (const body of [undefined, null, '', '{', 'null', '1', [], true, circular,
    { 'document-uri': 'https://example.test/', 'effective-directive': 'script-src' },
    { 'csp-report': [] }, { 'csp-report': {} },
    { type: 'deprecation', body: { documentURL: 'https://example.test/', effectiveDirective: 'script-src' } },
    legacy({ 'document-uri': 'javascript:alert(1)' }),
    legacy({ 'effective-directive': { arbitrary: 'object' } }),
    legacy({ 'effective-directive': 'script<script>' }),
    legacy({ 'effective-directive': 'x'.repeat(81) }),
  ]) await app.request(body);
  assert.equal(app.clients, 0);
});

test('CSP enforces actual UTF-8 byte cap with absent, false and invalid Content-Length', async () => {
  const app = setup();
  const oversized = legacy({ 'script-sample': '🙂'.repeat(9000) });
  const serialized = JSON.stringify(oversized);
  assert.ok(serialized.length < 32768, 'must exercise byte count rather than character count');
  for (const body of [oversized, serialized, Buffer.from(serialized)]) {
    for (const headers of [{}, { 'content-length': '1' }, { 'content-length': 'invalid' }]) {
      await app.request(body, headers);
    }
  }
  await app.request(`${' '.repeat(32768)}${JSON.stringify(legacy())}`);
  await app.request(legacy(), { 'content-length': '32769' });
  assert.equal(app.clients, 0);
});

test('CSP legacy report strips URL credentials, queries and fragments and excludes sensitive raw fields', async () => {
  const app = setup();
  await app.request(Buffer.from(JSON.stringify(legacy({
    'document-uri': 'https://user:password@resumeats.cv/account?code=secret#access_token=secret',
    'blocked-uri': 'https://name:pass@cdn.example.test/script.js?signature=secret#token=secret',
    referrer: 'https://name:pass@example.test/login?email=private#refresh_token=secret',
    'original-policy': "script-src 'nonce-private'; report-uri /?token=private",
    'script-sample': 'private profile content',
    unknown: 'private content',
  }))), { 'user-agent': 'test-browser' });
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].table, 'app_error_events');
  assert.deepEqual(app.writes[0].rows, [{
    severity: 'warning', source: 'csp-report', message: 'CSP violation: script-src-elem', stack: '',
    context: { directive: 'script-src-elem', blockedUri: 'https://cdn.example.test/script.js',
      documentUri: 'https://resumeats.cv/account', disposition: 'enforce', referrer: 'https://example.test/login' },
    url: 'https://resumeats.cv/account', user_agent: 'test-browser',
  }]);
  assert.doesNotMatch(JSON.stringify(app.writes), /secret|private|password|refresh_token|access_token/);
});

test('CSP supports bounded Reporting API batches and ignores other report types', async () => {
  const app = setup();
  const entry = { type: 'csp-violation', url: 'https://resumeats.cv/editor?secret=1', body: {
    effectiveDirective: 'connect-src', blockedURL: 'https://api.example.test/path?secret=1', disposition: 'report',
  } };
  await app.request(JSON.stringify([entry, { type: 'network-error', body: {} }]));
  assert.equal(app.writes[0].rows.length, 1);
  assert.equal(app.writes[0].rows[0].context.directive, 'connect-src');
  assert.equal(app.writes[0].rows[0].url, 'https://resumeats.cv/editor');
  await app.request(Array.from({ length: 11 }, () => entry));
  assert.equal(app.writes.length, 1);
});

test('CSP bounds stored strings and discards unsupported URLs and arbitrary field types', async () => {
  const app = setup();
  await app.request(legacy({
    'document-uri': `https://resumeats.cv/${'a'.repeat(1800)}?secret=1`,
    'effective-directive': '', 'violated-directive': "script-src 'nonce-private'",
    'blocked-uri': 'data:text/html,private-content',
    disposition: { nested: 'private' }, referrer: { nested: 'private' },
  }), { 'user-agent': 'a'.repeat(4000) });
  const row = app.writes[0].rows[0];
  assert.equal(row.url.length, 1000);
  assert.equal(row.context.documentUri.length, 1000);
  assert.equal(row.context.directive, 'script-src');
  assert.equal(row.context.blockedUri, 'data:');
  assert.equal(row.context.disposition, '');
  assert.equal(row.context.referrer, '');
  assert.equal(row.user_agent.length, 1200);
  for (const [blocked, expected] of [['blob:https://resumeats.cv/private-token', 'blob:'], ['file:///private', ''], ['javascript:private', ''], [{ private: 1 }, ''], ['eval', 'eval']]) {
    await app.request(legacy({ 'blocked-uri': blocked }), { 'user-agent': ['not-a-string'] });
    assert.equal(app.writes.at(-1).rows[0].context.blockedUri, expected);
    assert.equal(app.writes.at(-1).rows[0].user_agent, '');
  }
});

test('CSP acknowledges unavailable configuration and failed writes without leaking provider details', async () => {
  const missing = setup({ configured: false });
  await missing.request(legacy());
  assert.equal(missing.clients, 0);
  for (const options of [{ insertError: { message: 'private details' } }, { throwError: true }]) {
    const app = setup(options);
    await app.request(legacy());
    assert.equal(app.writes.length, 1);
  }
});
