import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function sourceFunctions(file) {
  const source = readFileSync(new URL(`../browser-agent/${file}`, import.meta.url), 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const expressions = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.initializer) expressions.set(node.name.getText(parsed), node.initializer.getText(parsed));
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return (name, globals) => {
    assert.ok(expressions.has(name), `${file} exposes the actual ${name} implementation`);
    return vm.runInNewContext(`(${expressions.get(name)})`, globals);
  };
}

for (const surface of ['popup', 'sidepanel']) {
  const load = sourceFunctions(`${surface}.js`);
  test(`${surface} never presents another tab's cached job as the current role`, () => {
    const currentJob = load('getCurrentJobSnapshot', { URL });
    const snapshot = { title: 'Old role', url: 'https://jobs.example.com/jobs/1' };
    const state = { lastJobSnapshot: snapshot };
    assert.equal(currentJob(state, { url: snapshot.url }), snapshot);
    for (const url of ['https://jobs.example.com/jobs/10', 'https://jobs.example.com/jobs/1?role=other', 'https://www.resumeats.cv/auto-apply', 'about:blank', 'invalid']) {
      assert.equal(currentJob(state, { url }), null);
    }
    assert.equal(currentJob(state, null), null);
    assert.equal(currentJob({}, { url: snapshot.url }), null);
  });

  test(`${surface} opens explicit saved-version selection and never claims preparation or attachment`, async () => {
    const requests = [];
    const hints = [];
    const outcome = load('getPreparedResumeOutcomeMessage', {});
    const choose = load('prepareAiResumeForActiveTab', {
      sendMessage: async type => { requests.push(type); return { ok: true, status: 'review_required', handoffId: 'opaque', job: { title: 'Engineer' } }; },
      refreshState: async () => {}, getPreparedResumeOutcomeMessage: outcome,
      setHint: text => hints.push(text), setFooterCopy: text => hints.push(text),
    });
    await choose();
    assert.deepEqual(requests, ['PREPARE_ACTIVE_TAB_RESUME']);
    assert.match(hints.at(-1), /choose a saved version for Engineer/);
    assert.match(hints.at(-1), /Nothing is attached yet/);
    assert.throws(() => outcome({ preparedResume: { title: 'Legacy generated resume' } }), /No resume was attached/);
    assert.throws(() => outcome({ status: 'review_required' }), /did not open/);
  });

  test(`${surface} requires explicit sharing consent before the only Autofill dispatch`, async () => {
    const requests = [];
    const prompts = [];
    let accepted = false;
    const fill = load('requestAutofillForActiveTab', {
      resumeatsRequestConfirmation: options => { prompts.push(options); return accepted; },
      sendMessage: async type => { requests.push(type); return { ok: true }; },
    });
    await assert.rejects(fill(), /No data was shared/);
    assert.deepEqual(requests, []);
    accepted = true;
    await fill();
    assert.deepEqual(requests, ['AUTOFILL_ACTIVE_TAB']);
    assert.match(prompts.at(-1).message, /shares your profile and selected resume with this employer site/);
    assert.match(prompts.at(-1).message, /before you submit/);
    assert.equal(prompts.at(-1).title, 'Review data sharing before Autofill');
  });

  test(`${surface} selection status distinguishes selected version from attachment and expires stale metadata`, () => {
    const element = {};
    const render = load('renderResumeSelection', { document: { getElementById: () => element } });
    render({ resumeSelection: { status: 'ready', expiresAt: Date.now() + 60000, resume: { title: 'Non-default CV', revision: 7 }, job: { title: 'Engineer' } } });
    assert.match(element.textContent, /Non-default CV \(version 7\) for Engineer/);
    assert.match(element.textContent, /does not attach/);
    render({ resumeSelection: { status: 'ready', expiresAt: 1, resume: { title: 'Old', revision: 7 } } });
    assert.match(element.textContent, /No current saved resume selection/);
    render({ resumeSelection: { status: 'ready', expiresAt: Date.now() + 60000 } });
    assert.match(element.textContent, /No current saved resume selection/);
  });

  test(`${surface} attachment copy reflects the file-field acknowledgement, not just filled profile fields`, () => {
    const message = load('getAutofillOutcomeMessage', {});
    assert.match(message({ filledCount: 2, resumeAttached: true }), /PDF was attached to the file field/);
    assert.match(message({ filledCount: 2, attachmentNeedsManualAction: true }), /PDF was not attached/);
    assert.match(message({ filledCount: 0, attachmentNeedsManualAction: true }), /PDF was not attached/);
    assert.doesNotMatch(message({ filledCount: 2 }), /PDF was attached/);
  });

  test(`${surface} visible Autofill control names its persistent consent and resume-selection status`, () => {
    const html = readFileSync(new URL(`../browser-agent/${surface}.html`, import.meta.url), 'utf8');
    assert.match(html, /id="autofill" aria-describedby="autofill-consent resume-selection"/);
    assert.match(html, /id="resume-selection" role="status"/);
    assert.match(html, /id="autofill-consent"[^>]*>Autofill shares your profile and selected resume with the employer site/);
    assert.match(html, />Choose resume<\/button>/);
    assert.doesNotMatch(html, />AI Resume<\/button>/);
  });
}

test('extension autofill consent uses the shared accessible dialog on every surface', () => {
  const popup = readFileSync(new URL('../browser-agent/popup.js', import.meta.url), 'utf8');
  const sidepanel = readFileSync(new URL('../browser-agent/sidepanel.js', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../browser-agent/manifest.json', import.meta.url), 'utf8'));
  const contentScripts = manifest.content_scripts.find(entry => entry.js.includes('content-job-board.js'));

  for (const source of [popup, sidepanel, widget]) {
    assert.match(source, /resumeatsRequestConfirmation/);
    assert.doesNotMatch(source, /window\.confirm/);
  }
  assert.ok(contentScripts.js.indexOf('confirmation-dialog.js') < contentScripts.js.indexOf('content-job-board.js'));
  for (const htmlFile of ['popup.html', 'sidepanel.html']) {
    const html = readFileSync(new URL(`../browser-agent/${htmlFile}`, import.meta.url), 'utf8');
    assert.match(html, /confirmation-dialog\.js/);
  }
});

test('floating widget never fills cached profile fields before background selection validation, and keeps a single in-flight action', async () => {
  const load = sourceFunctions('content-job-board.js');
  const requests = [];
  const statuses = [];
  let resolve;
  let accepted = false;
  const context = {
    isAutofilling: false, autofillConsentPending: false, resumeatsRequestConfirmation: async () => accepted, ACTIVE_TAB_AUTOFILL_TIMEOUT_MS: 90000,
    startProgress() {}, settleProgress() {}, render() {},
    setStatus: text => statuses.push(text), getAutofillOutcomeMessage: result => result.error || 'Review the filled page',
    sendRuntimeMessageWithTimeout: async message => { requests.push(message.type); return new Promise(done => { resolve = done; }); },
    autofillApplication() { throw new Error('Widget must not bypass background validation'); },
  };
  const fill = load('autofillCurrentApplication', context);
  await fill();
  assert.deepEqual(requests, []);
  accepted = true;
  const pending = fill();
  await fill();
  assert.deepEqual(requests, ['AUTOFILL_ACTIVE_TAB']);
  resolve({ ok: false, error: 'Choose a saved resume for this exact job.' });
  await pending;
  assert.match(statuses.at(-1), /Choose a saved resume/);
  assert.equal(context.isAutofilling, false);
});
