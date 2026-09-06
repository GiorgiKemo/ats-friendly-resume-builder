import test from 'node:test';
import assert from 'node:assert/strict';
import { Packer } from 'docx';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createResumeTailoringReview, isResumeTailoringReview, keepOriginalResumeTailoring, resolveResumeTailoringReview } from '../src/utils/resumeTailoringReview.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';

const require = createRequire(import.meta.url);
const JSZip = require(require.resolve('jszip', { paths: [dirname(require.resolve('docx'))] }));

export function reviewFixture() {
  const baseResume = {
    personalInfo: { fullName: 'Synthetic Candidate', summary: 'Source summary.' },
    workExperience: [{ id: 'role-a', title: 'Analyst', company: 'Example', startDate: '2020', endDate: '2021', description: 'Source work.', achievements: 'Legacy work.' }],
    projects: [{ id: 'project-a', title: 'Portfolio', description: 'Source project.', details: 'Legacy project.' }],
    atsQuality: { score: 100 }, skills: ['HTML'],
  };
  const candidateResume = structuredClone(baseResume);
  candidateResume.personalInfo.summary = 'Suggested summary.';
  candidateResume.workExperience[0].description = 'Suggested work.';
  candidateResume.projects[0].description = 'Suggested project.';
  return { baseResume, candidateResume };
}
const choices = (review, choice = 'suggested', text) => Object.fromEntries(review.suggestions.map(({ id }) => [id, { choice, reviewId: review.reviewId, ...(text !== undefined ? { text } : {}) }]));

test('review snapshots do not mutate source inputs or inherit provider metadata', () => {
  const { baseResume, candidateResume } = reviewFixture();
  Object.assign(candidateResume, { isPublic: true, summary: 'Untrusted alias', reviewed: true, arbitrary: { claim: 'Injected' } });
  const review = createResumeTailoringReview({ baseResume, candidateResume, sourceInfo: { ownerId: 'owner-a', authToken: 'not allowed' } });
  baseResume.personalInfo.summary = 'Typed later';
  candidateResume.workExperience[0].description = 'Changed later';
  assert.equal(review.baseResume.personalInfo.summary, 'Source summary.');
  assert.equal(review.suggestions.find((item) => item.id === 'work:0').proposed, 'Suggested work.');
  assert.equal(review.baseResume.isPublic, undefined);
  assert.equal(review.baseResume.summary, undefined);
  assert.equal(review.baseResume.arbitrary, undefined);
  assert.equal(review.sourceInfo.authToken, undefined);
  assert.ok(Object.isFrozen(review.suggestions[0]));
  assert.ok(Object.isFrozen(review.baseResume.workExperience[0]));
});

test('misaligned duplicate tenures do not become index-bound review proposals', () => {
  const baseResume = { personalInfo: {}, workExperience: [
    { title: 'Analyst', company: 'Example', startDate: '2018', endDate: '2019', description: 'Inventory records.' },
    { title: 'Analyst', company: 'Example', startDate: '2023', endDate: '2024', description: 'Payroll reports.' },
  ] };
  const candidateResume = { personalInfo: {}, workExperience: [...baseResume.workExperience].reverse().map((item) => ({ ...item, description: `Suggested ${item.description}` })) };
  const review = createResumeTailoringReview({ baseResume, candidateResume });
  assert.equal(review.suggestions.length, 0);
  assert.equal(keepOriginalResumeTailoring(review).workExperience[0].description, 'Inventory records.');
});

test('missing, invalid, extra or unknown-target decisions cannot resolve a review', () => {
  const review = createResumeTailoringReview(reviewFixture());
  for (const decisions of [{}, [], { ...choices(review), obsolete: { choice: 'suggested' } }, { ...choices(review), summary: { choice: 'approved' } }, { ...choices(review), summary: { choice: 'edited', text: null } }]) {
    assert.throws(() => resolveResumeTailoringReview(review, decisions), { code: 'TAILORING_REVIEW_REQUIRED' });
  }
  for (const change of [
    (copy) => { copy.version = 999; },
    (copy) => { copy.suggestions[0].id = 'work:999'; },
    (copy) => { copy.suggestions[0].original = 'Forged origin'; },
    (copy) => { copy.suggestions.push(copy.suggestions[0]); },
    (copy) => { copy.suggestions[0].evidence = [{}]; },
  ]) {
    const copy = structuredClone(review);
    change(copy);
    assert.equal(isResumeTailoringReview(copy), false);
    assert.throws(() => keepOriginalResumeTailoring(copy));
  }
});

test('explicit edited prose survives exactly and invalidates the old ATS snapshot', () => {
  const review = createResumeTailoringReview(reviewFixture());
  const edited = '  I supported my manager.\nObserved > 2 and < 10, ~20 trials; not production.  ';
  const result = resolveResumeTailoringReview(review, choices(review, 'edited', edited));
  assert.equal(result.personalInfo.summary, edited);
  assert.equal(result.workExperience[0].description, edited);
  assert.equal(result.workExperience[0].responsibilities, edited);
  assert.equal(result.projects[0].description, edited);
  assert.equal(result.atsQuality, undefined);
  assert.equal(review.baseResume.personalInfo.summary, 'Source summary.');
});

test('high-consequence wording is flagged and fails closed until the user confirms accuracy', () => {
  const review = createResumeTailoringReview({
    baseResume: { personalInfo: { summary: 'Support engineer improving customer workflows.' } },
    candidateResume: { personalInfo: { summary: 'Executive engineering leader with global hiring and budget ownership.' } },
  });
  assert.equal(review.suggestions.length, 1);
  assert.equal(review.suggestions[0].risk.level, 'high');
  assert.equal(review.suggestions[0].risk.confirmationRequired, true);
  assert.ok(review.suggestions[0].risk.reasons.length > 0);

  const unconfirmed = resolveResumeTailoringReview(review, choices(review));
  assert.equal(unconfirmed.personalInfo.summary, 'Support engineer improving customer workflows.');

  const confirmed = resolveResumeTailoringReview(review, {
    summary: { choice: 'suggested', confirmRisk: true, reviewId: review.reviewId },
  });
  assert.equal(confirmed.personalInfo.summary, 'Executive engineering leader with global hiring and budget ownership.');
});

test('decisions for an earlier review cannot approve different proposals with identical field IDs', () => {
  const previous = createResumeTailoringReview(reviewFixture());
  const nextInputs = reviewFixture();
  nextInputs.candidateResume.personalInfo.summary = 'A different claim never reviewed.';
  const next = createResumeTailoringReview(nextInputs);
  assert.notEqual(previous.reviewId, next.reviewId);
  assert.deepEqual(previous.suggestions.map((item) => item.id), next.suggestions.map((item) => item.id));
  assert.throws(() => resolveResumeTailoringReview(next, choices(previous)), { code: 'TAILORING_REVIEW_REQUIRED' });
  assert.equal(resolveResumeTailoringReview(previous, choices(previous)).personalInfo.summary, 'Suggested summary.');
});

test('explicitly clearing reviewed prose cannot revive legacy aliases during PDF or DOCX materialization', async () => {
  const review = createResumeTailoringReview(reviewFixture());
  const result = resolveResumeTailoringReview(review, choices(review, 'edited', ''));
  const lines = buildResumeTextLines(result).join('\n');
  assert.ok(!lines.includes('Legacy project'), 'PDF materialization restored a deliberately cleared project alias');
  const zip = await JSZip.loadAsync(await Packer.toBuffer(createResumeDocxDocument(result)));
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(!xml.includes('Legacy work'), 'DOCX materialization restored a deliberately cleared work alias');
  assert.ok(!xml.includes('Legacy project'));
});
