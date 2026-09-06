import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const safetyContext = {};
vm.runInNewContext(readFileSync(new URL('../browser-agent/autofill-safety.js', import.meta.url), 'utf8'), safetyContext);
const safety = safetyContext.ResumeATSAutofillSafety;
const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
let autofillSource;
function findAutofill(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'autofillApplication') {
    autofillSource = node.initializer.getText(parsed);
  }
  ts.forEachChild(node, findAutofill);
}
findAutofill(parsed);
assert.ok(autofillSource, 'The real application submission function must exist');

// Execute the production function with fake DOM collaborators. No browser,
// network, employer form, or duplicate implementation of the submit gate.
async function runApplication({ summary = {}, rawSummary, fieldLabels = [], autoSubmit = true, subframe = false } = {}) {
  let clicks = 0;
  const fakeWindow = {};
  fakeWindow.top = subframe ? {} : fakeWindow;
  const context = {
    window: fakeWindow,
    provider: 'synthetic',
    revealApplicationFormStep: async () => ({}),
    looksLikeApplicationForm: () => true,
    autofillVisibleFields: async () => rawSummary === undefined
      ? ({ filledCount: 2, accessibleFieldCount: 2, reviewFieldCount: 0, needsReview: false, crossOriginFrameCount: 0, ...summary })
      : rawSummary,
    queryAllAcrossContexts: () => fieldLabels.map((label) => ({ label })),
    isVisible: () => true,
    getFieldLabel: (field) => field.label,
    getLabelText: (field) => field.label,
    getAutofillSafetyModule: () => safety,
    findConfirmation: () => clicks > 0,
    findSubmitButton: () => ({ click() { clicks += 1; } }),
    delay: async () => {},
  };
  vm.runInNewContext(`globalThis.run = ${autofillSource};`, context);
  const result = await context.run({ profile: {}, autoSubmit });
  return { result, clicks };
}

test('empty legal and consent answers fail the actual autofill safety evaluation', () => {
  for (const meta of ['Are you legally authorized to work in this country?', 'Do you consent to a background check?']) {
    assert.equal(safety.evaluate({ meta, value: 'Yes', profile: { answers: {} }, source: 'profile' }).shouldFill, false);
  }
});

test('signatures and attestations require personal review even with a saved name', () => {
  for (const meta of ['Electronic signature', 'I certify that my answers are accurate']) {
    assert.equal(safety.evaluate({ meta, value: 'Alex Example', profile: { answers: { fullName: 'Alex Example' } }, source: 'profile' }).shouldFill, false);
  }
});

test('the field resolver does not invent missing availability or education facts', () => {
  let resolver;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'resolveFieldValue') resolver = node.initializer.getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  const context = {
    getSavedAnswerForField: () => '', buildNormalizedCandidate: () => ({}),
    cleanText: value => `${value || ''}`.trim(), normalize: value => `${value || ''}`.toLowerCase(),
    buildCandidatePitch: () => '', resolvePhoneCountryCode: () => '',
    getFieldIdentity: () => '', getHiresomeFieldHint: () => '',
    isPhoneCountrySelector: () => false, isCustomChoiceControl: () => false,
    PHONE_FIELD_PATTERN: /phone/, window: { location: { href: 'https://jobs.example/1' } },
  };
  vm.runInNewContext(`globalThis.resolve = ${resolver}`, context);
  for (const question of ['Degree type', 'Grading system', 'No degrees', 'Notice period', 'Other languages', 'Accommodation request', 'Over 18']) {
    assert.equal(context.resolve(question, { answers: {} }), '', question);
  }
  assert.equal(context.resolve('Degree type', { education: [{ degree: 'PhD' }] }), 'PhD');
  assert.equal(context.resolve('Notice period', { answers: { noticePeriod: 'One month' } }), 'One month');
});

for (const [name, options] of [
  ['unresolved reviews', { summary: { needsReview: true } }],
  ['review counts', { summary: { reviewFieldCount: 1 } }],
  ['sensitive answers even when filled', { fieldLabels: ['Are you legally authorized to work in this country?'] }],
  ['cross-origin frames', { summary: { crossOriginFrameCount: 1 } }],
  ['embedded-frame submission', { subframe: true }],
  ['an empty inspection result', { rawSummary: {} }],
  ['a null inspection result', { rawSummary: null }],
  ['no inspected fields', { summary: { accessibleFieldCount: 0 } }],
  ['non-finite inspection counts', { summary: { accessibleFieldCount: NaN } }],
  ['missing review counts', { summary: { reviewFieldCount: undefined } }],
  ['non-finite review counts', { summary: { reviewFieldCount: NaN } }],
  ['missing frame counts', { summary: { crossOriginFrameCount: undefined } }],
  ['unknown review state', { summary: { needsReview: undefined } }],
]) {
  test(`real submit handler pauses for ${name}`, async () => {
    const { result, clicks } = await runApplication(options);
    assert.equal(clicks, 0);
    assert.equal(result.submitted, false);
    assert.equal(result.requiresManualSubmission, true);
    assert.match(result.error, /submit this application yourself/);
  });
}

test('ordinary completed forms retain explicitly requested submission behavior', async () => {
  const { result, clicks } = await runApplication({ fieldLabels: ['Full name', 'Email address'] });
  assert.equal(clicks, 1);
  assert.equal(result.submitted, true);
});

test('manual autofill never clicks submit', async () => {
  const { result, clicks } = await runApplication({ autoSubmit: false });
  assert.equal(clicks, 0);
  assert.equal(result.submitted, false);
});
