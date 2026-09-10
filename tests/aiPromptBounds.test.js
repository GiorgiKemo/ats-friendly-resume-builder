import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

let bundled;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/enhancedOpenaiService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SUPABASE_URL: 'https://unit.supabase.co' }) },
    plugins: [{ name: 'isolated-ai-prompt-bounds', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock-supabase', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase; export const supabaseUrl = "https://unit.supabase.co";', loader: 'js' }));
    } }],
  });
  bundled = result.outputFiles[0].text;
});

function service() {
  const prompts = [];
  const module = { exports: {} };
  vm.runInNewContext(bundled, {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, URL,
    console: { log() {}, warn() {}, error() {} },
    testSupabase: { functions: { invoke: async (_name, request) => {
      prompts.push(request.body.messages[0].content);
      return { data: { choices: [{ message: { content: 'Generated response.' } }] } };
    } } },
  });
  return { module, prompts };
}

test('legacy AI helper prompts bound every free-text field before provider dispatch', async () => {
  const app = service();
  const longJob = `${'J'.repeat(7000)}BULLET_JOB_TAIL`;
  const longTitle = `${'T'.repeat(300)}BULLET_TITLE_TAIL`;
  const longCompany = `${'C'.repeat(300)}BULLET_COMPANY_TAIL`;
  const longDescription = `${'D'.repeat(5000)}BULLET_DESCRIPTION_TAIL`;
  await app.module.exports.generateEnhancedWorkExperienceBullets(longTitle, longCompany, longDescription, longJob, `${'I'.repeat(300)}BULLET_INDUSTRY_TAIL`);
  assert.equal(app.prompts.length, 1);
  assert.doesNotMatch(app.prompts[0], /BULLET_(?:JOB|TITLE|COMPANY|DESCRIPTION|INDUSTRY)_TAIL/);
  assert.match(app.prompts[0], /\[Truncated for length\]/);
});

test('legacy summary helper tolerates missing arrays and bounds candidate/job text', async () => {
  const app = service();
  const longJob = `${'S'.repeat(7000)}SUMMARY_JOB_TAIL`;
  await app.module.exports.generateEnhancedProfessionalSummary({ personalInfo: {}, workExperience: null, skills: null }, longJob, `${'I'.repeat(300)}SUMMARY_INDUSTRY_TAIL`, 'confident');
  assert.equal(app.prompts.length, 1);
  assert.doesNotMatch(app.prompts[0], /SUMMARY_(?:JOB|INDUSTRY)_TAIL/);
  assert.match(app.prompts[0], /Desired tone: Confident and Bold/);
  assert.match(app.prompts[0], /Work experience timeline:/);
});
