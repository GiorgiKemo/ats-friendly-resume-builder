import test from 'node:test';
import assert from 'node:assert/strict';
import { filterFaqItems } from '../src/utils/faqSearch.js';

const sampleFaqs = [
  { question: 'How do I cancel billing?', answer: 'Open subscription management.' },
  { question: 'Is the resume ATS friendly?', answer: 'Yes, the templates are ATS-safe.' },
  { question: 'How do exports work?', answer: 'Use PDF or DOCX export.' },
];

test('filterFaqItems returns all items for an empty query', () => {
  assert.equal(filterFaqItems(sampleFaqs, '').length, sampleFaqs.length);
});

test('filterFaqItems matches question text case-insensitively', () => {
  const results = filterFaqItems(sampleFaqs, 'BILLING');
  assert.deepEqual(results, [sampleFaqs[0]]);
});

test('filterFaqItems matches answer text as well as question text', () => {
  const results = filterFaqItems(sampleFaqs, 'docx');
  assert.deepEqual(results, [sampleFaqs[2]]);
});
