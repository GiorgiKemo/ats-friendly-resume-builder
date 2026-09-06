import test from 'node:test';
import assert from 'node:assert/strict';

import { hardenGeneratedResumeForAts } from '../src/utils/generatedResumeQuality.js';

const hardenProse = (description, options = {}) => hardenGeneratedResumeForAts({
  workExperience: [{ title: 'Analyst', company: 'Example', description }],
}, options).workExperience[0].description;

test('formatting does not turn responsibilities or assignments into accomplishments or management', () => {
  for (const prose of [
    'Responsible for the reception desk, with no supervisory duties.',
    'Tasked with evaluating the migration; implementation was cancelled.',
    'Responsible for developing the prototype, but it was never started.',
    'Responsible for leading a future rollout if funding is approved.',
    'I was responsible for supporting the audit, not managing it.',
    'Helped achieve the team goal under supervision.',
  ]) {
    assert.equal(hardenProse(prose), `- ${prose}`);
  }
});

test('summary cleanup preserves candidate perspective and ownership qualifiers', () => {
  const summary = 'I am a junior analyst. I have supported my manager, who led the delivery.';
  const result = hardenGeneratedResumeForAts({ personalInfo: { summary } });
  assert.equal(result.personalInfo.summary, summary);
});

test('length preferences do not cut a summary sentence before its qualifying ending', () => {
  const summary = `I supported a proposed migration involving ${'a documented internal evaluation of existing workflows, '.repeat(13)}but I did not implement or lead the migration.`;
  for (const length of ['concise', 'standard', 'comprehensive']) {
    const result = hardenGeneratedResumeForAts({ personalInfo: { summary } }, { length });
    assert.equal(result.personalInfo.summary, summary);
    if (length !== 'comprehensive') {
      assert.equal(result.atsQuality.checks.find((check) => check.id === 'summary').passed, false);
      assert.ok(result.atsQuality.warnings.some((warning) => warning.includes('summary')));
    }
  }
});

test('length preferences do not discard a separate sentence qualifying preceding claims', () => {
  const sentences = ['Designed a test migration.', 'Built a local prototype.', 'Tested recovery.', 'Documented findings.', 'Presented the experiment.', 'The entire project was a classroom simulation, not production work.'];
  const result = hardenProse(sentences.join(' '), { length: 'concise' });
  assert.deepEqual(result.split('\n'), sentences.map((sentence) => `- ${sentence}`));
});

test('project and additional-section bullet limits do not discard trailing caveats', () => {
  const lines = ['Built a prototype.', 'Prepared test data.', 'Presented the outcome.', 'Only a supervised classroom exercise.'];
  const result = hardenGeneratedResumeForAts({
    projects: [{ title: 'Class exercise', description: lines.join('\n') }],
  }, {
    length: 'concise',
    sourceProfile: { additionalSections: [{ title: 'Training', content: [...lines, 'Not a professional credential.', 'Not a licensed qualification.'].join('\n') }] },
  });
  assert.equal(result.projects[0].description, lines.map((line) => `- ${line}`).join('\n'));
  assert.ok(result.additionalSections[0].content.endsWith('- Not a licensed qualification.'));
});

test('text cleanup preserves inequality, approximation and technical operators', () => {
  for (const prose of [
    'Observed latency < 10 ms and > 2 ms in the test environment.',
    'Approximately ~20 requests per second; no production benchmark.',
    'Configured FEATURE_FLAG and parsed A|B alternatives.',
    'Compared x > 10 with y < 20; did not set a service guarantee.',
  ]) {
    assert.equal(hardenProse(prose), `- ${prose}`);
  }
});

test('decoded entity inequalities retain both sides of the comparison', () => {
  assert.equal(hardenProse('Observed &lt; 10 ms and &gt; 2 ms.'), '- Observed < 10 ms and > 2 ms.');
});

test('technical null and NaN terms or unspecified scope do not remove the containing prose', () => {
  assert.equal(hardenProse('Handled null and NaN inputs.\nProduction behavior was not specified.'), '- Handled null and NaN inputs.\n- Production behavior was not specified.');
});

test('formatting does not promote struck-out wording to an unqualified factual claim', () => {
  assert.equal(hardenProse('~~Led the rollout~~ Assisted the rollout.'), '- ~~Led the rollout~~ Assisted the rollout.');
  assert.ok(hardenProse('<del>Led the rollout</del> Assisted the rollout.').includes('<del>Led the rollout</del>'));
  const result = hardenGeneratedResumeForAts({ personalInfo: { summary: '<del>Led</del> Assisted the rollout.' } });
  assert.ok(result.atsQuality.warnings.some((warning) => warning.includes('Parser-hostile')));
});

test('safe HTML, emphasis, list and whitespace formatting remain useful', () => {
  const result = hardenProse('<ul><li><strong>Built</strong> the `Node.js` prototype.</li><li>**Assisted** with the __local__ test.</li></ul>');
  assert.equal(result, '- Built the Node.js prototype.\n- Assisted with the local test.');
});

test('duplicate cleanup removes only identical prose, preserving mathematical distinctions', () => {
  assert.equal(hardenProse('Observed > 10 ms.\nObserved < 10 ms.\nObserved > 10 ms.'), '- Observed > 10 ms.\n- Observed < 10 ms.');
});

test('hardening remains idempotent without inventing skills or modifying the input', () => {
  const input = {
    personalInfo: { summary: 'I have supported my manager; I did not supervise the team.' },
    skills: ['C++', 'SQL', 'C++'],
    workExperience: [{ title: 'Analyst', company: 'Example', description: 'Tasked with testing.\nOnly in a sandbox.' }],
  };
  const snapshot = structuredClone(input);
  const options = { jobDescription: 'SQL and Python', length: 'concise' };
  const result = hardenGeneratedResumeForAts(input, options);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(result.skills, ['SQL', 'C++']);
  assert.deepEqual(hardenGeneratedResumeForAts(result, options), result);
});
