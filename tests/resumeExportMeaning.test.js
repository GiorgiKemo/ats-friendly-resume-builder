import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Packer } from 'docx';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';

const require = createRequire(import.meta.url);
const JSZip = require(require.resolve('jszip', { paths: [dirname(require.resolve('docx'))] }));
const fontData = await readFile(new URL('../src/assets/fonts/DejaVuSans.ttf', import.meta.url), 'base64');
const resume = {
  personalInfo: { fullName: 'Synthetic Export Check', summary: 'A classroom simulation, not production experience.' },
  workExperience: [{ title: 'Analyst', company: 'Example', description: [
    '-20% year-over-year test result, not a positive increase.',
    '-0.5 points in the synthetic comparison.',
    '- Documented > 2 ms and < 10 ms; approximately ~20 requests/sec.',
    '~~Led~~ Assisted the classroom exercise.',
  ].join('\n') }],
};

let vite;
let Template;
before(async () => {
  vite = await createServer({
    configFile: false, cacheDir: 'node_modules/.vite-qa-export-meaning',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', esbuild: { jsx: 'automatic' },
  });
  Template = (await vite.ssrLoadModule('/src/components/templates/ATSFriendlyTemplate.jsx')).default;
});
after(async () => { await vite?.close(); });

test('PDF text materialization distinguishes a signed number from a whitespace-delimited bullet', () => {
  const text = buildResumeTextLines(resume).join('\n');
  assert.ok(text.includes('- -20% year-over-year test result'));
  assert.ok(text.includes('- -0.5 points'));
  assert.ok(text.includes('- Documented > 2 ms and < 10 ms; approximately ~20 requests/sec.'));
  assert.ok(text.includes('~~Led~~ Assisted'));
  assert.ok(!text.includes('- - Documented'));
});

test('actual PDF renderer writes the negative signs and comparison qualifiers into text operations', async () => {
  const { pdf, blob } = await buildTextPdf(resume, fontData);
  const operations = pdf.internal.pages.flat().join('\n').toLowerCase();
  const glyphText = (text) => [...text].map((character) => pdf.getFont().metadata.characterToGlyph(character.codePointAt(0)).toString(16).padStart(4, '0')).join('');
  for (const expected of ['- -20%', '- -0.5', '> 2 ms', '< 10 ms', '~20 requests/sec.', '~~Led~~ Assisted']) {
    assert.ok(operations.includes(glyphText(expected)), expected);
  }
  if (process.env.WRITE_RESUME_PDF_FIXTURE === '1') {
    await mkdir('playwright-audit/resume-exports', { recursive: true });
    await writeFile('playwright-audit/resume-exports/signed-values.pdf', new Uint8Array(await blob.arrayBuffer()));
  }
});

test('actual DOCX XML preserves signed quantities, comparison operators and caveats', async () => {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(createResumeDocxDocument(resume)));
  const xml = await zip.file('word/document.xml').async('string');
  for (const expected of ['-20% year-over-year test result', '-0.5 points', '&gt; 2 ms', '&lt; 10 ms', '~20 requests/sec.', '~~Led~~ Assisted', 'not production experience']) {
    assert.ok(xml.includes(expected), expected);
  }
  assert.ok(!xml.includes('>- Documented'));
});

test('actual preview template preserves signed lines even when adjacent lines use bullets', () => {
  const markup = renderToStaticMarkup(React.createElement(Template, {
    resume: { ...resume, projects: [{ title: 'Class exercise', description: resume.workExperience[0].description }] },
  }));
  for (const expected of ['>-20% year-over-year test result', '>-0.5 points', '&gt; 2 ms', '&lt; 10 ms', '~20 requests/sec.', '~~Led~~ Assisted']) {
    assert.ok(markup.includes(expected), expected);
  }
  assert.ok(!markup.includes('>- Documented'));
});
