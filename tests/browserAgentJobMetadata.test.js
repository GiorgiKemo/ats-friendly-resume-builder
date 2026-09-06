import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
const names = new Set(['cleanupTitle', 'cleanupCompany', 'cleanupLocation', 'deriveTitleFromDocumentTitle', 'deriveCompanyFromDocumentTitle', 'extractDomJobPosting']);
const functions = [];
const collect = (node) => {
  if (ts.isVariableDeclaration(node) && names.has(node.name.getText(parsed))) {
    functions.push(`const ${node.name.getText(parsed)} = ${node.initializer.getText(parsed)};`);
  }
  ts.forEachChild(node, collect);
};
collect(parsed);
assert.equal(functions.length, names.size);

const setup = (explicitCompany = '') => vm.runInNewContext(`${functions.join('\n')}\n({cleanupTitle, extractDomJobPosting})`, {
  compactLine: (value) => value.replace(/\s+/g, ' ').trim(),
  document: { title: 'Job Application for Graduate Frontend Engineer - React/TypeScript at Bitpanda' },
  provider: 'greenhouse',
  PROVIDER_SELECTORS: { greenhouse: { title: ['title'], company: ['company'] }, generic: {} },
  queryFirstText: (selectors) => selectors?.[0] === 'title' ? 'Graduate Frontend Engineer - React/TypeScript' : selectors?.[0] === 'company' ? explicitCompany : '',
  getExtractionPageText: () => 'Graduate Frontend Engineer\nBuy assets with any sized budget, 24/7.',
  extractJobFactsFromPageText: () => ({ company: 'with any sized budget, 24', location: 'Bucharest' }),
  extractMetaText: () => '', buildDescriptionFromSelectors: () => '',
  cleanDescriptionText: (text) => text, extractSalaryText: () => '',
});

test('employer title metadata outranks prose guesses on real Greenhouse page shapes', () => {
  const snapshot = setup().extractDomJobPosting();
  assert.equal(snapshot.company, 'Bitpanda');
  assert.equal(snapshot.title, 'Graduate Frontend Engineer - React/TypeScript');
  assert.equal(setup('Explicit Employer').extractDomJobPosting().company, 'Explicit Employer');
});

test('job title cleanup preserves specializations while removing remote and site suffixes', () => {
  const { cleanupTitle } = setup();
  assert.equal(cleanupTitle('Graduate Frontend Engineer - React/TypeScript'), 'Graduate Frontend Engineer - React/TypeScript');
  assert.equal(cleanupTitle('Engineer - Remote'), 'Engineer');
  assert.equal(cleanupTitle('Engineer | Acme'), 'Engineer');
});
