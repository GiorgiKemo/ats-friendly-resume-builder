import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Packer } from 'docx';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';
import { getTextPdfStyle } from '../supabase/functions/_shared/resume/pdfCore.js';
import { MAX_TRACKING_RATIO, RESUME_TEMPLATES, RESUME_TEMPLATE_IDS } from '../supabase/functions/_shared/resume/templates.js';

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

test('ATS-friendly text export follows the selected preview section order', () => {
  const lines = buildResumeTextLines({
    ...exportFixture,
    selectedTemplate: 'ats-friendly',
  });
  assert.ok(lines.indexOf('SKILLS') < lines.indexOf('EXPERIENCE'));
  assert.ok(lines.indexOf('EXPERIENCE') < lines.indexOf('EDUCATION'));
});

test('PDF export styling follows the selected template without changing text semantics', () => {
  assert.equal(getTextPdfStyle('modern').name, 'Horizon');
  assert.deepEqual(getTextPdfStyle('modern').accentColor, [15, 118, 110]);
  assert.equal(getTextPdfStyle('traditional').nameUppercase, true);
  assert.equal(getTextPdfStyle('traditional').nameAlign, 'center');
  assert.equal(getTextPdfStyle('ats-friendly').sectionLabels.SKILLS, 'Core Competencies');
  assert.equal(getTextPdfStyle('ats-friendly').sectionLabels.CERTIFICATIONS, 'Certifications & Licenses');
  assert.equal(getTextPdfStyle('ats-friendly').sectionLabels.PROJECTS, 'Additional Projects');
  assert.equal(getTextPdfStyle('minimalist').sectionLabels.SUMMARY, 'Summary');
  assert.equal(getTextPdfStyle('minimalist').sectionLabels.EXPERIENCE, 'Experience');
  assert.equal(getTextPdfStyle('unknown-template').nameAlign, getTextPdfStyle('basic').nameAlign);
});

test('every template keeps letter spacing narrow enough for PDF text extraction', () => {
  // Wider tracking makes extractors split headings into single letters ("S U M M A R Y").
  for (const id of RESUME_TEMPLATE_IDS) {
    const { header, heading } = RESUME_TEMPLATES[id];
    assert.ok(heading.tracking <= heading.size * MAX_TRACKING_RATIO, `${id} heading tracking`);
    assert.ok(header.nameTracking <= header.nameSize * MAX_TRACKING_RATIO, `${id} name tracking`);
  }
});

test('each template writes its headings, dates and body as real text in reading order', async () => {
  for (const id of RESUME_TEMPLATE_IDS) {
    const { pdf } = await buildTextPdf({ ...exportFixture, selectedTemplate: id }, fontData);
    const operations = pdf.internal.pages.flat().join('\n').toLowerCase();
    const glyphText = (text) => [...text].map((character) => pdf.getFont().metadata.characterToGlyph(character.codePointAt(0)).toString(16).padStart(4, '0')).join('');
    const label = RESUME_TEMPLATES[id].labels.experience;
    const heading = RESUME_TEMPLATES[id].heading.case === 'upper' ? label.toUpperCase() : label;
    const name = RESUME_TEMPLATES[id].header.nameCase === 'upper' ? 'JOSÉ MÜLLER' : 'José Müller';
    const positions = [glyphText(name), glyphText(heading), glyphText('Jan 2022 – Present'), glyphText('Achievement 7')]
      .map((needle) => operations.indexOf(needle));
    assert.ok(positions.every((position) => position >= 0), `${id} renders every expected string`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${id} keeps name, heading, dates and bullets in reading order`);
  }
});

test('PDF exports embed a Unicode character map and retain international names', async () => {
  const { pdf, blob } = await buildTextPdf(exportFixture, fontData);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(blob.size > 1000);
  assert.ok(pdf.output().includes('/ToUnicode'));
  assert.ok(pdf.getFont().metadata.characterToGlyph('გ'.codePointAt(0)) > 0);
});

test('PDF uses Inter when it covers every character and falls back to DejaVu for other scripts', async () => {
  const fonts = {
    fallback: fontData,
    regular: await readFile(new URL('../src/assets/fonts/Inter-Regular.ttf', import.meta.url), 'base64'),
    bold: await readFile(new URL('../src/assets/fonts/Inter-Bold.ttf', import.meta.url), 'base64'),
  };
  const latin = await buildTextPdf({
    ...exportFixture,
    personalInfo: { ...exportFixture.personalInfo, fullName: 'José Müller' },
    additionalSections: [{ title: 'Languages', content: 'English, Spanish' }],
  }, fonts);
  const latinOutput = latin.pdf.output();
  assert.match(latinOutput, /\/BaseFont \/\w*Inter/);
  assert.doesNotMatch(latinOutput, /\/BaseFont \/\w*DejaVu/);

  const georgian = await buildTextPdf(exportFixture, fonts);
  const georgianOutput = georgian.pdf.output();
  assert.match(georgianOutput, /\/BaseFont \/\w*DejaVu/);
  assert.doesNotMatch(georgianOutput, /\/BaseFont \/\w*Inter/);
  assert.ok(georgian.pdf.getFont().metadata.characterToGlyph('გ'.codePointAt(0)) > 0);
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

test('DOCX export follows each template preview section order', async () => {
  const docxXml = async (selectedTemplate) => {
    const buffer = await Packer.toBuffer(createResumeDocxDocument({ ...exportFixture, selectedTemplate }));
    const zip = await JSZip.loadAsync(buffer);
    return zip.file('word/document.xml').async('string');
  };

  const atsXml = await docxXml('ats-friendly');
  assert.ok(atsXml.indexOf('Core Competencies') < atsXml.indexOf('Professional Experience'));

  const basicXml = await docxXml('basic');
  assert.ok(basicXml.indexOf('Work Experience') < basicXml.indexOf('Skills'));
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
