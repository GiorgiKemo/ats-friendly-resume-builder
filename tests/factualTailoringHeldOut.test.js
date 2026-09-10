import test from 'node:test';
import assert from 'node:assert/strict';
import { runFactualTailoringBenchmark } from './benchmarks/factual-tailoring.mjs';

const heldOutProbes = [
  {
    id: 'heldout-negation-oversight', profile: 'careerchange', category: 'negation', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Library Assistant', company: 'Elm Library', description: 'Managed staff and approved budgets.' }] },
    path: 'workExperience.0.description', needle: 'Managed staff and approved budgets.',
    evidence: 'Source explicitly says the candidate did not supervise staff or approve budgets.',
  },
  {
    id: 'heldout-affiliation-membership', profile: 'careerchange', category: 'affiliation', label: 'unsupported',
    candidate: { personalInfo: { summary: 'IEEE member and Stanford alumna.' } },
    path: 'personalInfo.summary', needle: 'IEEE member',
    evidence: 'No IEEE membership or Stanford education is supplied.',
  },
  {
    id: 'heldout-proficiency-fluent', profile: 'multilingual', category: 'language-proficiency', label: 'unsupported',
    candidate: { personalInfo: { summary: 'Fluent in Japanese and English.' } },
    path: 'personalInfo.summary', needle: 'Fluent in Japanese',
    evidence: 'Japanese is documented as Intermediate.',
  },
  {
    id: 'heldout-licensure', profile: 'technical', category: 'licensure', label: 'unsupported',
    candidate: { certifications: [{ name: 'Networking Course', issuer: 'Community School', description: 'Licensed network security professional.' }] },
    path: 'certifications.0.description', needle: 'Licensed network security',
    evidence: 'A course completion does not establish licensure.',
  },
  {
    id: 'heldout-ownership', profile: 'senior', category: 'ownership', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', description: 'Owned the company-wide customer support strategy.' }] },
    path: 'workExperience.0.description', needle: 'Owned the company-wide customer support strategy.',
    evidence: 'Source documents support work and metrics, not company-wide ownership.',
  },
  {
    id: 'heldout-oversight-synonym', profile: 'senior', category: 'oversight', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', description: 'Oversaw the company-wide customer support strategy.' }] },
    path: 'workExperience.0.description', needle: 'Oversaw the company-wide customer support strategy.',
    evidence: 'Source documents support work and metrics, not company-wide oversight.',
  },
  {
    id: 'heldout-spearheaded-transformation', profile: 'senior', category: 'leadership', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', description: 'Spearheaded a company-wide support transformation.' }] },
    path: 'workExperience.0.description', needle: 'Spearheaded a company-wide support transformation.',
    evidence: 'Source documents support work and metrics, not leading a company-wide transformation.',
  },
  {
    id: 'heldout-orchestrated-rollout', profile: 'technical', category: 'orchestration', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Systems Developer', company: 'Pine Systems', description: 'Orchestrated the C++ service rollout across customer accounts.' }] },
    path: 'workExperience.0.description', needle: 'Orchestrated the C++ service rollout across customer accounts.',
    evidence: 'Source documents maintenance and diagnostics, not orchestration of a rollout.',
  },
  {
    id: 'heldout-mentored-engineers', profile: 'junior', category: 'mentorship', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Web Intern', company: 'Cedar Studio', description: 'Mentored junior engineers on accessible web development.' }] },
    path: 'workExperience.0.description', needle: 'Mentored junior engineers',
    evidence: 'Source documents an internship and implementation work, not mentoring engineers.',
  },
  {
    id: 'heldout-managed-support-team', profile: 'senior', category: 'management-scope', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', description: 'Managed a support team.' }] },
    path: 'workExperience.0.description', needle: 'Managed a support team',
    evidence: 'Source documents managing customer tickets, not managing people.',
  },
  {
    id: 'heldout-led-support-team', profile: 'senior', category: 'management-scope', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', description: 'Led a support team.' }] },
    path: 'workExperience.0.description', needle: 'Led a support team',
    evidence: 'Source documents support work, not team leadership.',
  },
  {
    id: 'heldout-companywide-scope', profile: 'senior', category: 'scale-scope', label: 'unsupported',
    candidate: { workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', description: 'Improved company-wide support workflows.' }] },
    path: 'workExperience.0.description', needle: 'company-wide support',
    evidence: 'Source documents local support workflows, not company-wide scope.',
  },
  {
    id: 'heldout-retention-outcome', profile: 'senior', category: 'business-impact', label: 'unsupported',
    candidate: { personalInfo: { summary: 'Improved customer retention.' } },
    path: 'personalInfo.summary', needle: 'customer retention',
    evidence: 'Source documents support workflows and ticket reduction, not customer retention.',
  },
  {
    id: 'heldout-conversion-outcome', profile: 'senior', category: 'business-impact', label: 'unsupported',
    candidate: { personalInfo: { summary: 'Boosted conversion rates.' } },
    path: 'personalInfo.summary', needle: 'conversion rates',
    evidence: 'Source documents support workflows and ticket reduction, not conversion rates.',
  },
  {
    id: 'heldout-cost-outcome', profile: 'senior', category: 'business-impact', label: 'unsupported',
    candidate: { personalInfo: { summary: 'Reduced operating costs.' } },
    path: 'personalInfo.summary', needle: 'operating costs',
    evidence: 'Source documents support workflows and ticket reduction, not operating-cost savings.',
  },
  {
    id: 'heldout-satisfaction-outcome', profile: 'senior', category: 'business-impact', label: 'unsupported',
    candidate: { personalInfo: { summary: 'Delivered higher customer satisfaction.' } },
    path: 'personalInfo.summary', needle: 'customer satisfaction',
    evidence: 'Source documents support workflows and ticket reduction, not customer-satisfaction results.',
  },
];

test('independent semantic probes stay fail-closed for high-consequence wording', async () => {
  const report = await runFactualTailoringBenchmark(heldOutProbes);
  assert.equal(report.totals.cases, heldOutProbes.length);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.unsupportedRetained, 0);
  assert.equal(report.totals.unsupportedRetainedAfterRiskConfirmation, heldOutProbes.length);
  for (const result of report.results) {
    assert.equal(result.riskFlagged, true, result.id);
    assert.equal(result.sourceOnlyRetained, false, result.id);
  }
});
