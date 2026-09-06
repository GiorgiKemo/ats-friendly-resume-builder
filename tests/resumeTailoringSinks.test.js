import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';
import { createResumeTailoringReview, keepOriginalResumeTailoring } from '../src/utils/resumeTailoringReview.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const source = { personalInfo: { summary: 'Developer building accessible interfaces.' }, skills: ['HTML'] };
const pending = () => createResumeTailoringReview({ baseResume: source,
  candidateResume: { personalInfo: { summary: 'Executive leader with global hiring authority.' } } });
const reviewRequired = (error) => error.code === 'TAILORING_REVIEW_REQUIRED';
let bundledBrowserService;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/browserAgentService.js'], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
    define: { 'import.meta.env': '{}', 'import.meta.url': '"https://synthetic.example/module.js"' },
    plugins: [{ name: 'isolated-browser-service', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'synthetic', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase;', loader: 'js' }));
    } }],
  });
  bundledBrowserService = result.outputFiles[0].text;
});

function sinks() {
  const calls = [];
  const supabase = { auth: { getUser: async () => { calls.push('auth'); return { data: { user: { id: 'candidate-a' } } }; } },
    rpc: async () => { calls.push('save'); return { data: { resume_id: 'resume-1', revision: 1, updated_at: '2026-09-04T00:00:00Z' } }; },
  };
  const save = loadEdgeFunction('src/services/supabaseService.js', { imports: {
    './supabase': { supabase }, '../utils/resumeTitle.js': { deriveResumeTitle: () => 'Candidate resume' },
  } }).exports;
  const pdf = loadEdgeFunction('src/services/pdfService.js', { imports: {
    './supabase': { supabase }, jspdf: {}, html2canvas: () => { calls.push('canvas'); },
    './resumePdfDocument.js': { buildTextPdf: () => { calls.push('pdf'); } },
  } }).exports;
  const module = { exports: {} };
  vm.runInNewContext(bundledBrowserService, { module, exports: module.exports, testSupabase: supabase,
    require: () => { throw new Error('Pending review must not load a renderer'); },
  });
  return { ...save, ...pdf, ...module.exports, calls };
}

test('save and browser-profile sinks reject real and malformed review packets before side effects', async () => {
  for (const value of [pending(), { kind: 'resume-tailoring-review' }, { baseResume: source },
    { ...source, suggestions: [] }, { ...source, tailoringReview: { approved: true } }]) {
    const app = sinks();
    await assert.rejects(app.saveResume(value, null, 'candidate-a'), reviewRequired);
    await assert.rejects(app.buildBrowserAgentProfile({ user: { id: 'candidate-a' }, resume: value }), reviewRequired);
    assert.deepEqual(app.calls, []);
  }
});

test('PDF, DOCX, and download boundaries reject pending review before rendering or network', async () => {
  const app = sinks();
  const review = pending();
  await assert.rejects(buildTextPdf(review), reviewRequired);
  assert.throws(() => createResumeDocxDocument(review), reviewRequired);
  await assert.rejects(app.downloadResumePdf({}, review), reviewRequired);
  assert.deepEqual(app.calls, []);
});

test('an explicit keep-original decision produces a normal saveable source snapshot', async () => {
  const app = sinks();
  const result = await app.saveResume(keepOriginalResumeTailoring(pending()), null, 'candidate-a');
  assert.equal(result.resume_id, 'resume-1');
  assert.deepEqual(app.calls, ['auth', 'save']);
});

function bridge() {
  const calls = [];
  const user = { id: 'candidate-a' };
  const resume = { id: 'resume-1', title: 'Reviewed resume' };
  const app = loadEdgeFunction('src/services/browserAgentAppBridge.js', { expose: ['prepareTailoredResumeForBrowserAgent', 'syncBrowserAgentProfileFromApp'], imports: {
    './supabase': { supabase: { auth: { getUser: async () => { calls.push('auth'); return { data: { user } }; } } } },
    './applicationAnswerService': {},
    './userProfileService': { getUserProfile: async () => { calls.push('profile'); return {}; } },
    './autoApplyService': { getJobPreferences: async () => ({ data: { default_resume_id: 'resume-1' } }) },
    './supabaseService': { getResumeById: async () => { calls.push('load'); return resume; }, saveResume: async () => { calls.push('save'); } },
    './browserAgentService': { buildBrowserAgentProfile: async () => { calls.push('build'); return { documents: { resumePdfUrl: 'synthetic-document' } }; } },
    './enhancedOpenaiService': { generateEnhancedResume: async () => { calls.push('paid-provider'); return pending(); } },
  } }).exports;
  return { ...app, calls };
}

test('extension prepare stops before any provider, save or upload and explains the review handoff', async () => {
  const app = bridge();
  await assert.rejects(app.prepareTailoredResumeForBrowserAgent({ jobPosting: { title: 'Engineer' } }), (error) => {
    assert.equal(error.code, 'TAILORING_REVIEW_REQUIRED');
    assert.match(error.message, /Choose resume.*captured job.*review and save.*selecting/);
    assert.match(error.message, /No AI generation was started/);
    return true;
  });
  assert.deepEqual(app.calls, []);
});

test('extension can sync committed profile data without forwarding a legacy builder document', async () => {
  const app = bridge();
  const result = await app.syncBrowserAgentProfileFromApp({ resumeId: 'resume-1' });
  assert.equal(result.resume.id, 'resume-1');
  assert.deepEqual(JSON.parse(JSON.stringify(result.profile.documents)), {});
  assert.equal(result.resume.resumePdfUrl, undefined);
  assert.equal(app.calls.includes('build'), true);
  assert.equal(app.calls.includes('save'), false);
  assert.equal(app.calls.includes('paid-provider'), false);
});
