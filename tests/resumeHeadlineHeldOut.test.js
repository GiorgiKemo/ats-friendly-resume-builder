import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { Packer } from 'docx';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';
import { keepOriginalResumeTailoring } from '../src/utils/resumeTailoringReview.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';
import { generateOfflineReview } from './benchmarks/factual-tailoring.mjs';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const require = createRequire(import.meta.url);
const JSZip = require(require.resolve('jszip', { paths: [dirname(require.resolve('docx'))] }));
const templateNames = ['BasicTemplate', 'ModernTemplate', 'TraditionalTemplate', 'MinimalistTemplate', 'ATSFriendlyTemplate'];
const renderTemplates = new Map();
let vite;
before(async () => {
  vite = await createServer({
    configFile: false, cacheDir: 'node_modules/.vite-qa-headline-held-out',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', esbuild: { jsx: 'automatic' },
  });
  for (const name of templateNames) renderTemplates.set(name, (await vite.ssrLoadModule(`/src/components/templates/${name}.jsx`)).default);
});
after(async () => { await vite?.close(); });

const profile = (headline) => ({
  personal: { fullName: 'Synthetic Candidate', jobTitle: headline, summary: 'Supported product research.' },
  workExperience: [{ title: 'Research Intern', company: 'Harbor', description: 'Supported product research.' }],
});
const headline = (source, target, generated = {}) => enforceAuthenticResumeSections(generated, source, { title: target });

for (const [label, sourceHeadline, target, expected] of [
  ['junior-to-executive target', 'Research Intern', 'Chief Executive Officer', 'Target role: Chief Executive Officer'],
  ['blank source headline', '', 'Product Designer', 'Target role: Product Designer'],
  ['case-insensitive matching source', '  Product DESIGNER  ', 'Product Designer', '  Product DESIGNER  '],
  ['target prefix is idempotent', '', 'Target role: Target role: Product Designer', 'Target role: Product Designer'],
  ['target company removed', 'Research Intern', 'Product Designer at Cedar Labs', 'Target role: Product Designer'],
  ['multilingual source identity with no target', '翻訳者・編集者', '', '翻訳者・編集者'],
]) {
  test(`held-out headline ${label} does not assert an invented held role`, () => {
    const source = profile(sourceHeadline);
    const before = structuredClone(source);
    const result = headline(source, target, { personalInfo: { jobTitle: 'Model-only President' }, jobTitle: 'Model-only Director' });
    assert.equal(result.personalInfo.jobTitle, expected);
    assert.equal(result.workExperience[0].jobTitle, 'Research Intern');
    assert.equal(result.workExperience[0].company, 'Harbor');
    assert.deepEqual(source, before);
  });
}

test('missing target cannot promote a model-only nested or root headline', () => {
  for (const generated of [{ jobTitle: 'Model-only Chief Executive' }, { personalInfo: { jobTitle: 'Model-only Chief Executive' } }]) {
    assert.equal(headline(profile(''), '', generated).personalInfo.jobTitle, '');
    assert.equal(headline(profile('Independent consultant'), '', generated).personalInfo.jobTitle, 'Independent consultant');
  }
});

test('actual bundled generation and source-only review label the target without changing work history', async () => {
  const { review } = await generateOfflineReview(profile('Research Intern'), {
    personalInfo: { jobTitle: 'Model-only Chief Executive', summary: 'Supported product research.' },
  });
  const output = keepOriginalResumeTailoring(review);
  assert.equal(output.personalInfo.jobTitle, 'Target role: Software Engineer');
  assert.equal(output.workExperience[0].jobTitle, 'Research Intern');
  assert.ok(!JSON.stringify(output).includes('Model-only Chief Executive'));
  assert.ok(buildResumeTextLines(output).includes('Target role: Software Engineer'));
});

const savedResume = (jobTitle) => ({
  id: 'saved-a', user_id: 'owner-a', revision: 3, title: 'METADATA_ONLY_CEO', jobTitle: 'ROOT_ONLY_DIRECTOR',
  personalInfo: { fullName: 'Synthetic Candidate', ...(jobTitle === undefined ? {} : { jobTitle }) },
  workExperience: [], education: [], skills: [], projects: [], certifications: [],
});
const fixtures = [
  ['labeled target', 'Target role: Product & Platform Lead'],
  ['ordinary manual headline', 'Independent research consultant'],
  ['explicit blank headline', ''],
  ['omitted headline', undefined],
];

for (const name of templateNames) {
  test(`actual ${name} preserves labeled/manual headlines and never fills blanks from metadata`, () => {
    for (const [label, value] of fixtures) {
      const markup = renderToStaticMarkup(React.createElement(renderTemplates.get(name), { resume: savedResume(value) }));
      assert.ok(!markup.includes('METADATA_ONLY_CEO') && !markup.includes('ROOT_ONLY_DIRECTOR'), label);
      if (value) assert.ok(markup.includes(value.replace(/&/g, '&amp;')), `${name}: ${label}`);
      else assert.ok(!markup.includes('Target role:'), `${name}: ${label}`);
    }
  });
}

test('shared PDF text and actual DOCX XML agree on target/manual/blank headline materialization', async () => {
  for (const [label, value] of fixtures) {
    const resume = savedResume(value);
    const lines = buildResumeTextLines(resume);
    const zip = await JSZip.loadAsync(await Packer.toBuffer(createResumeDocxDocument(resume)));
    const xml = await zip.file('word/document.xml').async('string');
    assert.ok(!lines.some(line => /METADATA_ONLY_CEO|ROOT_ONLY_DIRECTOR/.test(line)), label);
    assert.ok(!/METADATA_ONLY_CEO|ROOT_ONLY_DIRECTOR/.test(xml), label);
    if (value) {
      assert.ok(lines.includes(value), label);
      assert.ok(xml.includes(value.replace(/&/g, '&amp;')), label);
    } else {
      assert.ok(!lines.some(line => line.includes('Target role:')), label);
      assert.ok(!xml.includes('Target role:'), label);
    }
  }
});

test('saved artifact loader and renderer preserve exact headline omissions without profile or title fallback', async () => {
  for (const [, value] of fixtures) {
    const saved = savedResume(value);
    const renders = [];
    const service = loadEdgeFunction('src/services/browserAgentResumeArtifact.js', {
      imports: {
        './supabase': { supabase: { auth: {
          getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        } } },
        './supabaseService.js': { getResumeById: async () => saved },
        './resumePdfDocument.js': { buildTextPdf: async snapshot => {
          renders.push(snapshot);
          return { blob: new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }) };
        } },
      }, globals: { Blob },
    }).exports;
    const request = { resumeId: 'saved-a', expectedUserId: 'owner-a', expectedRevision: 3,
      handoffId: 'handoff-a', jobKey: 'https://employer.example/job/1' };
    const preview = await service.loadBrowserAgentSavedResume(request);
    await service.prepareBrowserAgentSavedResumeArtifact(request);
    assert.equal(renders.length, 1);
    assert.equal(preview.personalInfo.jobTitle, value ?? '');
    assert.equal(renders[0].personalInfo.jobTitle, value ?? '');
    assert.deepEqual(buildResumeTextLines(preview), buildResumeTextLines(renders[0]));
    assert.ok(!buildResumeTextLines(renders[0]).some(line => /METADATA_ONLY_CEO|ROOT_ONLY_DIRECTOR/.test(line)));
  }
});
