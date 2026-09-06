import test from 'node:test';
import assert from 'node:assert/strict';
import { factualProfiles, factualTailoringCorpus } from './fixtures/factual-tailoring-corpus.mjs';
import { runFactualTailoringBenchmark } from './benchmarks/factual-tailoring.mjs';

test('offline factual-tailoring corpus has explicit labels, evidence, unique IDs and every requested profile cohort', () => {
  assert.equal(new Set(factualTailoringCorpus.map((entry) => entry.id)).size, factualTailoringCorpus.length);
  for (const profile of ['junior', 'senior', 'careerchange', 'multilingual', 'technical']) {
    assert.ok(factualTailoringCorpus.some((entry) => entry.profile === profile));
  }
  for (const entry of factualTailoringCorpus) {
    assert.ok(factualProfiles[entry.profile]);
    assert.ok(['supported', 'unsupported'].includes(entry.label));
    assert.ok(entry.evidence && entry.path && entry.needle);
  }
});

test('offline benchmark checks the actual generation pipeline and keeps its known-safe controls', async () => {
  const ids = ['junior-supported-summary', 'junior-supported-bullet', 'junior-contact-identity', 'junior-new-employer',
    'senior-supported-metric', 'senior-new-quantity', 'senior-structured-dates', 'careerchange-added-skill-list',
    'careerchange-new-certification', 'multilingual-supported-prose', 'multilingual-new-numeric-value',
    'technical-distinct-skills', 'technical-project-url', 'technical-invented-additional-section',
    'junior-added-honors', 'senior-year-as-achievement', 'senior-equivalent-percent-word', 'repeated-role-wrong-tenure',
    'junior-spelled-years', 'senior-unit-reassignment', 'multilingual-spelled-years', 'technical-version-as-scale'];
  const report = await runFactualTailoringBenchmark(factualTailoringCorpus.filter((entry) => ids.includes(entry.id)));
  assert.equal(report.totals.cases, ids.length);
  assert.equal(report.totals.failed, 0);
  for (const result of report.results) assert.equal(result.stubbedProviderCalls, 1);
});
