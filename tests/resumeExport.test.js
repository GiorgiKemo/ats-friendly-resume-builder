import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Packer } from 'docx';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';
import { getTextPdfStyle } from '../supabase/functions/_shared/resume/pdfCore.js';
import { MAX_TRACKING_RATIO, RESUME_TEMPLATES, RESUME_TEMPLATE_IDS } from '../supabase/functions/_shared/resume/templates.js';
import { drawnText, embeddedFonts, pageCount } from './helpers/pdfInspect.js';

// Inspect the OOXML with the ZIP library already used by the document packer.
const require = createRequire(import.meta.url);
const JSZip = require(require.resolve('jszip', { paths: [dirname(require.resolve('docx'))] }));

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
    const result = await buildTextPdf({ ...exportFixture, selectedTemplate: id });
    const lines = drawnText(result);
    const label = RESUME_TEMPLATES[id].labels.experience;
    const heading = RESUME_TEMPLATES[id].heading.case === 'upper' ? label.toUpperCase() : label;
    const name = RESUME_TEMPLATES[id].header.nameCase === 'upper' ? 'JOSÉ MÜLLER გიორგი' : 'José Müller გიორგი';
    const positions = [name, heading, 'Jan 2022 – Present', 'Achievement 7']
      .map((needle) => lines.findIndex((line) => line.includes(needle)));
    assert.ok(positions.every((position) => position >= 0), `${id} renders every expected string`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${id} keeps name, heading, dates and bullets in reading order`);
  }
});

test('PDF exports embed extractable fonts and retain international names', async () => {
  const result = await buildTextPdf(exportFixture);
  assert.equal(result.pdf.getNumberOfPages(), 1);
  assert.ok(result.blob.size > 1000);
  const fonts = await embeddedFonts(result.bytes);
  assert.ok(fonts.length > 0);
  assert.ok(fonts.every((font) => font.hasToUnicode && font.hasCidToGidMap), 'every font maps glyphs back to text');
  assert.ok(drawnText(result).some((line) => line.includes('José Müller გიორგი')));
});

test('PDF picks a font per script: Inter for Latin text and Noto Sans Georgian for Georgian', async () => {
  const latin = await buildTextPdf({
    ...exportFixture,
    personalInfo: { ...exportFixture.personalInfo, fullName: 'José Müller' },
    additionalSections: [{ title: 'Languages', content: 'English, Spanish' }],
  });
  const latinFonts = (await embeddedFonts(latin.bytes)).map((font) => font.name);
  assert.ok(latinFonts.some((name) => name.startsWith('Inter')));
  assert.ok(!latinFonts.some((name) => /DejaVu|Noto/.test(name)), 'Latin-only resumes embed only Inter');

  const mixed = await buildTextPdf(exportFixture);
  const mixedFonts = (await embeddedFonts(mixed.bytes)).map((font) => font.name);
  assert.ok(mixedFonts.some((name) => name.startsWith('Inter')), 'Latin text stays in Inter');
  assert.ok(mixedFonts.some((name) => name.startsWith('NotoSansGeorgian')), 'Georgian text uses Noto Sans Georgian');
});

test('PDF renders Chinese, Japanese, Korean, Arabic, Hindi and Bengali text', async () => {
  const samples = {
    zh: ['王小明', 'NotoSansSC'], ja: ['山田太郎', 'NotoSansJP'], ko: ['김민준', 'NotoSansKR'],
    ar: ['أحمد الخطيب', 'NotoSansArabic'], hi: ['प्रिया शर्मा', 'NotoSansDevanagari'], bn: ['রাহুল দাস', 'NotoSansBengali'],
  };
  for (const [language, [fullName, font]] of Object.entries(samples)) {
    const result = await buildTextPdf({ personalInfo: { fullName, email: 'a@example.com' }, language });
    assert.ok((await embeddedFonts(result.bytes)).some((entry) => entry.name.startsWith(font)), `${language} embeds ${font}`);
    assert.equal(result.direction, language === 'ar' ? 'rtl' : 'ltr', `${language} direction`);
  }
});

test('PDF explicitly reports unsupported glyphs instead of silently deleting candidate text', async () => {
  // Egyptian hieroglyphs are outside every bundled font.
  await assert.rejects(buildTextPdf({ personalInfo: { fullName: '𓀀𓀁' } }), /Download DOCX/);
});

test('PDF export paginates long work history without truncation', async () => {
  const longResume = {
    ...exportFixture,
    workExperience: Array.from({ length: 12 }, (_, index) => ({
      ...exportFixture.workExperience[0], company: `Company ${index + 1}`,
    })),
  };
  const result = await buildTextPdf(longResume);
  assert.ok(result.pdf.getNumberOfPages() > 1);
  assert.equal(await pageCount(result.bytes), result.pageCount);
  assert.ok(drawnText(result).some((line) => line.includes('Company 12')));
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
