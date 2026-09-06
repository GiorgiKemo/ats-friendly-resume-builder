import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find } from './helpers/componentHarness.js';
import { hasUsableProfileData, serializeResumeSource } from '../src/utils/resumeGenerationInput.js';
import { createTailoringDraftSession } from '../src/utils/tailoringDraftSession.js';
import * as reviewTools from '../src/utils/resumeTailoringReview.js';
import { formatJobExperience } from '../src/utils/jobDescriptionParser.js';
import { getCareerLevelOptions } from '../src/utils/promptTemplates.js';

const reviewFixture = () => reviewTools.createResumeTailoringReview({
  baseResume: { personalInfo: { fullName: 'Candidate', summary: 'Built interfaces.' }, skills: ['C++'] },
  candidateResume: { personalInfo: { summary: 'Designed accessible interfaces.' } },
});

function setup({ profile = { skills: ['C++'] }, access = async () => ({ allowed: true }), refresh = async () => {}, store = async () => {}, importJob = async () => null, jobLevel = 'mid', storedDraft, drafts = createTailoringDraftSession('user-a'), save = async (resume) => ({ ...resume, id: 'saved' }) } = {}) {
  let user = { id: 'user-a' };
  let premium = true;
  let subscriptionLoading = false;
  let workerListener;
  const generations = [];
  const saves = [];
  const notices = [];
  const storage = new Map();
  if (storedDraft) storage.set('resumeats_ai_generator_draft_v1_user-a', JSON.stringify(storedDraft));
  const events = new Map();
  let storedState = null;
  const toast = (message) => notices.push(message);
  toast.error = toast.success = toast;
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  const browser = { addEventListener: (type, callback) => events.set(type, callback), removeEventListener: (type) => events.delete(type) };
  const classList = { add() {}, remove() {} };
  const navigate = () => {};
  const app = componentHarness('src/components/resume/EnhancedAIGenerator.jsx', {
    globals: {
      localStorage, sessionStorage: localStorage,
      window: { ...browser, localStorage, requestAnimationFrame: (callback) => callback() },
      document: { ...browser, body: { classList }, documentElement: { classList }, hidden: false },
    },
    imports: {
      '../../context/AuthContext': { useAuth: () => ({ user }) },
      '../../context/TailoringDraftContext': { useTailoringDraft: () => drafts },
      '../../context/ResumeContext': { useResume: () => ({ createResume: async (resume) => { saves.push(resume); return save(resume); } }) },
      '../../utils/resumeTailoringReview.js': reviewTools,
      './ResumeTailoringReview': { default: 'ResumeTailoringReview' },
      './ExtensionResumeHandoff': { default: 'ExtensionResumeHandoff' },
      '../../context/SubscriptionContext': { useSubscription: () => ({ isPremium: premium, loading: subscriptionLoading, subscriptionData: {}, getRemainingAIGenerations: () => 5, getAIGenerationAccess: access, refreshSubscriptionStatus: refresh }) },
      'react-router-dom': { useNavigate: () => navigate, Link: 'Link' },
      'react-hot-toast': { default: toast },
      '../ui/Textarea': { default: 'Textarea' }, '../ui/Button': { default: 'Button' }, '../ui/Select': { default: 'Select' },
      '../ui/Tooltip': { default: 'Tooltip' }, '../ui/icons/InformationCircleIcon': { default: 'Icon' },
      '../../services/enhancedOpenaiService': { generateEnhancedResume: (...args) => { const pending = deferred(); generations.push({ ...pending, args }); return pending.promise; } },
      '../../services/userProfileService': { getUserProfile: async () => profile },
      '../../utils/resumeDataMapper': { mapResumeData: (data) => data },
      '../../utils/jobDescriptionParser': { parseJobDescription: () => ({ title: 'Engineer', experience: { level: jobLevel, years: null } }), formatJobExperience },
      '../../utils/resumeTitle.js': { deriveResumeTitle: () => 'Engineer' },
      '../../services/browserAgentService': { getRecentBrowserAgentJobPosting: importJob, buildImportedJobDescription: (job) => job.description },
      '../../utils/promptTemplates': { getIndustryOptions: () => [], getCareerLevelOptions, getToneOptions: () => [], getLengthOptions: () => [] },
      '../../utils/serviceWorkerRegistration': {
        registerServiceWorker: async () => true, sendMessageToServiceWorker() {},
        listenForServiceWorkerMessages: (callback) => { workerListener = callback; return () => {}; },
        storeGenerationState: store, getGenerationState: async () => storedState, clearGenerationState: async () => {},
      },
    },
  });
  app.render();
  const job = () => find(app.render(), (node) => node.props?.id === 'jobDescription');
  if (!drafts.read('enhanced', user.id)) job().props.onChange({ target: { value: 'Engineer: build C++ applications.' } });
  const generate = () => find(app.render(), (node) => node.props?.id === 'generate-resume-button').props.onClick();
  const review = () => find(app.render(), (node) => node.type === 'ResumeTailoringReview');
  const complete = () => review().props.onComplete(reviewTools.keepOriginalResumeTailoring(review().props.review));
  return { ...app, drafts, review, complete, generations, saves, notices, storage, events, job, generate, setSubscription: (nextPremium, loading = false) => { premium = nextPremium; subscriptionLoading = loading; app.render(); }, setUser: (next) => { drafts.deactivate(); drafts = createTailoringDraftSession(next?.id); user = next; app.render(); }, setStoredState: (state) => { storedState = state; }, sendWorker: (message) => workerListener(message) };
}

test('empty placeholder profile sections cannot authorize a paid generation', async () => {
  for (const profile of [null, { personal: { fullName: 'Contact only' } }, { education: [{}], skills: [' ', {}], projects: [{ current: true }] }]) {
    assert.equal(hasUsableProfileData(profile), false);
  }
  assert.equal(hasUsableProfileData({ projects: [{ title: 'Volunteer project' }] }), true);
  const app = setup({ profile: { education: [{}] } });
  await app.generate();
  assert.equal(app.generations.length, 0);
  assert.ok(app.notices.some((message) => message.includes('Complete your profile')));
});

test('source serialization preserves complete profiles beyond the former cutoff and rejects oversized input explicitly', () => {
  const profile = { education: [{ description: 'a'.repeat(6000) }], projects: [{ title: 'Final project' }] };
  assert.deepEqual(JSON.parse(serializeResumeSource(profile)), profile);
  assert.throws(() => serializeResumeSource({ description: 'a'.repeat(30001) }), /too large.*30,000-character/);
});

test('generation preflight failures are handled and duplicate clicks cannot start overlapping calls', async () => {
  const gate = deferred();
  let checks = 0;
  const app = setup({ access: () => { checks += 1; return gate.promise; } });
  const pending = app.generate();
  await app.generate();
  assert.equal(checks, 1);
  gate.reject(new Error('Quota check unavailable'));
  await pending;
  assert.equal(app.generations.length, 0);
  assert.ok(app.notices.includes('Quota check unavailable'));
});

test('optional progress persistence and quota refresh failures do not discard a generated resume', async () => {
  const app = setup({ store: async () => { throw new Error('IndexedDB disabled'); }, refresh: async () => { throw new Error('Quota refresh offline'); } });
  const pending = app.generate();
  await app.flush();
  assert.equal(app.generations.length, 1);
  app.generations[0].resolve(reviewFixture());
  await pending;
  await app.flush();
  assert.equal(app.saves.length, 0);
  assert.ok(app.review());
  await app.complete();
  assert.equal(app.saves.length, 1);
  assert.ok(app.notices.includes('Reviewed resume saved.'));
});

test('account changes discard old generation results and isolate input drafts', async () => {
  const app = setup();
  const pending = app.generate();
  await app.flush();
  app.setUser({ id: 'user-b' });
  assert.equal(app.job().props.value, '');
  assert.equal(app.storage.has('resumeats_ai_generator_draft_v1_user-b'), false);
  app.generations[0].resolve({ personalInfo: { fullName: 'Private A' } });
  assert.throws(() => app.generations[0].args[2].assertCurrentRequest(), /account or page changed/);
  await pending;
  await app.flush();
  assert.equal(app.saves.length, 0);
  assert.equal(app.notices.length, 0);
  assert.equal(app.storage.has('resume_draft_new_user-b'), false);
});

test('unmount invalidates generation before its result can save or announce success', async () => {
  const app = setup();
  const pending = app.generate();
  await app.flush();
  app.unmount();
  app.generations[0].resolve({ personalInfo: { fullName: 'Candidate' } });
  await pending;
  assert.equal(app.saves.length, 0);
  assert.equal(app.notices.length, 0);
});

test('a changed account during quota preflight cannot start generation', async () => {
  const gate = deferred();
  const app = setup({ access: () => gate.promise });
  const pending = app.generate();
  app.setUser({ id: 'user-b' });
  gate.resolve({ allowed: true });
  await pending;
  assert.equal(app.generations.length, 0);
  assert.equal(app.notices.length, 0);
});

test('progress recovery ignores a previous account and a different run for the same account', async () => {
  const app = setup();
  await app.flush();
  const pending = app.generate();
  await app.flush();
  for (const userId of ['user-b', 'user-a']) {
    app.setStoredState({ userId, runId: 'old-run', isGenerating: true, progress: 99, step: 'extracting_keywords' });
    app.events.get('focus')();
    await app.flush();
    assert.equal(find(app.render(), (node) => node.props?.id === 'generate-resume-button').props.children, 'Building Your AI Resume Draft...');
    app.sendWorker({ type: 'GENERATION_PROGRESS_UPDATE', userId, runId: 'old-run', progress: { value: 99, step: 'extracting_keywords' } });
    assert.equal(find(app.render(), (node) => node.props?.id === 'generate-resume-button').props.children, 'Building Your AI Resume Draft...');
  }
  app.generations[0].resolve({ personalInfo: {} });
  await pending;
});

test('an extension job import finishing after an account switch cannot populate the new account draft', async () => {
  const imported = deferred();
  const app = setup({ importJob: () => imported.promise });
  const pending = find(app.render(), (node) => node.type === 'Button' && node.props.children === 'Import Latest Job').props.onClick();
  app.setUser({ id: 'user-b' });
  imported.resolve({ jobPosting: { title: 'Private search A', description: 'Job description A' } });
  await pending;
  assert.equal(app.job().props.value, '');
  assert.equal(app.notices.length, 0);
});

test('career level is optional without year thresholds and imports preserve the candidate choice', async () => {
  for (const selected of ['entry', 'mid', 'senior', 'executive', 'career-change', 'not-specified']) {
    const app = setup({ jobLevel: selected === 'executive' ? 'entry' : 'executive', importJob: async () => ({ jobPosting: { title: 'Different seniority', description: 'Imported target job', location: 'Remote' } }) });
    const career = () => find(app.render(), (node) => node.props?.id === 'careerLevel');
    assert.equal(career().props.value, 'not-specified');
    assert.ok(career().props.options.some((option) => option.value === 'not-specified'));
    assert.ok(career().props.options.every((option) => !/\d|years/i.test(option.label)));
    const help = find(app.render(), (node) => node.props?.id === career().props['aria-describedby']);
    assert.match(help.props.children, /own career stage, not the target job's level/);
    career().props.onChange({ target: { value: selected } });
    await find(app.render(), (node) => node.type === 'Button' && node.props.children === 'Import Latest Job').props.onClick();
    assert.equal(app.job().props.value, 'Imported target job');
    assert.equal(career().props.value, selected);
    assert.equal(find(app.render(), (node) => node.props?.id === 'jobLocation').props.value, 'Remote');
    const pending = app.generate();
    await app.flush();
    assert.equal(app.generations[0].args[2].careerLevel, selected);
    app.generations[0].resolve(reviewFixture());
    await pending;
  }
});

test('an in-flight job import cannot replace a newer candidate career-level choice', async () => {
  const response = deferred();
  const app = setup({ jobLevel: 'executive', importJob: () => response.promise });
  const pending = find(app.render(), (node) => node.type === 'Button' && node.props.children === 'Import Latest Job').props.onClick();
  find(app.render(), (node) => node.props?.id === 'careerLevel').props.onChange({ target: { value: 'career-change' } });
  response.resolve({ jobPosting: { description: 'Executive target job' } });
  await pending;
  assert.equal(find(app.render(), (node) => node.props?.id === 'careerLevel').props.value, 'career-change');
});

test('the neutral default does not replace an existing saved career preference', () => {
  for (const careerLevel of ['entry', 'mid', 'senior', 'executive', 'career-change']) {
    const app = setup({ storedDraft: { careerLevel, jobDescription: 'Existing job draft' } });
    assert.equal(find(app.render(), (node) => node.props?.id === 'careerLevel').props.value, careerLevel);
    app.unmount();
  }
});

test('pending review blocks regeneration and never creates a flat fallback draft', async () => {
  const app = setup();
  const pending = app.generate();
  await app.flush();
  app.generations[0].resolve(reviewFixture());
  await pending;
  assert.equal(app.saves.length, 0);
  assert.equal(app.storage.has('resume_draft_new_user-a'), false);
  await app.generate();
  assert.equal(app.generations.length, 1);
  const oldReview = app.review();
  find(app.render(), (node) => node.type === 'Button' && node.props.children === 'Discard suggestions').props.onClick();
  await oldReview.props.onComplete(reviewTools.keepOriginalResumeTailoring(oldReview.props.review));
  assert.equal(app.saves.length, 0);
  assert.equal(app.drafts.hasPending(), false);
});

test('review choices survive route remount and save failure without automatic acceptance or duplicate saves', async () => {
  const save = deferred();
  const app = setup({ save: () => save.promise });
  const pending = app.generate();
  await app.flush();
  app.generations[0].resolve(reviewFixture());
  await pending;
  app.review().props.onDecisionsChange({ summary: { choice: 'edited', text: 'My exact wording.', reviewId: app.review().props.review.reviewId } });
  const saving = app.review().props.onComplete(reviewTools.resolveResumeTailoringReview(app.review().props.review, app.review().props.decisions));
  assert.equal(app.saves[0].personalInfo.summary, 'My exact wording.');
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  assert.equal(restored.review().props.disabled, true);
  await restored.complete();
  assert.equal(restored.saves.length, 0);
  save.reject(new Error('Save offline'));
  await saving;
  await restored.flush();
  assert.equal(restored.review().props.disabled, false);
  assert.equal(restored.review().props.decisions.summary.text, 'My exact wording.');
  assert.equal(app.storage.has('resume_draft_new_user-a'), false);
  await restored.review().props.onComplete(reviewTools.resolveResumeTailoringReview(restored.review().props.review, restored.review().props.decisions));
  assert.equal(restored.saves[0].personalInfo.summary, 'My exact wording.');
  assert.equal(restored.drafts.hasPending(), false);
});

test('paid generation results survive route departure but logout destroys the account draft', async () => {
  const app = setup({ profile: { id: 'profile-a', revision: 3, skills: ['C++'] } });
  const pending = app.generate();
  await app.flush();
  assert.equal(app.generations[0].args[2].sourceInfo.profileRevision, 3);
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  app.generations[0].resolve(reviewFixture());
  await pending;
  await restored.flush();
  assert.ok(restored.review());
  assert.equal(app.notices.length, 0);
  assert.equal(app.saves.length, 0);
  const oldComplete = restored.review().props.onComplete;
  restored.setUser({ id: 'user-b' });
  await oldComplete(reviewTools.keepOriginalResumeTailoring(reviewFixture()));
  assert.equal(restored.saves.length, 0);
  assert.equal(restored.review(), undefined);
});

test('legacy flat generation responses fail closed instead of silently saving', async () => {
  const app = setup();
  const pending = app.generate();
  await app.flush();
  app.generations[0].resolve({ personalInfo: { summary: 'Unreviewed.' }, isPublic: true });
  await pending;
  assert.equal(app.saves.length, 0);
  assert.equal(app.review(), undefined);
  assert.ok(app.notices.some((notice) => notice.includes('missing its source review')));
});

test('save success arriving on a remounted generator exposes the saved resume and releases pending memory', async () => {
  const receipt = deferred();
  const app = setup({ save: () => receipt.promise });
  const pending = app.generate();
  await app.flush();
  app.generations[0].resolve(reviewFixture());
  await pending;
  const saving = app.complete();
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  receipt.resolve({ id: 'reviewed-saved', personalInfo: { fullName: 'Candidate' } });
  await saving;
  await restored.flush();
  assert.ok(find(restored.render(), (node) => node.type === 'Button' && node.props.children === 'View Generated Resume'));
  assert.equal(restored.review(), undefined);
  assert.equal(restored.drafts.hasPending(), false);
});

test('generator input retains source revision but excludes autofill answers at either profile level', async () => {
  const profile = { id: 'profile-a', revision: 4, personal: { fullName: 'Candidate', applicationProfile: { disability: 'Private' } }, applicationProfile: { workAuthorization: 'Private' }, skills: ['C++'] };
  const app = setup({ profile });
  const pending = app.generate();
  await app.flush();
  const submitted = app.generations[0].args[0];
  assert.equal(submitted.id, 'profile-a');
  assert.equal(submitted.revision, 4);
  assert.equal(submitted.applicationProfile, undefined);
  assert.equal(submitted.personal.applicationProfile, undefined);
  app.generations[0].resolve(reviewFixture());
  await pending;
});

test('an existing Enhanced review and saved result remain accessible after premium expiry without allowing new generation', async () => {
  const app = setup();
  const pending = app.generate();
  await app.flush();
  app.setSubscription(false, true);
  assert.ok(find(app.render(), (node) => node.props?.id === 'generate-resume-button'));
  app.generations[0].resolve(reviewFixture());
  await pending;
  assert.ok(app.review());
  app.setSubscription(false);
  await app.complete();
  assert.ok(find(app.render(), (node) => node.type === 'Button' && node.props.children === 'View Generated Resume'));
  assert.equal(find(app.render(), (node) => node.props?.id === 'generate-resume-button').props.disabled, true);
  await app.generate();
  assert.equal(app.generations.length, 1);
});
