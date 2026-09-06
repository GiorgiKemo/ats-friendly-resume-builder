import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';

const request = { handoffId: 'handoff-1', jobKey: 'https://jobs.example/jobs/1', resumeId: 'resume-1', expectedRevision: 3, expectedUserId: 'owner-a' };
const saved = () => ({
  id: 'resume-1', user_id: 'owner-a', revision: 3, title: 'Product Designer',
  personal_info: { full_name: 'José Müller გიორგი', summary: 'Built accessible workflows.', phone: '' },
  work_experience: [{ position: 'Designer', company: 'Cedar Studio', description: 'Improved the design system.' }],
  education: [], skills: [], certifications: [{ name: 'Course', issueDate: '2024-01' }],
  projects: [], additional_sections: [], updated_at: '2026-09-04T00:00:00Z',
});

function setup({ read, render, auth } = {}) {
  let current = saved();
  let owner = 'owner-a';
  let authCalls = 0;
  let reads = 0;
  let renders = 0;
  const listeners = new Set();
  const rendered = [];
  const unwanted = [];
  const forbidden = (name) => () => { unwanted.push(name); throw new Error(`Unexpected ${name}`); };
  const supabase = {
    auth: {
      async getUser() {
        authCalls += 1;
        return auth ? auth({ call: authCalls, owner }) : { data: { user: owner ? { id: owner } : null }, error: null };
      },
      onAuthStateChange(handler) { listeners.add(handler); return { data: { subscription: { unsubscribe() { listeners.delete(handler); } } } }; },
    },
    storage: { from: forbidden('Storage') }, from: forbidden('table query'), functions: { invoke: forbidden('provider') },
  };
  const module = loadEdgeFunction('src/services/browserAgentResumeArtifact.js', {
    imports: {
      './supabase': { supabase },
      './supabaseService.js': { getResumeById: async (id) => {
        reads += 1;
        assert.equal(id, request.resumeId);
        return read ? read({ call: reads, current }) : current;
      }, saveResume: forbidden('resume save') },
      './resumePdfDocument.js': { buildTextPdf: async (resume) => {
        renders += 1;
        rendered.push(resume);
        return render ? render(resume) : { blob: new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }) };
      } },
    }, globals: { Blob },
  }).exports;
  return {
    ...module, rendered, unwanted,
    setSaved(value) { current = value; },
    setOwner(value, event = value ? 'SIGNED_IN' : 'SIGNED_OUT') {
      owner = value;
      for (const listener of listeners) listener(event, value ? { user: { id: value } } : null);
    },
    get counts() { return { reads, renders, authCalls, subscriptions: listeners.size }; },
  };
}

test('saved preview normalizes only the selected snapshot and preserves its owner and revision', async () => {
  const app = setup();
  const result = await app.loadBrowserAgentSavedResume({ resumeId: request.resumeId, expectedUserId: request.expectedUserId });
  assert.equal(result.personalInfo.fullName, 'José Müller გიორგი');
  assert.equal(result.personalInfo.phone, '');
  assert.equal(result.workExperience[0].jobTitle, 'Designer');
  assert.equal(result.certifications[0].date, '2024-01');
  assert.equal(result.user_id, request.expectedUserId);
  assert.equal(result.revision, 3);
  assert.equal(app.counts.renders, 0);
  assert.equal(app.counts.subscriptions, 0);
});

test('exact artifact has bounded JSON/base64 and digest for precisely rendered bytes without writes', async () => {
  const app = setup();
  const result = await app.prepareBrowserAgentSavedResumeArtifact(request);
  assert.equal(result.status, 'ready');
  assert.equal(result.ownerId, request.expectedUserId);
  assert.equal(result.resume.revision, 3);
  assert.equal(result.jobKey, request.jobKey);
  assert.equal(result.document.mimeType, 'application/pdf');
  assert.equal(result.document.rendererVersion, 'resumeats-text-pdf-v1');
  assert.match(result.document.filename, /^[a-zA-Z0-9_-]+\.pdf$/);
  const decoded = Buffer.from(result.document.base64, 'base64');
  assert.equal(decoded.toString(), '%PDF-1.7\nsynthetic');
  assert.equal(result.document.byteLength, decoded.length);
  assert.equal(result.document.sha256, createHash('sha256').update(decoded).digest('hex'));
  assert.equal(result.document.artifactId, `sha256:${result.document.sha256}`);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= app.MAX_RESUME_ARTIFACT_RESPONSE_BYTES);
  assert.equal(result.document.signedUrl, undefined);
  assert.equal(result.document.path, undefined);
  assert.equal(app.rendered[0].personalInfo.phone, '');
  assert.equal(app.rendered[0].skills.length, 0);
  assert.equal(app.counts.reads, 2, 'Re-read the exact version after rendering');
  assert.equal(app.counts.subscriptions, 0);
  assert.deepEqual(app.unwanted, []);
});

test('later validation returns only current saved identity without rendering or artifact bytes', async () => {
  const app = setup();
  const result = await app.validateBrowserAgentSavedResume(request);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ownerId: 'owner-a', resumeId: 'resume-1', revision: 3 });
  assert.equal(app.counts.renders, 0);
  app.setSaved({ ...saved(), revision: 4 });
  await assert.rejects(app.validateBrowserAgentSavedResume(request), { code: 'RESUME_CONFLICT' });
  await assert.rejects(app.validateBrowserAgentSavedResume({ ...request, expectedRevision: undefined }), { code: 'RESUME_VERSION_REQUIRED' });
  assert.equal(app.counts.renders, 0);
  assert.deepEqual(app.unwanted, []);
});

test('untitled saved versions receive usable artifact display metadata without changing saved content', async () => {
  for (const title of ['', '   ', undefined]) {
    const app = setup();
    const source = { ...saved(), title };
    app.setSaved(source);
    const result = await app.prepareBrowserAgentSavedResumeArtifact(request);
    assert.equal(result.resume.title, 'Resume');
    assert.equal(result.document.filename, 'Resume_v3.pdf');
    assert.equal(source.title, title);
    assert.equal(app.rendered[0].title, title);
  }
});

test('real Unicode PDF renderer preserves selected facts through base64 without profile fallback', async () => {
  const fontData = await readFile(new URL('../src/assets/fonts/DejaVuSans.ttf', import.meta.url), 'base64');
  const app = setup({ render: (resume) => buildTextPdf(resume, fontData) });
  const result = await app.prepareBrowserAgentSavedResumeArtifact(request);
  const bytes = Buffer.from(result.document.base64, 'base64');
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 1000 && bytes.length < app.MAX_RESUME_ARTIFACT_BYTES);
  const text = buildResumeTextLines(app.rendered[0]).join('\n');
  for (const fact of ['José Müller გიორგი', 'Designer at Cedar Studio', 'Improved the design system.', '2024-01']) assert.ok(text.includes(fact), fact);
  assert.deepEqual(app.unwanted, []);
});

for (const invalid of [0, -1, 1.5, '3', null, undefined, 2147483648]) {
  test(`artifact rejects invalid expected revision ${String(invalid)} before any auth/read`, async () => {
    const app = setup();
    await assert.rejects(app.prepareBrowserAgentSavedResumeArtifact({ ...request, expectedRevision: invalid }), { code: 'RESUME_VERSION_REQUIRED' });
    assert.equal(app.counts.authCalls, 0);
    assert.equal(app.counts.reads, 0);
  });
}

test('artifact rejects wrong owner and stale revision before rendering, without default fallback', async () => {
  for (const value of [{ ...saved(), user_id: 'owner-b' }, { ...saved(), revision: 4 }, null]) {
    const app = setup();
    app.setSaved(value);
    await assert.rejects(app.prepareBrowserAgentSavedResumeArtifact(request));
    assert.equal(app.counts.renders, 0);
    assert.equal(app.counts.reads, 1);
    assert.equal(app.counts.subscriptions, 0);
  }
});

test('revision change or deletion during rendering prevents artifact disclosure', async () => {
  for (const replacement of [{ ...saved(), revision: 4 }, null]) {
    const app = setup({ read: ({ call }) => call === 1 ? saved() : replacement });
    await assert.rejects(app.prepareBrowserAgentSavedResumeArtifact(request));
    assert.equal(app.counts.renders, 1);
    assert.equal(app.counts.subscriptions, 0);
  }
});

test('logout and account switch during rendering reject even after the original account returns', async () => {
  for (const nextOwner of [null, 'owner-b']) {
    let app;
    app = setup({ render: async () => {
      app.setOwner(nextOwner);
      app.setOwner('owner-a');
      return { blob: new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }) };
    } });
    await assert.rejects(app.prepareBrowserAgentSavedResumeArtifact(request), { code: 'RESUME_ACCOUNT_CHANGED' });
    assert.equal(app.counts.reads, 1);
    assert.equal(app.counts.subscriptions, 0);
  }
});

test('account switch during a slow load and authentication errors fail closed', async () => {
  let app;
  app = setup({ read: async () => { app.setOwner('owner-b'); return saved(); } });
  await assert.rejects(app.loadBrowserAgentSavedResume(request), { code: 'RESUME_ACCOUNT_CHANGED' });
  const failedAuth = setup({ auth: () => ({ data: { user: { id: 'owner-a' } }, error: new Error('Unavailable') }) });
  await assert.rejects(failedAuth.prepareBrowserAgentSavedResumeArtifact(request), { code: 'RESUME_ACCOUNT_CHANGED' });
  assert.equal(failedAuth.counts.reads, 0);
});

test('same-account token refresh does not discard a valid selection', async () => {
  let app;
  app = setup({ render: async () => {
    app.setOwner('owner-a', 'TOKEN_REFRESHED');
    return { blob: new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }) };
  } });
  assert.equal((await app.prepareBrowserAgentSavedResumeArtifact(request)).status, 'ready');
});

test('oversized or malformed renderer output never becomes a ready artifact', async () => {
  const cases = [
    new Blob(['%PDF-', new Uint8Array(1024 * 1024)], { type: 'application/pdf' }),
    new Blob(['not a PDF'], { type: 'application/pdf' }),
    new Blob(['%PDF-1.7'], { type: 'text/plain' }),
    { type: 'application/pdf', size: 20, arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer },
  ];
  for (const blob of cases) {
    const app = setup({ render: async () => ({ blob }) });
    await assert.rejects(app.prepareBrowserAgentSavedResumeArtifact(request), /manually/);
    assert.equal(app.counts.subscriptions, 0);
    assert.deepEqual(app.unwanted, []);
  }
});

test('a PDF exactly at the raw cap fits base64 and complete JSON budgets without changing bytes', async () => {
  const blob = new Blob(['%PDF-', new Uint8Array(1024 * 1024 - 5)], { type: 'application/pdf' });
  const app = setup({ render: async () => ({ blob }) });
  const result = await app.prepareBrowserAgentSavedResumeArtifact({ ...request, jobKey: 'https://jobs.example/1?jobId=17#application' });
  assert.equal(result.document.byteLength, app.MAX_RESUME_ARTIFACT_BYTES);
  assert.equal(result.document.base64.length, app.MAX_RESUME_ARTIFACT_BASE64_LENGTH);
  assert.equal(Buffer.from(result.document.base64, 'base64').length, blob.size);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < app.MAX_RESUME_ARTIFACT_RESPONSE_BYTES);
  assert.equal(result.jobKey, 'https://jobs.example/1?jobId=17#application');
});

test('pending review payload and malformed handoff metadata are rejected before rendering', async () => {
  const app = setup();
  app.setSaved({ ...saved(), kind: 'resume-tailoring-review', version: 1 });
  await assert.rejects(app.prepareBrowserAgentSavedResumeArtifact(request));
  assert.equal(app.counts.renders, 0);
  for (const partial of [{ handoffId: '' }, { jobKey: '' }, { jobKey: 'job\n1' }, { jobKey: 'x'.repeat(8193) }, { jobKey: 'javascript:alert(1)' }, { jobKey: 'https://user:pass@jobs.example/1' }, { expectedUserId: '' }]) {
    const malformed = setup();
    await assert.rejects(malformed.prepareBrowserAgentSavedResumeArtifact({ ...request, ...partial }));
    assert.equal(malformed.counts.authCalls, 0);
  }
});
