import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { createTailoringDraftSession } from '../src/utils/tailoringDraftSession.js';
import * as reviewTools from '../src/utils/resumeTailoringReview.js';
import { formatJobExperience } from '../src/utils/jobDescriptionParser.js';
import { getCareerLevelOptions } from '../src/utils/promptTemplates.js';

const sourceProfile = {
  personal: { fullName: 'Saved Candidate', email: 'saved@example.com', professionalLinks: { linkedin: 'https://linkedin.com/in/candidate', portfolio: 'https://portfolio.example.com' } },
  workExperience: [{ title: 'Designer', company: 'Northstar', responsibilities: 'Built an accessible onboarding flow.' }],
  education: [{ institution: 'University', degree: 'BA' }], skills: ['Figma'],
  projects: [{ title: 'Portfolio', description: 'Built a portfolio.' }], certifications: [{ name: 'Course', issuer: 'School' }],
};

const reviewFixture = () => reviewTools.createResumeTailoringReview({
  baseResume: { personalInfo: { ...sourceProfile.personal, summary: 'Designer.' }, ...Object.fromEntries(Object.entries(sourceProfile).filter(([key]) => key !== 'personal')) },
  candidateResume: { personalInfo: { summary: 'Designed accessible interfaces.' } },
});

function setup({ access = async () => ({ allowed: true }), refresh = async () => {}, importJob = async () => null, jobLevel = 'mid', drafts = createTailoringDraftSession('account-a') } = {}) {
  let user = { id: 'account-a', email: 'auth@example.com' };
  let premium = true;
  let subscriptionLoading = false;
  const loads = [];
  const generations = [];
  const saves = [];
  const applications = [];
  const exports = [];
  const notices = [];
  const timers = new Set();
  const toast = (message) => notices.push(message);
  toast.error = toast.success = toast;
  const navigate = () => {};
  const app = componentHarness('src/pages/SimpleResumeFlow.jsx', {
    globals: { setInterval: (callback) => { timers.add(callback); return callback; }, clearInterval: (timer) => timers.delete(timer) },
    imports: {
      'react-router-dom': { useNavigate: () => navigate, Link: 'Link' },
      '../context/AuthContext': { useAuth: () => ({ user }) },
      '../context/TailoringDraftContext': { useTailoringDraft: () => drafts },
      '../utils/resumeTailoringReview.js': reviewTools,
      '../components/resume/ResumeTailoringReview': { default: 'ResumeTailoringReview' },
      '../context/ResumeContext': { useResume: () => ({ createResume: (resume) => { const request = deferred(); saves.push({ ...request, resume }); return request.promise; } }) },
      '../context/SubscriptionContext': { useSubscription: () => ({ isPremium: premium, loading: subscriptionLoading, getAIGenerationAccess: access, refreshSubscriptionStatus: refresh }) },
      '../services/enhancedOpenaiService': { generateEnhancedResume: (...args) => { const request = deferred(); generations.push({ ...request, args }); return request.promise; } },
      '../services/userProfileService': { getUserProfile: (userId) => { const request = deferred(); loads.push({ ...request, userId }); return request.promise; } },
      '../utils/resumeDataMapper': { mapResumeData: (resume) => resume },
      '../utils/jobDescriptionParser': { parseJobDescription: () => ({ title: 'Designer', experience: { level: jobLevel, years: null } }), formatJobExperience },
      '../utils/promptTemplates': { getCareerLevelOptions },
      '../utils/resumeTitle.js': { deriveResumeTitle: () => 'Designer at Company', extractCompanyFromJobDescription: () => 'Company' },
      '../services/applicationService': { createApplication: (application, userId) => { const request = deferred(); applications.push({ ...request, application, userId }); return request.promise; } },
      '../services/browserAgentService': { getRecentBrowserAgentJobPosting: importJob, buildImportedJobDescription: (job) => job.description },
      '../services/pdfService': { downloadResumePdf: (...args) => { const request = deferred(); exports.push({ ...request, format: 'pdf', args }); return request.promise; } },
      '../services/docxService': { downloadResumeDocx: (...args) => { const request = deferred(); exports.push({ ...request, format: 'docx', args }); return request.promise; } },
      '../utils/resumeExportReadiness': { exportFormatOptions: [{ id: 'pdf' }, { id: 'docx' }], getResumeExportReadiness: () => ({ completedCount: 0, totalCount: 0, checks: [] }) },
      '../components/ui/Button': { default: 'Button' }, 'react-hot-toast': { default: toast },
      'framer-motion': { motion: { div: 'motion.div' }, AnimatePresence: 'AnimatePresence' },
      ...Object.fromEntries(['ATSFriendly', 'Basic', 'Minimalist', 'Modern', 'Traditional'].map((name) => [`../components/templates/${name}Template`, { default: `${name}Template` }])),
    },
  });
  app.render();
  const field = (id) => find(app.render(), (node) => node.props?.id === id);
  const button = (text) => find(app.render(), (node) => node.type === 'Button' && textContent(node).includes(text));
  const preview = () => find(app.render(), (node) => typeof node.type === 'string' && node.type.endsWith('Template'));
  const review = () => find(app.render(), (node) => node.type === 'ResumeTailoringReview');
  const complete = () => review().props.onComplete(reviewTools.keepOriginalResumeTailoring(review().props.review));
  return { ...app, drafts, review, complete, loads, generations, saves, applications, exports, notices, timers, field, button, preview, setSubscription: (nextPremium, loading = false) => { premium = nextPremium; subscriptionLoading = loading; app.render(); }, setUser: (next) => { drafts.deactivate(); drafts = createTailoringDraftSession(next?.id); user = next; app.render(); } };
}

async function generate(app) {
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Design role at Company' } });
  const pending = app.button('Generate Resume').props.onClick();
  await app.flush();
  app.generations[0].resolve(reviewFixture());
  await pending;
  assert.equal(app.preview(), undefined);
  app.complete();
  return app.preview();
}

test('profile loading and retry preserve edited contact fields while retaining full career source facts', async () => {
  const app = setup();
  app.field('fullName').props.onChange({ target: { value: 'Typed Candidate' } });
  app.field('email').props.onChange({ target: { value: 'typed@example.com' } });
  app.loads[0].reject(new Error('Offline'));
  await app.flush();
  find(app.render(), (node) => node.type === 'button' && textContent(node) === 'Retry profile load').props.onClick();
  app.render();
  app.loads[1].resolve(sourceProfile);
  await app.flush();
  assert.equal(app.field('fullName').props.value, 'Typed Candidate');
  assert.equal(app.field('email').props.value, 'typed@example.com');
  assert.equal(app.field('linkedin').props.value, sourceProfile.personal.professionalLinks.linkedin);
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Design role at Company' } });
  const pending = app.button('Generate Resume').props.onClick();
  await app.flush();
  const submitted = app.generations[0].args[0];
  assert.equal(submitted.personal.fullName, 'Typed Candidate');
  for (const key of ['workExperience', 'education', 'skills', 'projects', 'certifications']) assert.deepEqual(submitted[key], sourceProfile[key]);
  assert.equal(submitted.personal.professionalLinks.portfolio, sourceProfile.personal.professionalLinks.portfolio);
  app.generations[0].resolve({ personalInfo: {} });
  await pending;
});

test('missing career evidence blocks generation before quota check and provides a profile link', async () => {
  let checks = 0;
  const app = setup({ access: async () => { checks += 1; return { allowed: true }; } });
  app.loads[0].resolve({ personal: sourceProfile.personal, education: [{}], skills: [' '] });
  await app.flush();
  assert.ok(find(app.render(), (node) => node.type === 'Link' && node.props.to === '/profile'));
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Design role' } });
  assert.equal(app.button('Generate Resume').props.disabled, true);
  await app.button('Generate Resume').props.onClick();
  assert.equal(checks, 0);
  assert.equal(app.generations.length, 0);
});

test('Quick Resume keeps the optional candidate career level separate from imported job seniority', async () => {
  for (const selected of ['entry', 'mid', 'senior', 'executive', 'career-change', 'not-specified']) {
    const app = setup({ jobLevel: selected === 'executive' ? 'entry' : 'executive', importJob: async () => ({ jobPosting: { description: 'Imported target job' } }) });
    app.loads[0].resolve(sourceProfile);
    await app.flush();
    app.button('Next').props.onClick();
    assert.equal(app.field('careerLevel').props.value, 'not-specified');
    assert.match(textContent(app.field(app.field('careerLevel').props['aria-describedby'])), /own career stage, not the target job's level/);
    app.field('careerLevel').props.onChange({ target: { value: selected } });
    await app.button('Import Latest Job').props.onClick();
    assert.equal(app.field('jobDescription').props.value, 'Imported target job');
    assert.equal(app.field('careerLevel').props.value, selected);
    const pending = app.button('Generate Resume').props.onClick();
    await app.flush();
    assert.equal(app.generations[0].args[2].careerLevel, selected);
    app.generations[0].resolve(reviewFixture());
    await pending;
  }
});

test('Quick Resume job import preserves a career choice made while the request is pending', async () => {
  const response = deferred();
  const app = setup({ jobLevel: 'executive', importJob: () => response.promise });
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  const pending = app.button('Import Latest Job').props.onClick();
  app.field('careerLevel').props.onChange({ target: { value: 'entry' } });
  response.resolve({ jobPosting: { description: 'Executive target job' } });
  await pending;
  assert.equal(app.field('careerLevel').props.value, 'entry');
});

test('quota failures are caught and duplicate generation clicks share one in-flight request', async () => {
  const gate = deferred();
  let checks = 0;
  const app = setup({ access: () => { checks += 1; return gate.promise; } });
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Design role' } });
  const button = app.button('Generate Resume');
  const pending = button.props.onClick();
  await button.props.onClick();
  assert.equal(checks, 1);
  gate.reject(new Error('Quota temporarily unavailable'));
  await pending;
  assert.ok(app.notices.includes('Quota temporarily unavailable'));
  assert.equal(app.timers.size, 0);
});

test('quota refresh failure does not discard the generated result', async () => {
  const app = setup({ refresh: async () => { throw new Error('Offline'); } });
  const preview = await generate(app);
  assert.equal(preview.props.resume.personalInfo.fullName, 'Saved Candidate');
  assert.equal(app.timers.size, 0);
});

test('account switching drops stale profile loads and generation results; unmount cancels active work', async () => {
  const app = setup();
  app.setUser({ id: 'account-b', email: 'b@example.com' });
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  assert.equal(app.field('fullName').props.value, '');
  assert.equal(app.field('email').props.value, 'b@example.com');
  app.loads[1].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Design role' } });
  const pending = app.button('Generate Resume').props.onClick();
  await app.flush();
  app.setUser({ id: 'account-c' });
  app.generations[0].resolve({ personalInfo: { fullName: 'Private B' } });
  await pending;
  assert.equal(app.preview(), undefined);
  assert.equal(app.notices.length, 0);
  assert.equal(app.timers.size, 0);
  const another = setup();
  another.loads[0].resolve(sourceProfile);
  await another.flush();
  another.button('Next').props.onClick();
  another.field('jobDescription').props.onChange({ target: { value: 'Design role' } });
  const abandoned = another.button('Generate Resume').props.onClick();
  await another.flush();
  another.unmount();
  another.generations[0].resolve({ personalInfo: {} });
  await abandoned;
  assert.equal(another.notices.length, 0);
  assert.equal(another.timers.size, 0);
});

test('Save and Track records Saved, surfaces partial failure, and retries without creating another resume', async () => {
  const app = setup();
  await generate(app);
  const button = app.button('Save & Track');
  const pending = button.props.onClick();
  await button.props.onClick();
  assert.equal(app.saves.length, 1);
  app.saves[0].resolve({ id: 'resume-a' });
  await app.flush();
  assert.equal(app.applications[0].application.status, 'saved');
  assert.equal(app.applications[0].application.resume_id, 'resume-a');
  assert.equal(app.applications[0].userId, 'account-a');
  app.applications[0].resolve({ data: null, error: new Error('Tracker offline') });
  await pending;
  assert.ok(app.notices.some((message) => typeof message === 'string' && message.includes('resume was saved, but tracking failed')));
  const retry = app.button('Save & Track').props.onClick();
  await app.flush();
  assert.equal(app.saves.length, 1);
  assert.equal(app.applications.length, 2);
  app.applications[1].resolve({ data: { id: 'job-a' }, error: null });
  await retry;
  assert.equal(app.button('Saved to tracker').props.disabled, true);
  await button.props.onClick();
  assert.equal(app.applications.length, 2);
});

test('switching accounts during resume save cannot create a tracker record for the previous account', async () => {
  const app = setup();
  await generate(app);
  const pending = app.button('Save & Track').props.onClick();
  const before = app.notices.length;
  app.setUser({ id: 'account-b' });
  app.saves[0].resolve({ id: 'old-resume' });
  await pending;
  assert.equal(app.applications.length, 0);
  assert.equal(app.notices.length, before);
});

test('actual tracker service rejects a changed account before any insert', async () => {
  const auth = deferred();
  let inserts = 0;
  const { exports: service } = loadEdgeFunction('src/services/applicationService.js', {
    imports: { './supabase': { supabase: { auth: { getUser: () => auth.promise }, from: () => { inserts += 1; throw new Error('Unexpected insert'); } } } },
  });
  const pending = service.createApplication({ company: 'Company', position: 'Designer', status: 'saved' }, 'account-a');
  auth.resolve({ data: { user: { id: 'account-b' } } });
  const result = await pending;
  assert.match(result.error.message, /account changed/);
  assert.equal(inserts, 0);
});

test('account changes and unmount during export module loading prevent either format from downloading', async () => {
  for (const format of ['PDF', 'DOCX']) {
    for (const unmount of [false, true]) {
      const app = setup();
      await generate(app);
      app.preview().props.ref.current = {};
      const before = app.notices.length;
      const pending = app.button(`Download ${format}`).props.onClick();
      if (unmount) app.unmount();
      else app.setUser({ id: 'account-b' });
      await pending;
      assert.equal(app.exports.length, 0);
      assert.equal(app.notices.length, before);
    }
  }
});

test('export callbacks lock repeated clicks and ignore obsolete completion', async () => {
  const app = setup();
  await generate(app);
  app.preview().props.ref.current = {};
  const button = app.button('Download PDF');
  const pending = button.props.onClick();
  await button.props.onClick();
  await app.flush();
  assert.equal(app.exports.length, 1);
  assert.equal(app.exports[0].args.length, 3);
  const before = app.notices.length;
  app.setUser({ id: 'account-b' });
  app.exports[0].reject(new Error('Old account export failed'));
  await pending;
  assert.equal(app.notices.length, before);

  app.loads[1].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Another role' } });
  const generation = app.button('Generate Resume').props.onClick();
  await app.flush();
  app.generations[1].resolve(reviewFixture());
  await generation;
  app.complete();
  assert.equal(app.button('Download DOCX').props.disabled, false);
  const word = app.button('Download DOCX').props.onClick();
  await app.flush();
  app.exports[1].resolve(true);
  await word;
  assert.ok(app.notices.includes('Word document downloaded!'));
});

test('Quick Resume withholds preview, save and exports until an explicit review decision', async () => {
  const app = setup();
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Original target role' } });
  const generateButton = app.button('Generate Resume');
  const pending = generateButton.props.onClick();
  await app.flush();
  app.generations[0].resolve(reviewFixture());
  await pending;
  assert.equal(app.preview(), undefined);
  assert.equal(app.button('Download PDF'), undefined);
  assert.equal(app.button('Save & Track'), undefined);
  await generateButton.props.onClick();
  assert.equal(app.generations.length, 1);
  assert.equal(app.saves.length + app.exports.length, 0);
  const review = app.review();
  review.props.onDecisionsChange({ summary: { choice: 'edited', text: 'My reviewed wording.', reviewId: review.props.review.reviewId } });
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  assert.equal(restored.review().props.decisions.summary.text, 'My reviewed wording.');
  restored.review().props.onComplete(reviewTools.resolveResumeTailoringReview(restored.review().props.review, restored.review().props.decisions));
  assert.equal(restored.preview().props.resume.personalInfo.summary, 'My reviewed wording.');
  assert.equal(restored.drafts.read('quick', 'account-a').jobDescription, 'Original target role');
});

test('Quick review discard and account switch invalidate old approval callbacks', async () => {
  for (const action of ['discard', 'account']) {
    const drafts = createTailoringDraftSession('account-a');
    drafts.write('quick', 'account-a', { userId: 'account-a', runId: 'review-a', stage: 'review', review: reviewFixture(), decisions: {}, jobDescription: 'Role' });
    const app = setup({ drafts });
    const callback = app.review().props.onComplete;
    if (action === 'discard') app.button('Discard suggestions').props.onClick();
    else app.setUser({ id: 'account-b' });
    callback(reviewTools.keepOriginalResumeTailoring(reviewFixture()));
    assert.equal(app.preview(), undefined);
    assert.equal(app.saves.length + app.exports.length, 0);
  }
});

test('Quick generation completed away from the route restores its review, not an exportable resume', async () => {
  const app = setup();
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Original target role' } });
  const pending = app.button('Generate Resume').props.onClick();
  await app.flush();
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  app.generations[0].resolve(reviewFixture());
  await pending;
  await restored.flush();
  assert.ok(restored.review());
  assert.equal(restored.preview(), undefined);
  assert.equal(app.notices.length, 0);
});

test('Quick template and save receipts survive remount and prevent duplicate saves and tracker requests', async () => {
  const app = setup();
  await generate(app);
  find(app.render(), (node) => node.type === 'button' && node.props.children === 'Modern').props.onClick();
  const pending = app.button('Save & Track').props.onClick();
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  assert.equal(restored.preview().props.resume.selectedTemplate, 'modern');
  assert.equal(restored.button('Saving...').props.disabled, true);
  await restored.button('Saving...').props.onClick();
  assert.equal(restored.saves.length, 0);
  app.saves[0].resolve({ id: 'saved-once' });
  await restored.flush();
  assert.equal(app.applications.length, 1);
  assert.equal(restored.applications.length, 0);
  app.applications[0].resolve({ data: null, error: new Error('Tracker unavailable') });
  await pending;
  await restored.flush();
  const retry = restored.button('Save & Track').props.onClick();
  assert.equal(restored.saves.length, 0);
  assert.equal(restored.applications[0].application.resume_id, 'saved-once');
  restored.applications[0].resolve({ data: { id: 'tracked-once' } });
  await retry;
  assert.equal(restored.drafts.hasPending(), false);
});

test('Quick Resume rejects a flat legacy generation response without exposing export controls', async () => {
  const app = setup();
  app.loads[0].resolve(sourceProfile);
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Target role' } });
  const pending = app.button('Generate Resume').props.onClick();
  await app.flush();
  app.generations[0].resolve({ personalInfo: { summary: 'Unreviewed content.' } });
  await pending;
  assert.equal(app.preview(), undefined);
  assert.equal(app.review(), undefined);
  assert.ok(app.notices.some((notice) => notice.includes('missing its source review')));
});

test('successful tracking receipt arriving after remount updates the action label and cannot submit again', async () => {
  const app = setup();
  await generate(app);
  const pending = app.button('Save & Track').props.onClick();
  app.unmount();
  const restored = setup({ drafts: app.drafts });
  app.saves[0].resolve({ id: 'saved-resume' });
  await restored.flush();
  app.applications[0].resolve({ data: { id: 'tracked-job' } });
  await pending;
  await restored.flush();
  assert.equal(restored.button('Saved to tracker').props.disabled, true);
  await restored.button('Saved to tracker').props.onClick();
  assert.equal(restored.saves.length + restored.applications.length, 0);
  assert.equal(restored.drafts.hasPending(), false);
});

test('Quick input excludes autofill answers and exports only the explicitly reviewed text', async () => {
  const app = setup();
  app.loads[0].resolve({ ...sourceProfile, id: 'profile-a', revision: 7, applicationProfile: { disability: 'Private' }, personal: { ...sourceProfile.personal, applicationProfile: { consent: 'Private' } } });
  await app.flush();
  app.button('Next').props.onClick();
  app.field('jobDescription').props.onChange({ target: { value: 'Role' } });
  const pending = app.button('Generate Resume').props.onClick();
  await app.flush();
  const [source, , options] = app.generations[0].args;
  assert.equal(source.applicationProfile, undefined);
  assert.equal(source.personal.applicationProfile, undefined);
  assert.equal(options.sourceInfo.profileRevision, 7);
  app.generations[0].resolve(reviewFixture());
  await pending;
  const review = app.review();
  const decisions = { summary: { choice: 'edited', text: 'Confirmed exact wording.', reviewId: review.props.review.reviewId } };
  review.props.onComplete(reviewTools.resolveResumeTailoringReview(review.props.review, decisions));
  const exporting = app.button('Download DOCX').props.onClick();
  await app.flush();
  assert.equal(app.exports[0].args[0].personalInfo.summary, 'Confirmed exact wording.');
  assert.equal(app.exports[0].args[0].suggestions, undefined);
  app.exports[0].resolve(true);
  await exporting;
});

test('Quick existing review and reviewed exports remain accessible after premium expiry', async () => {
  const drafts = createTailoringDraftSession('account-a');
  drafts.write('quick', 'account-a', { userId: 'account-a', runId: 'authorized', stage: 'review', review: reviewFixture(), decisions: {}, jobDescription: 'Authorized role', selectedTemplate: 'minimalist' });
  const app = setup({ drafts });
  app.setSubscription(false, true);
  assert.ok(app.review());
  app.setSubscription(false);
  app.complete();
  assert.equal(app.preview().props.resume.selectedTemplate, 'minimalist');
  assert.equal(app.button('Download DOCX').props.disabled, false);
  assert.equal(app.generations.length, 0);
});
