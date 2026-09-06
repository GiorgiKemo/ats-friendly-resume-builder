import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

let bundled;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/browserAgentService.js'], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'import.meta.env': '{}' }, external: ['./supabase', './browserAgentResumeArtifact.js'],
    plugins: [{ name: 'isolated-pdf-renderer', setup(builder) {
      builder.onResolve({ filter: /^\.\/resumePdfDocument\.js$/ }, () => ({ path: 'renderer', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const buildTextPdf = globalThis.testBuildPdf;', loader: 'js' }));
    } }],
  });
  bundled = result.outputFiles[0].text;
});

function setup({ changeOnFinalCheck = false } = {}) {
  const calls = [];
  const broadcasts = [];
  const listeners = new Set();
  const window = {
    origin: 'https://resumeats.cv', location: { origin: 'https://resumeats.cv' },
    setTimeout: () => 1, clearTimeout() {},
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    postMessage(message) {
      broadcasts.push(message);
      for (const listener of [...listeners]) listener({ source: window, data: {
        source: 'resumeats-browser-agent', target: 'resumeats-web', type: `${message.type}:response`, requestId: message.requestId, success: true, payload: { ok: true },
      } });
    },
  };
  let authCount = 0;
  const user = { id: 'owner-a', email: 'candidate@example.test' };
  const resume = { id: 'default-resume', title: 'Default', personalInfo: { fullName: 'Candidate' }, skills: [] };
  const profile = { personal: { phone: '+995 555 000 000' }, applicationProfile: { workAuthorization: 'Yes' }, skills: ['CSS'] };
  const supabase = {
    auth: { getUser: async () => {
      calls.push('auth'); authCount += 1;
      return { data: { user: changeOnFinalCheck && authCount === 3 ? { id: 'owner-b' } : user }, error: null };
    } },
    storage: { from: (bucket) => {
      calls.push(`storage:${bucket}`);
      return {
        upload: async () => { calls.push('upload'); return { error: null }; },
        createSignedUrl: async () => { calls.push('signed-url'); return { data: { signedUrl: 'https://synthetic.example/document' }, error: null }; },
      };
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(bundled, {
    module, exports: module.exports, crypto, window,
    testBuildPdf: async () => { calls.push('render'); return { blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }) }; },
    require: (name) => {
      if (name === './supabase') return { supabase };
      if (name === './browserAgentResumeArtifact.js') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const bridge = loadEdgeFunction('src/services/browserAgentAppBridge.js', {
    expose: ['syncBrowserAgentProfileFromApp'],
    imports: {
      './supabase': { supabase },
      './applicationAnswerService': {},
      './userProfileService': { getUserProfile: async () => { calls.push('profile-read'); return profile; } },
      './autoApplyService': { getJobPreferences: async () => { calls.push('preferences-read'); return { data: { default_resume_id: resume.id } }; } },
      './supabaseService': { getResumeById: async () => { calls.push('resume-read'); return resume; }, getUserResumes: async () => { throw new Error('Unexpected resume list fallback'); } },
      './browserAgentService': { buildBrowserAgentProfile: module.exports.buildBrowserAgentProfile },
      './browserAgentResumeArtifact.js': {},
    },
  }).exports;
  return { calls, bridge, broadcasts, sync: module.exports.syncBrowserAgentProfile, builder: module.exports.buildBrowserAgentProfile, input: { user, resume, userProfile: profile, preferences: {} } };
}

test('real app sync transport strips stale document metadata without mutating caller data or suppressing logout', async () => {
  const app = setup();
  const profile = { candidate: { userId: 'owner-a' }, documents: { resumePdfUrl: 'https://legacy.example/document' } };
  await app.sync(profile);
  assert.deepEqual(JSON.parse(JSON.stringify(app.broadcasts[0].payload)), { candidate: { userId: 'owner-a' }, documents: {} });
  assert.equal(profile.documents.resumePdfUrl, 'https://legacy.example/document');
  await app.sync(null);
  assert.equal(app.broadcasts[1].payload, null);
});

test('real profile-only app sync preserves contact answers but never renders, uploads or creates default document metadata', async () => {
  const app = setup();
  const result = await app.bridge.syncBrowserAgentProfileFromApp({ profileOnly: true });
  assert.equal(result.profile.candidate.userId, 'owner-a');
  assert.equal(result.profile.candidate.fullName, 'Candidate');
  assert.equal(result.profile.candidate.phone, '+995 555 000 000');
  assert.equal(result.profile.answers.workAuthorization, 'Yes');
  assert.deepEqual(JSON.parse(JSON.stringify(result.profile.documents)), {});
  assert.equal(result.resume.resumePdfUrl, undefined);
  assert.equal(result.resume.filename, undefined);
  assert.deepEqual(app.calls, ['auth', 'preferences-read', 'profile-read', 'resume-read', 'auth', 'auth']);
});

test('profile-only app sync still rejects an account change at the final disclosure boundary', async () => {
  const app = setup({ changeOnFinalCheck: true });
  await assert.rejects(app.bridge.syncBrowserAgentProfileFromApp({ profileOnly: true }), /account changed/);
  assert.equal(app.calls.some((call) => ['render', 'upload', 'signed-url'].includes(call) || call.startsWith('storage:')), false);
});

for (const option of [undefined, false, true]) {
  test(`profile builder is document-free even when the retired document option is ${String(option)}`, async () => {
    const app = setup();
    const result = await app.builder({ ...app.input, ...(option === undefined ? {} : { includeResumeDocument: option }) });
    assert.deepEqual(JSON.parse(JSON.stringify(result.documents)), {});
    assert.equal(result.candidate.userId, 'owner-a');
    assert.equal(result.answers.workAuthorization, 'Yes');
    assert.deepEqual(app.calls, [], 'No Auth, PDF renderer, Storage upload, or signed URL is needed to construct profile data');
  });
}

test('malformed persisted profile collections fail closed without crashing profile sync', async () => {
  const app = setup();
  const result = await app.builder({
    ...app.input,
    resume: {
      ...app.input.resume,
      personalInfo: [],
      workExperience: { company: 'Not an array' },
      education: 'Not an array',
      projects: { title: 'Not an array' },
      skills: { name: 'Not an array' },
    },
    userProfile: {
      personal: {
        professionalLinks: ['Not an object'],
        applicationProfile: 'Not an object',
      },
      workExperience: { title: 'Not an array' },
      education: null,
      projects: 'Not an array',
      skills: { skill: 'Not an array' },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result.experience)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.education)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.projects)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.skills)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.personal.professionalLinks)), {});
  assert.equal(result.answers.workAuthorization, '');
});

for (const payload of [{}, { profileOnly: false }, { profileOnly: true }, { includeResumeDocument: true }]) {
  test(`app sync never restores legacy PDF preparation for payload ${JSON.stringify(payload)}`, async () => {
    const app = setup();
    const result = await app.bridge.syncBrowserAgentProfileFromApp(payload);
    assert.deepEqual(JSON.parse(JSON.stringify(result.profile.documents)), {});
    assert.deepEqual(JSON.parse(JSON.stringify(result.resume)), { id: 'default-resume', title: 'Default' });
    assert.deepEqual(app.calls, ['auth', 'preferences-read', 'profile-read', 'resume-read', 'auth', 'auth']);
  });
}
