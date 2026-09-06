import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const fontData = await readFile(new URL('../src/assets/fonts/DejaVuSans.ttf', import.meta.url), 'base64');

// The obsolete profile-derived PDF helper has been removed. Exercise the real
// revision-bound artifact service with the real renderer instead.
function setup() {
  let saved;
  let documentResume;
  let rendered;
  const unused = () => { throw new Error('No Storage, profile fallback, or provider request is allowed'); };
  const service = loadEdgeFunction('src/services/browserAgentResumeArtifact.js', {
    imports: {
      './supabase': { supabase: { auth: {
        getUser: async () => ({ data: { user: { id: 'owner-a' } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      }, storage: { from: unused }, functions: { invoke: unused } } },
      './supabaseService.js': { getResumeById: async () => saved },
      './resumePdfDocument.js': { buildTextPdf: async (resume) => {
        documentResume = resume;
        rendered = await buildTextPdf(resume, fontData);
        return rendered;
      } },
    }, globals: { Blob },
  }).exports;
  return {
    create: async (resume) => {
      saved = { ...resume, id: 'saved-a', user_id: 'owner-a', revision: 3 };
      const result = await service.prepareBrowserAgentSavedResumeArtifact({
        resumeId: saved.id, expectedUserId: saved.user_id, expectedRevision: 3,
        handoffId: 'handoff-a', jobKey: 'https://employer.example/jobs/1',
      });
      assert.equal(result.resume.revision, 3);
      return new Blob([Buffer.from(result.document.base64, 'base64')], { type: result.document.mimeType });
    },
    get source() { return documentResume; },
    get rendered() { return rendered; },
  };
}

test('exact selected extension PDF preserves Unicode names, all bullets, certifications and project details', async () => {
  const app = setup();
  const resume = {
    personalInfo: { fullName: 'José Müller გიორგი', email: 'jose@example.com', phone: '+995 555 000 000', summary: 'Engineer building accessible tools.' },
    workExperience: [{ title: 'Engineer', company: 'Example', description: Array.from({ length: 7 }, (_, index) => `Achievement ${index + 1}: built a reliable workflow.`).join('\n') }],
    skills: ['C++', 'ქართული'],
    certifications: [{ name: 'Technical course', issuer: 'Institute', issueDate: '2024-06' }],
    projects: [{ title: 'Portfolio', technologies: ['React', 'Node.js'], startDate: '2023', endDate: '2024', description: 'Built a catalogue.' }],
  };
  const blob = await app.create(resume);
  const lines = buildResumeTextLines(app.source).join('\n');
  for (const text of ['José Müller გიორგი', 'Achievement 7', 'ქართული', 'Technical course', '2024-06', 'Node.js', '2023 - 2024', '+995 555 000 000']) assert.ok(lines.includes(text), text);
  assert.ok(blob.size > 1000);
  assert.ok(app.rendered.pdf.output().includes('/ToUnicode'));
  if (process.env.WRITE_RESUME_PDF_FIXTURE === '1') {
    await mkdir('playwright-audit/resume-exports', { recursive: true });
    await writeFile('playwright-audit/resume-exports/extension-unicode.pdf', new Uint8Array(await blob.arrayBuffer()));
  }
});

test('selected extension PDF retains deliberately omitted resume sections without profile lookup', async () => {
  const app = setup();
  await app.create({ personalInfo: { fullName: 'Candidate' }, workExperience: [], skills: [] });
  assert.equal(app.source.workExperience.length, 0);
  assert.equal(app.source.skills.length, 0);
  assert.equal(app.source.personalInfo.phone, undefined);
});

test('selected extension PDF rejects unsupported scripts instead of silently corrupting a name', async () => {
  const app = setup();
  await assert.rejects(app.create({ personalInfo: { fullName: '山田太郎' } }), /Download DOCX/);
});
