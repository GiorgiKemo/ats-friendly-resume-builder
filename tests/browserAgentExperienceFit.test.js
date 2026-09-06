import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real fit calculation with only unrelated text/skill helpers stubbed.
// No DOM, browser messages, storage, provider requests or application writes.
const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
const names = new Set(['extractExperienceYears', 'parseCandidateExperienceYears', 'buildJobFitAnalysis']);
const functions = [];
const collect = (node) => {
  if (ts.isVariableDeclaration(node) && names.has(node.name.getText(parsed))) functions.push(`const ${node.name.getText(parsed)} = ${node.initializer.getText(parsed)};`);
  ts.forEachChild(node, collect);
};
collect(parsed);
const sharedSource = readFileSync(new URL('../browser-agent/vacancy-experience.js', import.meta.url), 'utf8');
const api = vm.runInNewContext(`${sharedSource}\n${functions.join('\n')}\n({buildJobFitAnalysis, parseCandidateExperienceYears: typeof parseCandidateExperienceYears === 'function' ? parseCandidateExperienceYears : null})`, {
  cleanText: (value) => `${value || ''}`.trim(), normalize: (value) => `${value || ''}`.toLowerCase(),
  uniqueValues: (items) => [...new Set(items)], tokenize: (value) => value.toLowerCase().split(/\s+/),
  collectCandidateRoles: () => [], collectCandidateSkills: () => [], extractTechSignals: () => [],
});
const shortOverlappingRoles = Array.from({ length: 3 }, (_, index) => ({
  title: 'Intern', company: `Synthetic ${index}`, startDate: '2025-01', endDate: '2025-02', current: false,
}));
const fit = (yearsOfExperience, experience = shortOverlappingRoles) => api.buildJobFitAnalysis({
  title: 'Engineer', description: 'Requirements: 3 years of experience.',
}, { answers: { yearsOfExperience }, experience });
const optimistic = (result) => result.strengths.some((value) => /Experience requirement looks realistic/.test(value));
const vacancyFit = (description, yearsOfExperience = 3) => api.buildJobFitAnalysis({
  title: 'Engineer', description,
}, { answers: { yearsOfExperience }, experience: shortOverlappingRoles });

test('vacancy ranges and preferred experience use only the recognized required minimum in the actual fit result', () => {
  const minimum = vacancyFit('Requirements: 3 years of experience.');
  for (const description of [
    'Requirements: 3-5 years of experience.',
    'Requirements: 3–5 years of experience.',
    'Requirements: 3 to 5 years of experience.\nPreferred Qualifications:\n8+ years of experience.',
    '3 years of experience required; 8 years of experience preferred.',
  ]) {
    const result = vacancyFit(description);
    assert.equal(result.score, minimum.score, description);
    assert.equal(optimistic(result), true, description);
  }
});

test('optional, company and multiple scoped vacancy durations remain neutral in the actual fit result', () => {
  const unknown = vacancyFit('Requirements: relevant experience.');
  for (const description of [
    'Preferred Qualifications:\n3 years of experience.',
    'Our company has 20 years of experience.',
    'Requirements:\n3 years of Java experience\n5 years of management experience',
    'Requirements:\n3 years of Java experience\n3 years of management experience',
    'Requirements: More than 3 years of experience.',
  ]) {
    const result = vacancyFit(description);
    assert.equal(result.score, unknown.score, description);
    assert.equal(optimistic(result), false, description);
    assert.equal(result.gaps.some((value) => /Experience requirement/.test(value)), false, description);
  }
});

test('an explicit zero-experience vacancy supports zero years without preferring its optional duration', () => {
  const result = vacancyFit('No experience required.\nPreferred: 1-2 years of experience.', 0);
  assert.equal(result.score, vacancyFit('Requirements: 0 years of experience.', 0).score);
  assert.equal(optimistic(result), true);
});

test('three short overlapping roles do not become three years when duration is absent', () => {
  const unknown = fit(undefined, []);
  const result = fit('');
  assert.equal(result.score, unknown.score);
  assert.equal(optimistic(result), false);
  assert.equal(result.gaps.some((value) => /Experience requirement/.test(value)), false);
});

test('explicit zero years is preserved even when multiple work records exist', () => {
  for (const value of [0, '0', '0 years']) {
    const result = fit(value);
    assert.equal(result.score, fit('0', []).score);
    assert.equal(optimistic(result), false);
    assert.ok(result.gaps.includes('Experience requirement may need reframing'));
  }
});

test('valid explicit numeric or year-qualified durations remain independent of role count', () => {
  for (const value of [3, '3', '3 years', '3 yrs', '3+', '3+ years', '3.5 years']) {
    const result = fit(value);
    assert.equal(result.score, fit(value, []).score);
    assert.equal(optimistic(result), true);
  }
});

test('blank or invalid explicit duration remains unknown instead of parsing a prefix or counting roles', () => {
  const unknown = fit(undefined, []);
  for (const value of [undefined, null, '', ' ', 'unknown', 'five', -1, '-1', Infinity, NaN, true, '3-5', '3 months', '3 teams', '3 years managing 8 teams', '1e2', '0x10']) {
    const result = fit(value);
    assert.equal(result.score, unknown.score, `Unexpected inferred duration for ${String(value)}`);
    assert.equal(optimistic(result), false, `Unexpected optimistic duration for ${String(value)}`);
  }
});

test('candidate duration parser preserves zero and fractional years without treating months as years', () => {
  assert.equal(typeof api.parseCandidateExperienceYears, 'function');
  assert.equal(api.parseCandidateExperienceYears(0), 0);
  assert.equal(api.parseCandidateExperienceYears('0.5 years'), 0.5);
  assert.equal(api.parseCandidateExperienceYears('5+ years'), 5);
  assert.equal(api.parseCandidateExperienceYears('6 months'), null);
});
