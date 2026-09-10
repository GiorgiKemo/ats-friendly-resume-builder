import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

let bundled;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/enhancedOpenaiService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SUPABASE_URL: 'https://unit.supabase.co' }) },
    plugins: [{ name: 'isolated-keyword-prompt', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock-supabase', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase; export const supabaseUrl = "https://unit.supabase.co";', loader: 'js' }));
    } }],
  });
  bundled = result.outputFiles[0].text;
});

test('keyword extraction prompt stays grounded in the supplied job description', async () => {
  let prompt;
  const module = { exports: {} };
  vm.runInNewContext(bundled, {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, URL,
    console: { log() {}, warn() {}, error() {} },
    testSupabase: { functions: { invoke: async (_name, request) => {
      prompt = request.body.messages[0].content;
      return { data: { choices: [{ message: { content: JSON.stringify({ keywords: ['React'] }) } }] } };
    } } },
  });

  await module.exports.enhancedKeywordExtraction('Frontend Engineer\nRequires React and TypeScript.');

  assert.match(prompt, /Derive every result from the supplied job description and parsed fields/);
  assert.match(prompt, /Do not use preset examples, invent requirements, or add unsupported candidate claims/);
  assert.doesNotMatch(prompt, /100% AI-created content/);
});
