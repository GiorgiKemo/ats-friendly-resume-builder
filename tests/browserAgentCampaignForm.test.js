import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
let runner;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'runCampaignApplication') runner = node.initializer.getText(parsed);
  ts.forEachChild(node, visit);
};
visit(parsed);

const ordinary = label => ({ name: label, textContent: label, getAttribute: () => null, checkValidity: () => true, filled: true });
async function run({ mode = 'submit', invalid = false, sensitive = false, pause = false, ambiguous = false, multi = false, captcha = false } = {}) {
  let submissions = 0, step = 0;
  const actions = [];
  const field = ordinary('Email');
  if (invalid) field.checkValidity = () => false;
  const next = { ...ordinary('Continue'), getAttribute: name => name === 'type' ? 'button' : null, click() { step += 1; } };
  const context = {
    isTopFrame: true,
    window: { location: { href: 'https://jobs.example/1' } },
    chrome: { runtime: { sendMessage: async message => {
      actions.push(message.payload.action);
      return pause && message.payload.action === 'submit' ? { ok: false, error: 'Campaign paused' } : { ok: true };
    } } },
    queryAllAcrossContexts: selector => selector.startsWith('input[type="password"]') ? (captcha ? [{}] : [])
      : selector.startsWith('button') ? (multi && step === 0 ? [next] : []) : [],
    isVisible: () => true, looksLikeApplicationForm: () => true,
    getVisibleFormFields: () => [{ ...field, name: `${step}`, label: `${step}` }],
    autofillVisibleFields: async () => ({ accessibleFieldCount: 1, filledCount: 1, needsReview: false, crossOriginFrameCount: 0, reviewFieldCount: 0 }),
    getLabelText: item => item.label || item.name, isFieldAlreadyFilled: item => item.filled,
    getExactApplicationQuestion: item => item.label || item.name,
    cleanText: value => value.trim(), delay: async () => {},
    getAutofillSafetyModule: () => ({ isSensitiveField: () => sensitive, canAutomaticallySubmit: summary => summary.sensitiveFieldCount === 0 }),
    findSubmitButton: () => ({ tagName: 'BUTTON', click() { submissions += 1; } }),
    findConfirmation: () => submissions > 0 && !ambiguous,
  };
  vm.runInNewContext(`globalThis.run = ${runner}`, context);
  let result, error;
  try { result = await context.run({}, 'campaign-1', mode); } catch (caught) { error = caught; }
  return { result, error, submissions, step, actions };
}

test('campaign completes and verifies a multi-step form with fresh action authorization', async () => {
  const result = await run({ multi: true });
  assert.equal(result.step, 1);
  assert.equal(result.submissions, 1);
  assert.equal(result.result.submitted, true);
  assert.ok(result.actions.includes('continue'));
  assert.equal(result.actions.at(-1), 'submit');
});

for (const [label, config] of Object.entries({ 'prepare mode': { mode: 'prepare' }, 'invalid required field': { invalid: true }, 'sensitive answer': { sensitive: true }, captcha: { captcha: true } })) {
  test(`campaign hands off ${label} without submitting`, async () => {
    const result = await run(config);
    assert.equal(result.submissions, 0);
    assert.equal(result.result.needsReview, true);
  });
}

test('a pause immediately before submit prevents the click', async () => {
  const result = await run({ pause: true });
  assert.equal(result.submissions, 0);
  assert.match(result.error.message, /paused/);
});

test('an unconfirmed submission is attempted once and reported for review', async () => {
  const result = await run({ ambiguous: true });
  assert.equal(result.submissions, 1);
  assert.equal(result.result.submitted, false);
  assert.match(result.result.error, /automatic retry is disabled/);
});
