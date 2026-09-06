import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
const functions = new Map();
const selected = new Set(['findPrimaryAction', 'findApplyEntryButton', 'inspectApplyEntry', 'revealApplicationFormStep', 'navigateToApplyTarget', 'autofillApplication']);
function collect(node) {
  if (ts.isVariableDeclaration(node) && selected.has(node.name.getText(parsed))) {
    functions.set(node.name.getText(parsed), node.initializer.getText(parsed));
  }
  ts.forEachChild(node, collect);
}
collect(parsed);

function setup({ tag = 'BUTTON', attributes = {}, inForm = false, associatedForm = false, label = 'Apply', disclosurePanel = false } = {}) {
  let clicks = 0;
  let submissionClicks = 0;
  let visibleFields = 0;
  const form = {};
  const fakeWindow = { location: { href: 'https://jobs.example.com/apply' } };
  fakeWindow.top = fakeWindow;
  const panel = disclosurePanel ? {} : null;
  const document = { getElementById: () => panel, querySelector: () => panel };
  const entry = {
    tagName: tag, nodeName: tag, type: attributes.type || (tag === 'BUTTON' ? 'submit' : ''),
    form: inForm || associatedForm ? form : null, dataset: {}, ownerDocument: document,
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(attributes, name),
    closest: (selector) => selector === 'form' && inForm ? form : null,
    matches: (selector) => selector.includes('form') && Boolean(inForm || associatedForm),
    click: () => { clicks += 1; visibleFields = 3; },
  };
  const context = {
    window: fakeWindow, document, URL, provider: 'synthetic',
    getElementText: () => label.toLowerCase(), isEnabled: () => true, isVisible: () => true,
    queryAllAcrossContexts: (selector) => selector.includes('button') ? [entry] : [],
    getVisibleInformativeApplicationFieldCount: () => visibleFields,
    delay: async () => {},
    looksLikeApplicationForm: () => true,
    autofillVisibleFields: async () => ({ filledCount: 1 }),
    getLabelText: () => '', getAutofillSafetyModule: () => ({ isSensitiveField: () => false, canAutomaticallySubmit: () => true }),
    findConfirmation: () => false,
    findSubmitButton: () => ({ click: () => { submissionClicks += 1; } }),
  };
  for (const name of selected) assert.ok(functions.has(name), `Missing actual function ${name}`);
  vm.runInNewContext([...selected].map((name) => `const ${name} = ${functions.get(name)};`).join('\n')
    + '\nglobalThis.api = { revealApplicationFormStep, navigateToApplyTarget, autofillApplication };', context);
  return { api: context.api, get clicks() { return clicks; }, get submissionClicks() { return submissionClicks; }, fakeWindow };
}

for (const [name, options] of [
  ['input submit', { tag: 'INPUT', attributes: { type: 'submit' } }],
  ['default form button', { inForm: true }],
  ['default outside-form button', {}],
  ['externally associated submit', { attributes: { type: 'submit', form: 'application' }, associatedForm: true }],
  ['in-form type button', { inForm: true, attributes: { type: 'button' } }],
  ['javascript anchor', { tag: 'A', attributes: { href: 'javascript:submitApplication()' } }],
  ['data anchor', { tag: 'A', attributes: { href: 'data:text/html,submit' } }],
]) {
  test(`entry navigation does not activate ambiguous ${name}`, async () => {
    const app = setup(options);
    assert.equal((await app.api.revealApplicationFormStep()).needsReview, true);
    assert.equal((await app.api.navigateToApplyTarget()).needsReview, true);
    assert.equal(app.clicks, 0);
    assert.equal(app.fakeWindow.location.href, 'https://jobs.example.com/apply');
  });
}

test('safe outside-form application anchor still navigates', async () => {
  const app = setup({ tag: 'A', attributes: { href: '/start' } });
  const result = await app.api.revealApplicationFormStep();
  assert.equal(result.pendingNavigation, true);
  assert.equal(app.fakeWindow.location.href, 'https://jobs.example.com/start');
  assert.equal(app.clicks, 0);
});

test('explicit outside-form disclosure can reveal an application panel', async () => {
  const app = setup({ attributes: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'application-panel' }, disclosurePanel: true });
  const result = await app.api.revealApplicationFormStep();
  assert.equal(result.revealed, true);
  assert.equal(app.clicks, 1);
});

test('manual autofill uses the real reveal helper and never clicks a sparse final Apply form', async () => {
  const app = setup({ inForm: true });
  const result = await app.api.autofillApplication({ profile: {}, autoSubmit: false });
  assert.equal(result.needsReview, true);
  assert.equal(result.submitted, false);
  assert.equal(app.clicks, 0);
  assert.equal(app.submissionClicks, 0);
});
