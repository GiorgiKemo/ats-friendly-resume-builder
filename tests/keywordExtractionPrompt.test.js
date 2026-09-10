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

test('keyword extraction normalizes malformed provider output before returning it', async () => {
  const module = { exports: {} };
  const oversized = 'K'.repeat(300);
  vm.runInNewContext(bundled, {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, URL,
    console: { log() {}, warn() {}, error() {} },
    testSupabase: { functions: { invoke: async () => ({ data: { choices: [{ message: { content: JSON.stringify({
      keywords: [' React ', 42, oversized],
      technical_skills: Array.from({ length: 40 }, (_, index) => `Skill ${index}`),
      required_experience: { unsupported: true },
      ats_tips: ['\u0000Keep it truthful'],
      industry_specific_advice: 'A'.repeat(2000),
    }) } }] } }) } },
  });

  const result = await module.exports.enhancedKeywordExtraction('Frontend Engineer\nRequires React.');

  assert.deepEqual(Array.from(result.keywords), ['React', oversized.slice(0, 160)]);
  assert.equal(result.technical_skills.length, 30);
  assert.match(result.required_experience, /Not specified|0 years|No experience/i);
  assert.equal(result.ats_tips[0], 'Keep it truthful');
  assert.equal(result.industry_specific_advice.length, 1200);
});
