import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const { exports: { getAtsRules } } = loadEdgeFunction('src/services/atsRulesEngine.ts', {
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
