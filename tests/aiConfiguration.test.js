import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

let bundledService;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/enhancedOpenaiService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': 'globalThis.testEnv' },
    plugins: [{ name: 'configuration-only', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'configuration', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = {}; export const supabaseUrl = globalThis.resolvedUrl;', loader: 'js' }));
    } }],
  });
  bundledService = result.outputFiles[0].text;
});

function valid(resolvedUrl, dev = false) {
  const module = { exports: {} };
  vm.runInNewContext(bundledService, { module, exports: module.exports, URL, resolvedUrl,
    testEnv: { DEV: dev, VITE_SUPABASE_URL: 'not-the-resolved-configuration' },
  });
  return module.exports.isValidApiKey();
}

test('AI configuration accepts the resolved hosted and custom HTTPS URLs', () => {
  assert.equal(valid('https://project.supabase.co'), true);
  assert.equal(valid('https://api.candidate.example'), true);
});

test('AI configuration accepts HTTP loopback only in development', () => {
  for (const url of ['http://127.0.0.1:54329', 'http://localhost:54321', 'http://[::1]:54321']) {
    assert.equal(valid(url, true), true);
    assert.equal(valid(url), false);
  }
  assert.equal(valid('http://api.example.com', true), false);
});

test('AI configuration rejects malformed, credential-bearing and tokenized URLs', () => {
  for (const url of [undefined, '', 'not a URL', 'javascript:alert(1)', 'https://user:secret@api.example.com',
    'https://api.example.com?token=secret', 'https://api.example.com#secret']) {
    assert.equal(valid(url, true), false);
  }
});
