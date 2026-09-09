import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const { exports: { getAtsRules, checkResumeWithAts, calculateAtsScore } } = loadEdgeFunction('src/services/atsRulesEngine.ts', {
  imports: {
    '../types/atsTypes.js': {
      AtsSeverity: { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' },
      AtsRuleTier: { Basic: 'basic', Premium: 'premium' },
    },
  },
});

test('ATS headings check accepts the app own conventional template headings', () => {
  const headingsRule = getAtsRules('premium').find((rule) => rule.id === 'SC08');
  assert.equal(headingsRule.check({ sectionHeadings: [
    'Contact Information', 'Professional Summary', 'Professional Experience',
    'Core Competencies', 'Certifications & Licenses', 'Additional Projects', 'Languages',
  ] }), false);
});

test('ATS headings suggestions name only headings that actually failed the check', () => {
  const headingsRule = getAtsRules('premium').find((rule) => rule.id === 'SC08');
  const data = { sectionHeadings: ['Contact Information', 'Professional Summary', 'My Journey'] };
  assert.equal(headingsRule.check(data), true);
  const suggestion = headingsRule.getSuggestion(data);
  assert.ok(suggestion.includes('My Journey'));
  assert.ok(!suggestion.includes('Contact Information'));
  assert.ok(!suggestion.includes('Professional Summary'));
});

test('empty skills are reported while populated string and object skills pass', () => {
  const skillsRule = getAtsRules('basic').find((rule) => rule.id === 'SC06');
  assert.equal(skillsRule.check({ skills: { items: [] } }), true);
  assert.equal(skillsRule.check({ skills: { items: ['React'] } }), false);
  assert.equal(skillsRule.check({ skills: { items: [{ name: 'React' }] } }), false);
  assert.equal(skillsRule.check({}), true);
});

test('date consistency accepts equivalent separators and flags mixed calendar formats', () => {
  const datesRule = getAtsRules('premium').find((rule) => rule.id === 'SC09');
  assert.equal(datesRule.check({ allDates: ['05/2020', '11-2022'] }), false);
  assert.equal(datesRule.check({ allDates: ['2020-05', 'May 2022'] }), true);
  assert.equal(datesRule.check({ allDates: ['2020-05-01', '2022-11-30'] }), false);
});

test('modern in-platform resumes are not falsely marked as multi-column', () => {
  const layoutRule = getAtsRules('basic').find((rule) => rule.id === 'FL06');
  assert.equal(layoutRule.check({ parsedStructure: { isSingleColumnLayout: true } }), false);
  assert.equal(layoutRule.check({ parsedStructure: { isSingleColumnLayout: false, usesMultiColumnLayout: true } }), true);
});

test('creative-title rule ignores malformed non-string titles instead of throwing', () => {
  const titleRule = getAtsRules('premium').find((rule) => rule.id === 'SC10');
  assert.doesNotThrow(() => titleRule.check({ experience: [{ jobTitle: { value: 'ninja' } }] }));
  assert.equal(titleRule.check({ experience: [{ jobTitle: 'Coding Ninja' }] }), true);
});

test('acronym guidance ignores common terms and recognizes explicit expansions', () => {
  const acronymRule = getAtsRules('premium').find((rule) => rule.id === 'SC11');
  assert.equal(acronymRule.check({ rawText: 'Used API, SQL, and Customer Relationship Management (CRM).' }), false);
  assert.equal(acronymRule.check({ rawText: 'Owned ABCD and QWER platform migrations.' }), true);
});

test('ATS issue copy describes parsing risk without promising rejection outcomes', () => {
  const issues = checkResumeWithAts({ fileType: 'image' }, 'basic');
  const imageIssue = issues.find((issue) => issue.ruleId === 'FT01');
  assert.ok(imageIssue);
  assert.doesNotMatch(`${imageIssue.suggestion} ${imageIssue.impactExplanation}`, /automatically discarded|almost certainly|will be lost/i);
});

test('checklist score is deterministic and bounded at zero', () => {
  const issues = [
    { severity: 'critical' },
    { severity: 'high' },
    { severity: 'medium' },
    { severity: 'low' },
  ];
  assert.equal(calculateAtsScore(issues), 55);
  assert.equal(calculateAtsScore(Array.from({ length: 10 }, () => ({ severity: 'critical' }))), 0);
});
