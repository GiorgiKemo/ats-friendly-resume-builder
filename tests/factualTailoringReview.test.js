import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { factualProfiles, factualTailoringCorpus } from './fixtures/factual-tailoring-corpus.mjs';
import { generateOfflineReview, runFactualTailoringBenchmark } from './benchmarks/factual-tailoring.mjs';
import { assertCommittedResume, isResumeTailoringReview, keepOriginalResumeTailoring, resolveResumeTailoringReview } from '../src/utils/resumeTailoringReview.js';

const reportPromise = runFactualTailoringBenchmark();

test('all 23 unsupported corpus claims stay out of the actual service source-only materialization', async () => {
  const report = await reportPromise;
  assert.equal(report.reviewBoundary.envelopes, 30);
  assert.equal(report.totals.unsupported, 23);
  assert.equal(report.reviewBoundary.unsupportedRetainedInSourceOnly, 0);
  for (const result of report.results.filter((entry) => entry.label === 'unsupported')) {
    assert.equal(result.reviewKind, 'resume-tailoring-review', result.id);
    assert.equal(result.reviewVersion, 1, result.id);
    assert.equal(result.sourceOnlyRetained, false, result.id);
    assert.equal(result.stubbedProviderCalls, 1, result.id);
  }
});

test('all seven faithful corpus candidates remain available after explicit review without calling proposals verified', async () => {
  const report = await reportPromise;
  assert.equal(report.totals.supported, 7);
  assert.equal(report.reviewBoundary.supportedAvailableAfterExplicitAcceptance, 7);
  assert.equal(report.totals.supportedRejected, 0);
  for (const result of report.results.filter((entry) => entry.label === 'supported')) {
    assert.equal(result.candidateRetainedAfterExplicitAcceptance, true, result.id);
  }
});

test('the risk gate keeps unsupported proposals out of default resolution while preserving controls', async () => {
  const report = await reportPromise;
  assert.equal(report.totals.cases, 30);
  assert.equal(report.totals.unsupportedRetained, 0);
  assert.equal(report.totals.failed, 0);
  for (const result of report.results.filter((entry) => entry.label === 'unsupported')) {
    assert.equal(result.candidateRetainedAfterExplicitAcceptance, false, result.id);
    for (const suggestion of result.relevantSuggestions) {
      assert.equal(suggestion.risk?.level, 'high', result.id);
      assert.equal(suggestion.risk?.confirmationRequired, true, result.id);
    }
  }
  for (const id of ['junior-spelled-years', 'senior-unit-reassignment', 'multilingual-spelled-years', 'technical-version-as-scale']) {
    assert.equal(report.results.find((entry) => entry.id === id)?.passed, true, id);
  }
});

test('an actual service review cannot be committed before every changed passage is decided', async () => {
  const entry = factualTailoringCorpus.find((item) => item.id === 'junior-supported-bullet');
  const { review } = await generateOfflineReview(factualProfiles[entry.profile], entry.candidate);
  assert.ok(isResumeTailoringReview(review));
  assert.ok(review.suggestions.length > 0);
  assert.throws(() => assertCommittedResume(review));
  assert.throws(() => resolveResumeTailoringReview(review, {}));
  const original = keepOriginalResumeTailoring(review);
  assert.doesNotThrow(() => assertCommittedResume(original));
  assert.ok(original.workExperience[0].description.includes('Built responsive pages'));
  const selected = resolveResumeTailoringReview(review, Object.fromEntries(review.suggestions.map(({ id }) => [id, { choice: 'suggested', reviewId: review.reviewId }])));
  assert.doesNotThrow(() => assertCommittedResume(selected));
  assert.ok(selected.workExperience[0].description.includes(entry.needle));
});

test('raw model summary aliases and public/ownership/review metadata cannot leak into the source-only envelope', async () => {
  const malicious = {
    summary: 'Executive leader with 99 years of NASA research', isPublic: true,
    id: 'model-owned-id', user_id: 'other-account', revision: 999,
    kind: 'resume-tailoring-review', version: 1,
    sourceInfo: { fullName: 'Invented Candidate', userId: 'other-account' },
    baseResume: { personalInfo: { summary: 'Forged base claim' }, isPublic: true },
    suggestions: [{ id: 'summary', original: '', proposed: 'Forged trusted claim' }],
    reviewStatus: 'approved', reviewed: true, decisions: { summary: { choice: 'suggested' } },
  };
  const { review } = await generateOfflineReview({ skills: ['HTML'] }, malicious);
  assert.ok(isResumeTailoringReview(review));
  assert.throws(() => assertCommittedResume(review));
  for (const result of [review.baseResume, keepOriginalResumeTailoring(review)]) {
    assert.ok(!JSON.stringify(result).includes('NASA'));
    assert.ok(!JSON.stringify(result).includes('Forged'));
    assert.notEqual(result.isPublic, true);
    assert.notEqual(result.id, 'model-owned-id');
    assert.notEqual(result.user_id, 'other-account');
    assert.notEqual(result.revision, 999);
    assert.equal(result.summary, undefined);
    assert.equal(result.reviewStatus, undefined);
    assert.equal(result.reviewed, undefined);
    assert.equal(result.decisions, undefined);
  }
});

test('pre-review benchmark evidence is preserved as historical data, not rewritten into a green result', async () => {
  const baseline = JSON.parse(await readFile(new URL('../docs/audit-2026-09-04/factual-tailoring-baseline.json', import.meta.url), 'utf8'));
  const previous = JSON.parse(await readFile(new URL('../docs/audit-2026-09-04/factual-tailoring-current.json', import.meta.url), 'utf8'));
  assert.equal(baseline.totals.cases, 30);
  assert.equal(baseline.totals.failed, 15);
  assert.equal(previous.totals.cases, 30);
  assert.equal(previous.totals.failed, 11);
});
