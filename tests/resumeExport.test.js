import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Packer } from 'docx';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';

// Inspect the OOXML with the ZIP library already used by the document packer.
const require = createRequire(import.meta.url);
const JSZip = require(require.resolve('jszip', { paths: [dirname(require.resolve('docx'))] }));

const fontData = await readFile(new URL('../src/assets/fonts/DejaVuSans.ttf', import.meta.url), 'base64');

export const exportFixture = {
  personalInfo: {
    fullName: 'José Müller გიორგი', jobTitle: 'Software Engineer',
    email: 'jose@example.com', location: 'Tbilisi, Georgia',
    summary: 'Software engineer building reliable tools for multilingual teams.',
  },
  workExperience: [{
    jobTitle: 'Software Engineer', company: 'Example', startDate: '2022-01', current: true,
    description: Array.from({ length: 7 }, (_, index) => `- Achievement ${index + 1}: improved an existing product workflow.`).join('\n'),
  }],
  education: [{ institution: 'University', degree: 'Computer Science', startDate: '2018', endDate: '2022' }],
  skills: ['C#', 'C++', 'Node.js'],
  projects: [{ title: 'Portfolio', technologies: ['React', 'Node.js'], startDate: '2023', endDate: '2024', description: 'Built a searchable catalogue.' }],
  additionalSections: [{ title: 'Languages', content: 'English, ქართული' }],
};

test('PDF export text retains all bullets, project technologies, dates and Unicode', () => {
  const lines = buildResumeTextLines(exportFixture).join('\n');
  assert.ok(lines.includes('José Müller გიორგი'));
  assert.ok(lines.includes('Achievement 7'));
  assert.ok(lines.includes('React\nNode.js'));
  assert.ok(lines.includes('2023 - 2024'));
  assert.ok(lines.includes('ქართული'));
  assert.ok(!lines.includes('- -'));
});

test('PDF exports embed a Unicode character map and retain international names', async () => {
  const { pdf, blob } = await buildTextPdf(exportFixture, fontData);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(blob.size > 1000);
  assert.ok(pdf.output().includes('/ToUnicode'));
  assert.ok(pdf.getFont().metadata.characterToGlyph('გ'.codePointAt(0)) > 0);
});

test('PDF explicitly reports unsupported glyphs instead of silently deleting candidate text', async () => {
  await assert.rejects(buildTextPdf({ personalInfo: { fullName: '山田太郎' } }, fontData), /Download DOCX/);
});

test('PDF export paginates long work history without truncation', async () => {
  const longResume = {
    ...exportFixture,
    workExperience: Array.from({ length: 12 }, (_, index) => ({
      ...exportFixture.workExperience[0], company: `Company ${index + 1}`,
    })),
  };
  const { pdf } = await buildTextPdf(longResume, fontData);
  assert.ok(pdf.getNumberOfPages() > 1);
  assert.ok(buildResumeTextLines(longResume).join('\n').includes('Company 12'));
});

test('DOCX export keeps all candidate text and uses one native bullet per achievement', async () => {
  const buffer = await Packer.toBuffer(createResumeDocxDocument(exportFixture));
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('José Müller გიორგი'));
  assert.ok(xml.includes('Achievement 7'));
  assert.ok(xml.includes('ქართული'));
  assert.ok(xml.includes('<w:numPr>'));
  assert.ok(xml.includes('<w:keepNext/>'));
  assert.ok(!xml.includes('>- Achievement'));
});

test('DOCX export tolerates malformed optional sections without inserting identity placeholders', async () => {
  const doc = createResumeDocxDocument({ skills: [null], workExperience: {}, education: null });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(!xml.includes('Full Name'));
  assert.ok(!xml.includes('Job Title'));
  assert.ok(!xml.includes('[object Object]'));
});

test('DOCX export preserves blank certification dates and project titles without placeholders', async () => {
  const doc = createResumeDocxDocument({
    certifications: [{ name: 'Course completion', issuer: 'Institute', date: '' }],
    projects: [{ description: 'Built a source-described prototype.' }],
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('Course completion'));
  assert.ok(!xml.includes('Issue Date: Not Specified'));
  assert.ok(xml.includes('Built a source-described prototype.'));
  assert.ok(!xml.includes('Project Name'));
});
