import { build } from 'esbuild';
import vm from 'node:vm';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import { factualProfiles, factualTailoringCorpus } from '../fixtures/factual-tailoring-corpus.mjs';
import { enforceAuthenticResumeSections } from '../../src/utils/resumeAuthenticity.js';
import { hardenGeneratedResumeForAts } from '../../src/utils/generatedResumeQuality.js';
import { isResumeTailoringReview, keepOriginalResumeTailoring, resolveResumeTailoringReview } from '../../src/utils/resumeTailoringReview.js';

const jobDescription = 'Job Title: Software Engineer\nCompany: Benchmark Target\nBuild accessible, reliable software using documented experience.';
const normalize = (text) => String(text ?? '').normalize('NFKC').toLowerCase();
const valueAt = (value, path) => path.split('.').reduce((result, key) => result?.[key], value);
const { structuredClone, AbortController, URL } = globalThis;
const probeValue = (result, entry) => {
  if (entry.recordMatch) {
    const [collection, , field] = entry.path.split('.');
    return result[collection]?.find((record) => Object.entries(entry.recordMatch).every(([key, value]) => record[key] === value))?.[field];
  }
  return valueAt(result, entry.path);
};
const includesProbe = (result, entry) => {
  const field = probeValue(result, entry);
  return normalize(typeof field === 'string' ? field : JSON.stringify(field)).includes(normalize(entry.needle));
};

let bundlePromise;
const bundleService = () => bundlePromise ||= build({
  entryPoints: ['src/services/enhancedOpenaiService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
  define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SUPABASE_URL: 'https://offline-benchmark.supabase.co' }) },
  plugins: [{ name: 'offline-provider-boundary', setup(builder) {
    builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'offline-supabase', namespace: 'benchmark' }));
    builder.onLoad({ filter: /.*/, namespace: 'benchmark' }, () => ({ contents: 'export const supabase = globalThis.benchmarkSupabase; export const supabaseUrl = "https://offline-benchmark.supabase.co";', loader: 'js' }));
  } }],
}).then((result) => result.outputFiles[0].text);

export async function generateOfflineReview(source, candidate) {
  const module = { exports: {} };
  const calls = [];
  vm.runInNewContext(await bundleService(), {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, structuredClone, URL,
    console: { log() {}, warn() {}, error() {} },
    benchmarkSupabase: { functions: { invoke: async (name) => {
      calls.push(name);
      return { data: { choices: [{ message: { content: JSON.stringify(candidate) } }] } };
    } } },
    fetch: () => { throw new Error('External requests are prohibited in the factual-tailoring benchmark'); },
  });
  return { review: await module.exports.generateEnhancedResume(structuredClone(source), jobDescription), calls };
}

export async function runFactualTailoringBenchmark(corpus = factualTailoringCorpus) {
  const results = [];
  for (const entry of corpus) {
    const source = structuredClone(factualProfiles[entry.profile]);
    const candidate = structuredClone(entry.candidate);
    const guarded = enforceAuthenticResumeSections(candidate, source, { title: 'Software Engineer' });
    const hardened = hardenGeneratedResumeForAts(guarded, { sourceProfile: source, jobDescription });
    const { review, calls } = await generateOfflineReview(source, candidate);
    if (!isResumeTailoringReview(review)) throw new Error('Generation did not return the required review envelope');
    const sourceOnly = keepOriginalResumeTailoring(review);
    // Diagnostic only: a suggested choice without the separate high-risk
    // accuracy confirmation is the default resolution path. A second
    // resolution with confirmation shows what a user can choose after
    // checking the claim.
    const suggestedDecisions = Object.fromEntries(review.suggestions.map(({ id }) => [id, { choice: 'suggested', reviewId: review.reviewId }]));
    const confirmedDecisions = Object.fromEntries(review.suggestions.map(({ id }) => [id, { choice: 'suggested', confirmRisk: true, reviewId: review.reviewId }]));
    const output = resolveResumeTailoringReview(review, suggestedDecisions);
    const confirmedOutput = resolveResumeTailoringReview(review, confirmedDecisions);
    const retained = includesProbe(output, entry);
    const retainedAfterRiskConfirmation = includesProbe(confirmedOutput, entry);
    results.push({
      id: entry.id, profile: entry.profile, category: entry.category, label: entry.label,
      evidence: entry.evidence, path: entry.path, probe: entry.needle,
      pureGuardRetained: includesProbe(guarded, entry), hardenedRetained: includesProbe(hardened, entry),
      candidateRetainedAfterExplicitAcceptance: retained,
      candidateRetainedAfterRiskConfirmation: retainedAfterRiskConfirmation,
      riskFlagged: review.suggestions.some((suggestion) => suggestion.risk?.confirmationRequired === true),
      passed: retained === (entry.label === 'supported'),
      candidateValueAfterExplicitAcceptance: probeValue(output, entry),
      candidateValueAfterRiskConfirmation: probeValue(confirmedOutput, entry),
      sourceOnlyRetained: includesProbe(sourceOnly, entry), sourceOnlyValue: probeValue(sourceOnly, entry),
      reviewKind: review.kind, reviewVersion: review.version, suggestionCount: review.suggestions.length,
      relevantSuggestions: review.suggestions.filter((suggestion) => normalize(suggestion.proposed).includes(normalize(entry.needle))),
      atsScore: output.atsQuality?.score,
      atsWarnings: output.atsQuality?.warnings, stubbedProviderCalls: calls.length,
    });
  }
  return {
    methodology: 'The original 30 hand-labeled synthetic probes are unchanged. Actual guards, bundled generation service and review resolver run with a stubbed provider and forbidden external fetch. Candidate semantic results first resolve every suggestion without the separate high-risk accuracy confirmation (the default fail-closed path), then record a diagnostic resolution with that confirmation. Source-only retention is reported separately. A review gate is not a factuality verifier, model benchmark or probability estimate.',
    totals: {
      cases: results.length,
      unsupported: results.filter((result) => result.label === 'unsupported').length,
      unsupportedRetained: results.filter((result) => result.label === 'unsupported' && result.candidateRetainedAfterExplicitAcceptance).length,
      unsupportedRetainedAfterRiskConfirmation: results.filter((result) => result.label === 'unsupported' && result.candidateRetainedAfterRiskConfirmation).length,
      supported: results.filter((result) => result.label === 'supported').length,
      supportedRejected: results.filter((result) => result.label === 'supported' && !result.candidateRetainedAfterExplicitAcceptance).length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
    },
    reviewBoundary: {
      envelopes: results.length,
      unsupportedRetainedInSourceOnly: results.filter((result) => result.label === 'unsupported' && result.sourceOnlyRetained).length,
      supportedAvailableAfterExplicitAcceptance: results.filter((result) => result.label === 'supported' && result.candidateRetainedAfterExplicitAcceptance).length,
    },
    results,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runFactualTailoringBenchmark();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--assert-safe') && report.totals.failed > 0) process.exitCode = 1;
}
