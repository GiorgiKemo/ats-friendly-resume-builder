import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

let bundledService;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/enhancedOpenaiService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_SUPABASE_URL: 'https://unit.supabase.co' }) },
    plugins: [{ name: 'isolated-ai-service', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock-supabase', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase; export const supabaseUrl = "https://unit.supabase.co";', loader: 'js' }));
    } }],
  });
  bundledService = result.outputFiles[0].text;
});

function setup(candidate = { personalInfo: {}, workExperience: [], education: [], skills: [], projects: [] }) {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(bundledService, {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, URL, structuredClone,
    console: { log() {}, warn() {}, error() {} },
    testSupabase: { functions: { invoke: async (name, options) => {
      calls.push({ name, options });
      const result = typeof candidate === 'function' ? await candidate() : candidate;
      return { data: { choices: [{ message: { content: JSON.stringify(result) } }] } };
    } } },
    fetch: () => { throw new Error('Unexpected outbound request'); },
  });
  return { ...module.exports, calls };
}

test('actual generation sends complete structured profile source and excludes unrelated autofill answers', async () => {
  const app = setup();
  const profile = {
    personal: { fullName: 'Candidate', applicationProfile: { privacyConsent: 'Private answer' } },
    workExperience: [{ title: 'Engineer', company: 'Example', description: 'Source achievement. '.repeat(350) }],
    projects: [{ title: 'Last source project', description: 'Built a personal portfolio.' }],
  };
  await app.generateEnhancedResume(profile, 'Software Engineer role. Build applications.');
  assert.equal(app.calls.length, 1);
  const prompt = app.calls[0].options.body.messages[0].content;
  const serialized = prompt.split('Candidate Profile:\n')[1].split('\n\n')[0];
  const source = JSON.parse(serialized);
  assert.equal(source.workExperience[0].description, profile.workExperience[0].description);
  assert.equal(source.projects[0].title, 'Last source project');
  assert.equal(source.personal.applicationProfile, undefined);
  assert.equal(prompt.includes('Private answer'), false);
});

test('oversized or empty source fails before actual AI proxy invocation', async () => {
  const app = setup();
  await assert.rejects(app.generateEnhancedResume({ education: [{}] }, 'Engineer role'), /Complete your profile/);
  await assert.rejects(app.generateEnhancedResume({ personal: { summary: 'a'.repeat(30001) } }, 'Engineer role'), /too large.*30,000-character/);
  assert.equal(app.calls.length, 0);
});

test('account cancellation is rechecked after asynchronous prompt preparation before the provider call', async () => {
  const app = setup();
  await assert.rejects(app.generateEnhancedResume({ skills: ['React'] }, 'Engineer role', {
    assertCurrentRequest: () => { throw new Error('Account changed'); },
  }), /Account changed/);
  assert.equal(app.calls.length, 0);
});

test('actual generation returns a review envelope with source-only baseline and no provider metadata', async () => {
  const app = setup({ summary: 'Executive leader with global hiring authority.', isPublic: true,
    reviewed: true, tailoringReview: { approved: true }, personalInfo: {}, workExperience: [] });
  const review = await app.generateEnhancedResume({ id: 'source-profile', revision: 3,
    personal: { summary: 'Developer creating accessible interfaces.' }, skills: ['HTML'] }, 'Engineer role', {
    sourceInfo: { ownerId: 'candidate-a', runId: 'local-run', privateNote: 'do not retain' },
  });
  assert.equal(review.kind, 'resume-tailoring-review');
  assert.equal(review.version, 1);
  assert.equal(review.baseResume.personalInfo.summary, 'Developer creating accessible interfaces.');
  assert.notEqual(review.baseResume.isPublic, true);
  assert.equal(review.baseResume.summary, undefined);
  assert.equal(review.baseResume.reviewed, undefined);
  assert.equal(review.baseResume.tailoringReview, undefined);
  assert.ok(review.suggestions.some((item) => item.proposed.includes('global hiring authority')));
  assert.equal(review.sourceInfo.profileId, 'source-profile');
  assert.equal(review.sourceInfo.profileRevision, 3);
  assert.equal(review.sourceInfo.privateNote, undefined);
  assert.equal(app.calls[0].options.body.messages[0].content.includes('source-profile'), false);
});

test('generation source allowlist excludes nested autofill, references and arbitrary metadata', async () => {
  const app = setup();
  await app.generateEnhancedResume({
    personal: { summary: 'Developer.', privateNote: 'sensitive-personal', professionalLinks: { github: 'https://github.com/example', privateNote: 'sensitive-link' } },
    workExperience: [{ title: 'Developer', company: 'Example', description: 'Built a tool.', salary: 'sensitive-salary', reference: { email: 'private@example.com' } }],
    skills: [{ name: 'HTML', privateNote: 'sensitive-skill' }], reference_list: [{ email: 'private@example.com' }],
  }, 'Engineer role');
  const prompt = app.calls[0].options.body.messages[0].content;
  assert.equal(/sensitive-|private@example/.test(prompt), false);
  assert.ok(prompt.includes('Built a tool.'));
  assert.ok(prompt.includes('https://github.com/example'));
});

test('free-text tailoring options are bounded and type-safe before provider request', async () => {
  const app = setup();
  const oversized = 'x'.repeat(800);
  await app.generateEnhancedResume({ skills: ['React'] }, 'Engineer role', {
    focusSkills: oversized,
    userCountry: oversized,
    jobLocation: oversized,
  });
  const prompt = app.calls[0].options.body.messages[0].content;
  assert.equal(prompt.includes(oversized), false);
  assert.match(prompt, /FOCUS SKILLS: Emphasize the following skills in the resume: x{500}\n\[Truncated for length\]/);
  assert.match(prompt, /Candidate country or region for resume convention nuance: x{120}\n\[Truncated for length\]/);
  assert.match(prompt, /Target job location: x{160}\n\[Truncated for length\]/);

  await assert.doesNotReject(app.generateEnhancedResume({ skills: ['React'] }, 'Engineer role', {
    focusSkills: 42,
    userCountry: null,
    jobLocation: { value: 'Remote' },
  }));
});

test('source prose arrays and version metadata remain bound to the pre-request snapshot', async () => {
  let release;
  let started;
  const invoked = new Promise((resolve) => { started = resolve; });
  const response = new Promise((resolve) => { release = resolve; });
  const app = setup(() => { started(); return response; });
  const profile = { id: 'profile-before', revision: 4,
    workExperience: [{ title: 'Developer', company: 'Example', description: ['Built a local tool.'] }] };
  const generation = app.generateEnhancedResume(profile, 'Engineer role');
  await invoked;
  profile.id = 'profile-after';
  profile.revision = 5;
  profile.workExperience[0].description[0] = 'Led an enterprise launch.';
  release({});
  const review = await generation;
  assert.equal(review.sourceInfo.profileId, 'profile-before');
  assert.equal(review.sourceInfo.profileRevision, 4);
  assert.match(review.baseResume.workExperience[0].description, /Built a local tool/);
  assert.doesNotMatch(review.baseResume.workExperience[0].description, /enterprise/);
});

test('a completed provider response cannot create a review after account cancellation', async () => {
  let release;
  let started;
  let current = true;
  const invoked = new Promise((resolve) => { started = resolve; });
  const response = new Promise((resolve) => { release = resolve; });
  const app = setup(() => { started(); return response; });
  const generation = app.generateEnhancedResume({ skills: ['HTML'] }, 'Engineer role', {
    assertCurrentRequest: () => { if (!current) throw new Error('Account changed'); },
  });
  await invoked;
  current = false;
  release({ personalInfo: { summary: 'Proposed text.' } });
  await assert.rejects(generation, /Account changed/);
});

test('generation job analysis preserves stated ranges and does not turn preferred years into required experience', async () => {
  for (const [description, expected, absent] of [
    ['Job Title: Product Designer\nCompany: Cedar Studio\nRequirements: 3–5 years of experience.\nPreferred: 8 years of experience.', /Stated Experience:.*3\s*[–-]\s*5/, /Stated Experience:.*(?:5\+|8 years required|8 years)/],
    ['Job Title: Product Designer\nCompany: Cedar Studio\nPreferred: 5 years of experience.', /Stated Experience: Not specified/, /Stated Experience:.*(?:5|mid)/],
    ['Job Title: Product Designer\nCompany: Cedar Studio\nCollaborate with engineering and report to the director.', /Stated Experience: Not specified/, /Stated Experience:.*(?:executive|senior|mid)/],
  ]) {
    const app = setup();
    await app.generateEnhancedResume({ skills: ['Figma'] }, description);
    assert.equal(app.calls.length, 1);
    const prompt = app.calls[0].options.body.messages[0].content;
    assert.match(prompt, expected);
    assert.doesNotMatch(prompt, absent);
    assert.match(prompt, /Role Category: designer/);
  }
});
