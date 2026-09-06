import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
const expressions = new Map();
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.initializer) expressions.set(node.name.getText(parsed), node.initializer.getText(parsed));
  ts.forEachChild(node, visit);
};
visit(parsed);
const targetUrl = 'https://employer.example/jobs/1?source=board#application';
const makeAttachment = (bytes = Buffer.from('%PDF-1.7\nsynthetic exact saved version')) => ({
  targetUrl, handoffId: 'handoff-1',
  artifact: {
    artifactId: 'selected-artifact', rendererVersion: 'test', mimeType: 'application/pdf', filename: 'Candidate_Resume.pdf',
    byteLength: bytes.length, base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'),
  },
});

function harness({ subframe = false, digest = (...args) => webcrypto.subtle.digest(...args), failFill = false, authorize } = {}) {
  const document = {};
  const input = { ownerDocument: document, type: 'file', name: 'resume', isConnected: true, files: [], getAttribute() { return null; } };
  const inputs = [input];
  const received = [];
  const authorizations = [];
  let events = 0;
  const context = {
    isTopFrame: !subframe, document, window: { location: { href: targetUrl }, setTimeout, clearTimeout },
    chrome: { runtime: { id: 'extension-1', async sendMessage(message) {
      authorizations.push(message);
      return authorize ? authorize(message) : { ok: true, ...message.payload };
    } } }, URL, File, Uint8Array, atob, btoa,
    crypto: { subtle: { digest } },
    queryAllAcrossContexts: () => inputs,
    dispatchFieldEvents() { events += 1; },
    DataTransfer: class {
      constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; }
    },
    async autofillApplication({ profile, autoSubmit }) {
      received.push({ profile, autoSubmit });
      if (failFill) throw new Error('Synthetic field failure');
      const attached = await context.uploadResumeFile(input, profile);
      return { ok: true, submitted: false, resumeAttached: attached, filledCount: attached ? 1 : 0 };
    },
  };
  for (const name of ['selectedResumeFiles', 'exactAttachmentTarget', 'validateResumeAttachment', 'isResumeUploadInput', 'findResumeInput', 'uploadResumeFile', 'shouldUploadResumeFile', 'handleResumeAutofillMessage']) {
    assert.ok(expressions.has(name));
    vm.runInNewContext(`globalThis.${name} = ${expressions.get(name)};`, context);
  }
  const profile = { candidate: { fullName: 'Synthetic Candidate' }, documents: { resumePdfUrl: 'https://must-not-fetch.example/old.pdf', resumeArtifact: { base64: 'must-not-broadcast' } } };
  return {
    context, document, input, inputs, received, profile, authorizations,
    get events() { return events; },
    run(payload = {}, sender = { id: 'extension-1' }) { return context.handleResumeAutofillMessage({ profile, ...payload }, sender); },
  };
}

test('authenticated selected attachment creates exact file bytes only in the intended document, with no submission or profile-byte propagation', async () => {
  const h = harness();
  const attachment = makeAttachment();
  const result = await h.run({ resumeAttachment: attachment, autoSubmit: true });
  assert.equal(result.resumeAttached, true);
  assert.equal(h.events, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.authorizations)), [{ type: 'AUTHORIZE_RESUME_ATTACHMENT', payload: { handoffId: 'handoff-1', artifactId: 'selected-artifact', targetUrl } }]);
  assert.equal(h.received[0].autoSubmit, false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.received[0].profile.documents)), {});
  assert.equal(h.input.files[0].name, attachment.artifact.filename);
  assert.equal(h.input.files[0].type, 'application/pdf');
  assert.equal(Buffer.from(await h.input.files[0].arrayBuffer()).toString('base64'), attachment.artifact.base64);
  assert.equal(h.context.selectedResumeFiles.has(h.received[0].profile), false, 'Private file handle is released after the operation');
  assert.equal(h.profile.documents.resumeArtifact.base64, 'must-not-broadcast', 'Caller profile is not mutated');
});

test('missing selection, forged runtime sender and artifact-bearing subframes stop before any profile fill', async () => {
  for (const [options, payload, sender] of [
    [{}, {}, undefined],
    [{}, { resumeAttachment: makeAttachment() }, { id: 'other-extension' }],
    [{ subframe: true }, { resumeAttachment: makeAttachment() }, undefined],
    [{}, { profileOnly: true, resumeAttachment: makeAttachment() }, undefined],
  ]) {
    const h = harness(options);
    await assert.rejects(h.run(payload, sender));
    assert.equal(h.received.length, 0);
    assert.equal(h.events, 0);
  }
});

test('explicit trusted profile-only dispatch never fetches or attaches cached document URLs and cannot submit', async () => {
  const h = harness({ subframe: true });
  const result = await h.run({ profileOnly: true, autoSubmit: true });
  assert.equal(result.resumeAttached, false);
  assert.equal(h.input.files.length, 0);
  assert.equal(h.events, 0);
  assert.equal(h.received[0].autoSubmit, false);
});

test('wrong identity, encoding, length, signature, digest and unsafe filename are rejected before fill', async () => {
  const mutations = [
    value => { value.targetUrl = 'https://employer.example/jobs/10?source=board#application'; },
    value => { value.targetUrl = 'https://employer.example/jobs/1?source=other#application'; },
    value => { value.targetUrl = 'https://employer.example/jobs/1?source=board#other'; },
    value => { value.artifact.mimeType = 'text/html'; },
    value => { value.artifact.byteLength += 1; },
    value => { value.artifact.byteLength = NaN; },
    value => { value.artifact.byteLength = 1048577; },
    value => { value.artifact.base64 += '===='; },
    value => { value.artifact.base64 = 'A'.repeat(1398108); },
    value => { value.artifact.base64 = value.artifact.base64.replace(/^./, '-'); },
    value => { value.artifact.sha256 = '0'.repeat(64); },
    value => { value.artifact.filename = '../candidate.pdf'; },
    value => { value.artifact.filename = 'candidate.pdf.exe'; },
    value => { value.artifact.filename = 'candidate\n.pdf'; },
  ];
  for (const mutate of mutations) {
    const h = harness();
    const attachment = makeAttachment();
    mutate(attachment);
    await assert.rejects(h.run({ resumeAttachment: attachment }));
    assert.equal(h.received.length, 0);
  }
  const h = harness();
  await assert.rejects(h.run({ resumeAttachment: makeAttachment(Buffer.from('<html>not a PDF</html>')) }));
  assert.equal(h.received.length, 0);
});

test('full one-MiB valid PDF boundary is supported without relaxing the size limit', async () => {
  const bytes = Buffer.alloc(1048576, 32);
  bytes.write('%PDF-1.7\n');
  const h = harness();
  assert.equal((await h.run({ resumeAttachment: makeAttachment(bytes) })).resumeAttached, true);
  assert.equal(h.input.files[0].size, 1048576);
});

test('navigation while SHA-256 is pending prevents file release and all field fill', async () => {
  let finish;
  const h = harness({ digest: (...args) => new Promise(resolve => { finish = async () => resolve(await webcrypto.subtle.digest(...args)); }) });
  const run = h.run({ resumeAttachment: makeAttachment() });
  h.context.window.location.href = 'https://employer.example/jobs/2';
  await finish();
  await assert.rejects(run, /changed/);
  assert.equal(h.received.length, 0);
});

test('changed or unrelated upload targets cannot receive the validated File', async () => {
  for (const mode of ['foreign-document', 'detached', 'navigation']) {
    const h = harness();
    const selected = await h.context.validateResumeAttachment(makeAttachment());
    h.context.selectedResumeFiles.set(h.profile, selected);
    if (mode === 'foreign-document') h.input.ownerDocument = {};
    if (mode === 'detached') h.input.isConnected = false;
    if (mode === 'navigation') h.context.window.location.href = 'https://employer.example/jobs/2';
    await assert.rejects(h.context.uploadResumeFile(h.input, h.profile), /target changed/);
    assert.equal(h.events, 0);
  }
});

test('only one unambiguous field-local resume input is selected; unrelated or ambiguous file inputs stay manual', () => {
  const h = harness();
  const field = (name, label = '', attributes = {}) => ({
    ownerDocument: h.document, type: 'file', isConnected: true, name,
    labels: label ? [{ textContent: label }] : [],
    getAttribute: key => attributes[key] || null,
    // This deliberately misleading form text must never influence selection.
    closest: () => ({ textContent: 'Cover letter Upload Resume' }),
    parentElement: { textContent: 'Resume required' },
  });
  for (const candidate of [field('headshot', 'Upload headshot'), field('cover-letter', 'Cover letter'),
    field('upload', 'Attach file'), field('resume', 'Resume or cover letter'),
    field('resume', 'Resume', { accept: 'image/*' }), field('resume', 'Passport'),
    field('photo', 'CV photo')]) {
    h.inputs.splice(0, h.inputs.length, candidate);
    assert.equal(h.context.findResumeInput(), null);
  }
  const resume = field('resumeUpload', 'Résumé', { accept: '.docx, application/pdf' });
  const cover = field('cover-letter', 'Cover letter');
  h.inputs.splice(0, h.inputs.length, cover, resume);
  assert.equal(h.context.findResumeInput(), resume);
  h.inputs.reverse();
  assert.equal(h.context.findResumeInput(), resume);
  h.inputs.push(field('cv_file', 'Curriculum vitae'));
  assert.equal(h.context.findResumeInput(), null, 'Two plausible resume inputs require manual selection');
  h.inputs.splice(0, h.inputs.length, field('', '', { 'aria-label': 'Upload CV' }));
  assert.equal(h.context.findResumeInput(), h.inputs[0]);
});

test('a resume field relabelled while fresh authorization is pending receives no file', async () => {
  let finish;
  const h = harness({ authorize: message => new Promise(resolve => { finish = () => resolve({ ok: true, ...message.payload }); }) });
  const selected = await h.context.validateResumeAttachment(makeAttachment());
  h.context.selectedResumeFiles.set(h.profile, selected);
  const run = h.context.uploadResumeFile(h.input, h.profile);
  h.input.name = 'headshot';
  finish();
  await assert.rejects(run, /changed/);
  assert.equal(h.input.files.length, 0);
  assert.equal(h.events, 0);
});

test('failed field processing also drops the ephemeral File handle', async () => {
  const h = harness({ failFill: true });
  await assert.rejects(h.run({ resumeAttachment: makeAttachment() }), /Synthetic field failure/);
  assert.equal(h.context.selectedResumeFiles.has(h.received[0].profile), false);
});

test('fresh attachment authorization rejects cancelled, signed-out or changed selections before assigning any file', async () => {
  for (const response of [
    { ok: false, error: 'Selection cancelled' },
    { ok: false, error: 'Signed out' },
    { ok: true, handoffId: 'other', artifactId: 'selected-artifact', targetUrl },
    { ok: true, handoffId: 'handoff-1', artifactId: 'other', targetUrl },
    { ok: true, handoffId: 'handoff-1', artifactId: 'selected-artifact', targetUrl: `${targetUrl}-other` },
  ]) {
    const h = harness({ authorize: async () => response });
    await assert.rejects(h.run({ resumeAttachment: makeAttachment() }), /selection, account or application changed/);
    assert.equal(h.input.files.length, 0);
    assert.equal(h.events, 0);
    assert.equal(h.context.selectedResumeFiles.has(h.received[0].profile), false);
  }
});

test('navigation during the final background authorization cannot release the file to the new page', async () => {
  let h;
  h = harness({ authorize: async ({ payload }) => {
    h.context.window.location.href = 'https://employer.example/jobs/2';
    return { ok: true, ...payload };
  } });
  await assert.rejects(h.run({ resumeAttachment: makeAttachment() }), /selection, account or application changed/);
  assert.equal(h.input.files.length, 0);
  assert.equal(h.events, 0);
});

test('unresponsive final authorization times out without leaving a File handle or attaching anything', async () => {
  const h = harness({ authorize: () => new Promise(() => {}) });
  h.context.window.setTimeout = callback => { queueMicrotask(callback); return 1; };
  h.context.window.clearTimeout = () => {};
  await assert.rejects(h.run({ resumeAttachment: makeAttachment() }), /authorization timed out/);
  assert.equal(h.input.files.length, 0);
  assert.equal(h.events, 0);
  assert.equal(h.context.selectedResumeFiles.has(h.received[0].profile), false);
});
