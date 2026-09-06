import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';
import { keepOriginalResumeTailoring, resolveResumeTailoringReview } from '../src/utils/resumeTailoringReview.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';

const profile = (jobTitle = 'Intern') => ({ personal: { fullName: 'Alex Candidate', jobTitle, summary: 'Supported accessible interface work.' },
  workExperience: [{ title: 'Intern', company: 'Cedar', description: 'Supported interface testing.' }] });
const merge = (source, target, modelTitle = 'Invented global executive') => enforceAuthenticResumeSections(
  { personalInfo: { jobTitle: modelTitle } }, source, { title: target });

test('a different explicit target is labeled rather than presented as an acquired candidate title', () => {
  const source = profile();
  const result = merge(source, 'CEO at Acme');
  assert.equal(result.personalInfo.jobTitle, 'Target role: CEO');
  assert.equal(result.workExperience[0].title, 'Intern');
  assert.equal(source.personal.jobTitle, 'Intern');
});

test('a blank source headline may name an explicit target but never invents a current title', () => {
  assert.equal(merge(profile(''), 'CEO').personalInfo.jobTitle, 'Target role: CEO');
  assert.equal(merge(profile(''), '').personalInfo.jobTitle, '');
});

test('without an explicit parsed target only the exact source headline is retained', () => {
  assert.equal(merge(profile('  Operations specialist | Remote  '), '').personalInfo.jobTitle, '  Operations specialist | Remote  ');
  assert.equal(merge({ personal: {}, skills: ['HTML'] }, undefined, 'CEO').personalInfo.jobTitle, '');
});

test('a source-matching target retains source spelling and case', () => {
  assert.equal(merge(profile('Product DESIGNER'), 'product designer').personalInfo.jobTitle, 'Product DESIGNER');
});

test('target prefixes are idempotent across repeated generation normalization', () => {
  const result = merge(profile(), 'Target role: Target role: CEO');
  assert.equal(result.personalInfo.jobTitle, 'Target role: CEO');
  assert.equal(merge(result, 'CEO').personalInfo.jobTitle, 'Target role: CEO');
});

let bundle;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/enhancedOpenaiService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SUPABASE_URL: 'https://offline-headline.supabase.co' }) },
    plugins: [{ name: 'offline-headline-provider', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock', namespace: 'headline' }));
      builder.onLoad({ filter: /.*/, namespace: 'headline' }, () => ({ contents: 'export const supabase = globalThis.testSupabase; export const supabaseUrl = "https://offline-headline.supabase.co";', loader: 'js' }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

const generate = async (source, jobDescription) => {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, URL, structuredClone,
    console: { log() {}, warn() {}, error() {} },
    testSupabase: { functions: { invoke: async (name, options) => {
      calls.push({ name, options });
      return { data: { choices: [{ message: { content: JSON.stringify({ personalInfo: { jobTitle: 'Invented global executive', summary: 'Assisted accessible interface work.' } }) } }] } };
    } } },
    fetch: () => { throw new Error('External requests are prohibited'); },
  });
  return { review: await module.exports.generateEnhancedResume(source, jobDescription), calls };
};

test('actual bundled service to source-only review and shared export retains target labeling and original career facts', async () => {
  const { review, calls } = await generate(profile(), 'Job Title: CEO\nCompany: Acme\nLead company strategy.');
  const sourceOnly = keepOriginalResumeTailoring(review);
  const lines = buildResumeTextLines(sourceOnly);
  assert.equal(sourceOnly.personalInfo.jobTitle, 'Target role: CEO');
  assert.ok(lines.includes('Target role: CEO'));
  assert.ok(lines.includes('Intern at Cedar'));
  assert.equal(lines.includes('CEO'), false);
  assert.equal(lines.some((line) => line.includes('Invented global executive')), false);
  const prompt = calls[0].options.body.messages[0].content;
  assert.match(prompt, /Target role: <target title>/);
  assert.match(prompt, /no explicit target.*source headline/i);
});

test('actual bundled service does not borrow a generated headline when job analysis has no title', async () => {
  const { review } = await generate(profile(''), 'Collaborate with the team and review accessibility.');
  assert.equal(keepOriginalResumeTailoring(review).personalInfo.jobTitle, '');
});

test('explicit prose review and subsequent manual headline edits remain intact through shared export', async () => {
  const { review } = await generate(profile(), 'Job Title: CEO\nCompany: Acme\nLead company strategy.');
  const reviewed = resolveResumeTailoringReview(review, Object.fromEntries(review.suggestions.map(({ id }) => [id, { choice: 'edited', reviewId: review.reviewId, text: 'My reviewed wording.' }])));
  assert.equal(reviewed.personalInfo.jobTitle, 'Target role: CEO');
  reviewed.personalInfo.jobTitle = 'Operations specialist — pursuing leadership';
  const lines = buildResumeTextLines(reviewed);
  assert.ok(lines.includes('Operations specialist — pursuing leadership'));
  assert.ok(lines.includes('My reviewed wording.'));
  assert.equal(lines.includes('Target role: CEO'), false);
});
