import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const publicKeyImport = 'https://esm.sh/@supabase/supabase-js@2';
const resumeId = 'resume-a';
const userId = 'user-a';

const snapshot = (overrides = {}) => ({
  id: resumeId,
  user_id: userId,
  title: 'Saved resume',
  description: '',
  selected_template: 'ats-friendly',
  selected_font: 'DejaVu Sans',
  is_public: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-09-04T00:00:00.000Z',
  last_accessed_at: null,
  personal_info: { fullName: 'José Müller გიორგი', jobTitle: 'Research Engineer', email: 'jose@example.test' },
  work_experience: [{ title: 'Engineer', company: 'Example', description: 'Measured -20% change.' }],
  education: [],
  skills: [{ name: 'C++' }],
  certifications: [],
  projects: [],
  additional_sections: [],
  revision: 7,
  ...overrides,
});

function loadAttachment({ rpcData = [snapshot()], rpcError = null, renderer } = {}) {
  const calls = [];
  const clients = [];
  const client = {
    rpc: async (...args) => { calls.push(args); return { data: rpcData, error: rpcError }; },
  };
  const loaded = loadEdgeFunction('supabase/functions/auto-apply-run/resumeAttachment.ts', {
    env: { SB_PUBLISHABLE_KEY: 'public-key' },
    imports: {
      [publicKeyImport]: { createClient: (...args) => { clients.push(args); return client; } },
      '../_shared/resume/pdfCore.js': { buildTextPdfCore: renderer || (async () => ({ blob: new Blob(['%PDF-1.7']) })) },
    },
    expose: ['loadOwnedResumeSnapshot', 'createResumeAttachmentPackage', 'assertResumePackageCurrent', 'loadResumeFontData', 'getPublicKey', 'validateSnapshot'],
    globals: { Blob },
  });
  return { ...loaded.exports, calls, clients };
}

test('owned snapshot reader sends the verified bearer through RLS and calls only get_resume_versioned', async () => {
  const app = loadAttachment();
  const loaded = await app.loadOwnedResumeSnapshot({
    createClient: (...args) => { app.clients.push(args); return { rpc: async (...rpcArgs) => { app.calls.push(rpcArgs); return { data: [snapshot()], error: null }; } }; },
    supabaseUrl: 'https://project.supabase.co',
    publicKey: 'public-key',
    authorization: 'Bearer verified-token',
    resumeId,
    userId,
  });
  assert.equal(loaded.id, resumeId);
  assert.equal(loaded.revision, 7);
  assert.equal(JSON.stringify(app.calls), JSON.stringify([['get_resume_versioned', { p_resume_id: resumeId }]]));
  assert.equal(app.clients[0][1], 'public-key');
  assert.equal(app.clients[0][2].global.headers.Authorization, 'Bearer verified-token');
  assert.equal(app.clients[0][2].auth.persistSession, false);
});

test('owned snapshot reader rejects malformed or wrong-owner rows', async () => {
  for (const data of [
    [],
    [snapshot({ user_id: 'other-user' })],
    [snapshot({ id: 'other-resume' })],
    [snapshot({ revision: 0 })],
    [snapshot({ updated_at: 'not-a-timestamp' })],
    [snapshot({ updated_at: null })],
    [(() => { const row = snapshot(); delete row.work_experience; return row; })()],
    [snapshot(), snapshot()],
  ]) {
    const app = loadAttachment({ rpcData: data });
    await assert.rejects(app.loadOwnedResumeSnapshot({
      createClient: () => ({ rpc: async () => ({ data, error: null }) }),
      supabaseUrl: 'https://project.supabase.co',
      publicKey: 'public-key',
      authorization: 'Bearer verified-token',
      resumeId,
      userId,
    }), (error) => ['RESUME_SNAPSHOT_UNAVAILABLE', 'RESUME_SNAPSHOT_OWNER_MISMATCH', 'RESUME_SNAPSHOT_INVALID'].includes(error.code));
  }
});

test('snapshot reader rejects absent bearer, RPC errors and never falls back to an admin client', async () => {
  for (const authorization of ['', 'Basic secret', 'Bearer ']) {
    const app = loadAttachment();
    await assert.rejects(app.loadOwnedResumeSnapshot({
      createClient: () => { throw new Error('must not create client'); },
      supabaseUrl: 'https://project.supabase.co',
      publicKey: 'public-key',
      authorization,
      resumeId,
      userId,
    }), /authorization/i);
  }
  const app = loadAttachment();
  await assert.rejects(app.loadOwnedResumeSnapshot({
    createClient: (...args) => { app.clients.push(args); return { rpc: async () => ({ data: [snapshot()], error: { message: 'missing' } }) }; },
    supabaseUrl: 'https://project.supabase.co',
    publicKey: 'public-key',
    authorization: 'Bearer verified-token',
    resumeId,
    userId,
  }), (error) => error.code === 'RESUME_SNAPSHOT_UNAVAILABLE');
});

test('one immutable package derives text and PDF bytes from the same saved revision', async () => {
  let rendered;
  const app = loadAttachment({ renderer: async (resume, fontData) => {
    rendered = { resume, fontData };
    return { blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }) };
  } });
  const source = snapshot();
  const packet = await app.createResumeAttachmentPackage({ snapshot: source, fontData: 'font-base64', filename: 'José Müller' });
  assert.equal(rendered.resume, source);
  assert.equal(rendered.fontData, 'font-base64');
  assert.equal(packet.resumeId, resumeId);
  assert.equal(packet.userId, userId);
  assert.equal(packet.revision, 7);
  assert.match(packet.resumeText, /José Müller გიორგი/);
  assert.match(packet.resumeText, /-20%/);
  assert.equal(packet.attachmentFilename, 'José_Müller_Resume.pdf');
  assert.equal(packet.byteLength, 8);
  assert.equal(packet.attachmentBase64, Buffer.from('%PDF-1.7').toString('base64'));
  assert.equal(typeof packet.sha256, 'string');
  assert.equal(packet.sha256.length, 64);
  assert.equal(Object.isFrozen(packet), true);
  assert.equal(Object.isFrozen(source), false);
});

test('attachment package fails closed on renderer failure, empty output and pending review packets', async () => {
  const failed = loadAttachment({ renderer: async () => { throw new Error('renderer detail'); } });
  await assert.rejects(failed.createResumeAttachmentPackage({ snapshot: snapshot(), fontData: 'font' }), (error) => error.code === 'RESUME_ATTACHMENT_UNAVAILABLE');

  const empty = loadAttachment({ renderer: async () => ({ blob: new Blob([]) }) });
  await assert.rejects(empty.createResumeAttachmentPackage({ snapshot: snapshot(), fontData: 'font' }), (error) => error.code === 'RESUME_ATTACHMENT_UNAVAILABLE');

  const invalid = loadAttachment({ renderer: async () => ({ blob: new Blob(['not-a-pdf']) }) });
  await assert.rejects(invalid.createResumeAttachmentPackage({ snapshot: snapshot(), fontData: 'font' }), (error) => error.code === 'RESUME_ATTACHMENT_UNAVAILABLE');

  const pending = loadAttachment();
  await assert.rejects(pending.createResumeAttachmentPackage({ snapshot: { kind: 'resume-tailoring-review', baseResume: snapshot(), suggestions: [] }, fontData: 'font' }), (error) => error.code === 'TAILORING_REVIEW_REQUIRED');
});

test('package revalidation rejects an owner, ID or revision change before dispatch', () => {
  const app = loadAttachment();
  const packet = { resumeId, userId, revision: 7 };
  assert.doesNotThrow(() => app.assertResumePackageCurrent(packet, snapshot()));
  for (const changed of [
    snapshot({ user_id: 'other-user' }),
    snapshot({ id: 'other-resume' }),
    snapshot({ revision: 8 }),
  ]) {
    assert.throws(() => app.assertResumePackageCurrent(packet, changed), (error) => error.code === 'RESUME_SNAPSHOT_CHANGED');
  }
});
