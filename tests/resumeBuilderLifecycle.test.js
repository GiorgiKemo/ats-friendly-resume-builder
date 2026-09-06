import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';
import * as progress from '../src/utils/resumeBuilderProgress.js';

const blank = () => ({
  id: '', title: '', personalInfo: { fullName: '', email: '', phone: '', location: '', professionalLinks: {} },
  education: [], workExperience: [], skills: [], projects: [], certifications: [], additionalSections: [], selectedTemplate: 'basic',
});
const profile = { personal: { fullName: 'Saved profile', email: 'profile@example.com' }, education: [{ institution: 'University' }] };

function setup({ id = 'resume-a', navigationState, context = {} } = {}) {
  let user = { id: 'account-a' };
  let resumeId = id;
  let location = { pathname: id ? `/builder/${id}` : '/builder', state: navigationState };
  let currentResume = { ...blank(), id };
  const initialResumeState = blank();
  const profiles = [];
  const loads = [];
  const listRequests = [];
  const saves = [];
  const creates = [];
  const updates = [];
  const downloads = [];
  const routes = [];
  const notices = [];
  const frames = [];
  const confirmations = [];
  let confirmed = true;
  const reloads = [];
  const recovered = [];
  const discarded = [];
  const storage = new Map();
  const notify = (notice) => notices.push(notice);
  const navigate = (route, options) => routes.push({ route, options });
  const loadResume = (loadId) => { const call = deferred(); loads.push({ ...call, id: loadId }); return call.promise; };
  const updateCurrentResume = (resume) => { updates.push(resume); currentResume = { ...currentResume, ...resume }; };
  const updateResume = (saveId, resume) => { const call = deferred(); saves.push({ ...call, id: saveId, resume }); return call.promise; };
  const createResume = (resume) => { const call = deferred(); creates.push({ ...call, resume }); return call.promise; };
  const restoreNewResumeDraft = () => false;
  const reloadSavedResume = () => { const call = deferred(); reloads.push(call); return call.promise; };
  const recoverDraft = (key) => { recovered.push(key); return true; };
  const discardRecoveryDraft = (key) => { discarded.push(key); };
  const sections = ['PersonalInfoSection', 'WorkExperienceSection', 'EducationSection', 'SkillsSection', 'CertificationsSection', 'ProjectsSection', 'AdditionalSectionsSection', 'TemplateSelector', 'AIResumeGenerator', 'ResumePreviewPane', 'MobileNavigation', 'MobileResumeNavBar', 'ResumeSectionIcon', 'ResumeSectionStatusBadge'];
  const templates = ['Basic', 'Minimalist', 'Traditional', 'Modern', 'ATSFriendly'];
  const app = componentHarness('src/pages/ResumeBuilder.jsx', {
    globals: {
      localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), requestAnimationFrame: (callback) => frames.push(callback), confirm: (message) => { confirmations.push(message); return confirmed; } },
    },
    imports: {
      'react-router-dom': { useParams: () => ({ resumeId }), useNavigate: () => navigate, useLocation: () => location },
      'react-hot-toast': { default: Object.assign(notify, { error: notify, success: notify }) },
      '../context/AuthContext': { useAuth: () => ({ user }) },
      '../context/ThemeContext': { useTheme: () => ({ isDark: false }) },
      '../context/SubscriptionContext': { useSubscription: () => ({ isPremium: true }) },
      '../context/ResumeContext': { useResume: () => ({
        currentResume, initialResumeState, loading: false, error: null, hasUnsavedChanges: true,
        getResumeById: loadResume, updateCurrentResume, updateResume, createResume,
        atsIssues: [], atsScore: null, atsLoading: false, runAtsCheck: async () => {},
        restoreNewResumeDraft, reloadSavedResume, recoverDraft, discardRecoveryDraft, ...context,
      }) },
      '../components/ui/Button': { default: 'Button' },
      '../components/ui/AutosaveIndicator': { default: 'AutosaveIndicator' },
      '../components/ats/AtsCheckerDisplay.jsx': { default: 'AtsCheckerDisplay' },
      ...Object.fromEntries(sections.map((name) => [`../components/resume/${name}`, { default: name }])),
      ...Object.fromEntries(templates.map((name) => [`../components/templates/${name}Template`, { default: `${name}Template` }])),
      '../utils/resumeBuilderProgress': progress,
      '../services/userProfileService': { getUserProfile: (ownerId) => { const call = deferred(); profiles.push({ ...call, ownerId }); return call.promise; } },
      '../services/supabaseService': { getUserResumes: async () => { listRequests.push(resumeId); return []; } },
      '../services/docxService': { downloadResumeDocx: async (resume) => downloads.push({ format: 'docx', resume }) },
      '../services/pdfService': { downloadResumePdf: async (...args) => downloads.push({ format: 'pdf', resume: args[1], args }) },
    },
  });
  const render = () => {
    const tree = app.render();
    const template = find(tree, (node) => /Template$/.test(String(node.type)));
    if (template?.props.ref) template.props.ref.current = { syntheticExportElement: true };
    return tree;
  };
  render();
  return {
    ...app, render, profiles, loads, saves, creates, updates, downloads, routes, notices, reloads, recovered, discarded, confirmations, listRequests,
    get currentResume() { return currentResume; },
    edit: (updates) => { currentResume = { ...currentResume, ...updates }; render(); },
    setUser: (next) => { user = next; render(); },
    setContext: (next) => { Object.assign(context, next); render(); },
    confirm: (value) => { confirmed = value; },
    button: (label) => find(render(), (node) => node.type === 'Button' && textContent(node) === label),
    setRoute: (next) => { resumeId = next; location = { pathname: `/builder/${next}`, state: null }; render(); },
    sync: () => find(render(), (node) => node.type === 'Button' && /Sync Profile Data/.test(textContent(node))),
    save: () => find(render(), (node) => node.type === 'Button' && /Save Resume|Create Resume|Saving|Creating/.test(textContent(node))),
    chooseAction: (value) => find(render(), (node) => node.props?.id === 'save-action').props.onChange({ target: { value } }),
    frame: async () => { frames.splice(0).forEach((callback) => callback()); await app.flush(); },
  };
}

test('initial builder profile prefill is account-bound and never overwrites typing during the load', async () => {
  for (const edited of [false, true]) {
    const app = setup({ id: '' });
    assert.equal(app.profiles[0].ownerId, 'account-a');
    if (edited) app.edit({ personalInfo: { ...app.currentResume.personalInfo, fullName: 'Typed while loading' } });
    app.profiles[0].resolve(profile);
    await app.flush();
    assert.equal(app.currentResume.personalInfo.fullName, edited ? 'Typed while loading' : 'Saved profile');
    assert.equal(app.updates.length, edited ? 0 : 1);
  }
});

test('old profile prefill cannot cross an account switch or unmount', async () => {
  for (const unmount of [false, true]) {
    const app = setup({ id: '' });
    if (unmount) app.unmount();
    else app.setUser({ id: 'account-b' });
    app.profiles[0].resolve(profile);
    await app.flush();
    assert.equal(app.updates.length, 0);
    assert.deepEqual(app.notices, []);
  }
});

test('manual profile sync is single-flight and preserves edits made while fetching', async () => {
  const app = setup();
  const button = app.sync();
  const syncing = button.props.onClick();
  await button.props.onClick();
  assert.equal(app.profiles.length, 1);
  assert.equal(app.sync().props.disabled, true);
  app.edit({ education: [], personalInfo: { fullName: 'Typed now' } });
  app.profiles[0].resolve(profile);
  await syncing;
  assert.equal(app.updates.length, 0);
  assert.equal(app.currentResume.personalInfo.fullName, 'Typed now');
  assert.equal(app.sync().props.disabled, false);
  assert.match(app.notices[0], /latest edits were kept/);
});

test('unchanged manual profile sync fills blanks while keeping existing resume sections', async () => {
  const app = setup();
  app.edit({ workExperience: [{ company: 'Existing employer' }] });
  const syncing = app.sync().props.onClick();
  app.profiles[0].resolve(profile);
  await syncing;
  assert.equal(app.currentResume.personalInfo.fullName, 'Saved profile');
  assert.equal(app.currentResume.workExperience[0].company, 'Existing employer');
  assert.equal(app.currentResume.education[0].institution, 'University');
});

test('obsolete resume load failures cannot redirect a newer builder route', async () => {
  const app = setup();
  app.setRoute('resume-b');
  app.edit({ id: 'resume-b' });
  app.loads[1].resolve({ id: 'resume-b' });
  app.loads[0].reject(new Error('Old route failed'));
  await app.flush();
  assert.deepEqual(app.routes, []);
  assert.deepEqual(app.notices, []);
});

test('newly-created navigation data must pass the authenticated saved-resume load', () => {
  const app = setup({ navigationState: { newlyCreatedResumeData: { id: 'resume-a', personalInfo: { fullName: 'Untrusted stale hint' } } } });
  assert.equal(app.loads[0].id, 'resume-a');
  assert.equal(app.updates.length, 0);
  assert.equal(app.currentResume.personalInfo.fullName, '');
});

test('manual save is single-flight and never reapplies its snapshot over newer edits', async () => {
  const app = setup();
  app.edit({ title: 'Saved snapshot' });
  const button = app.save();
  const save = button.props.onClick();
  await button.props.onClick();
  await app.frame();
  assert.equal(app.saves.length, 1);
  app.edit({ title: 'Newer edit' });
  app.saves[0].resolve({ id: 'resume-a', title: 'Saved snapshot' });
  await save;
  assert.equal(app.currentResume.title, 'Newer edit');
  assert.equal(app.updates.length, 0);
  assert.equal(app.save().props.disabled, false);
});

test('account changes before the animation frame prevent old save requests', async () => {
  const app = setup();
  const save = app.save().props.onClick();
  app.setUser({ id: 'account-b' });
  await app.frame();
  await save;
  assert.equal(app.saves.length, 0);
  assert.deepEqual(app.notices, []);
});

test('leaving or switching account during save suppresses downloads and success notices', async () => {
  for (const unmount of [false, true]) {
    const app = setup();
    app.chooseAction('docx');
    const save = app.save().props.onClick();
    await app.frame();
    if (unmount) app.unmount();
    else app.setUser({ id: 'account-b' });
    app.saves[0].resolve({ id: 'resume-a' });
    await save;
    assert.deepEqual(app.downloads, []);
    assert.deepEqual(app.notices, []);
    assert.deepEqual(app.routes, []);
  }
});

test('save plus PDF downloads the acknowledged saved snapshot without a cloud-owner argument', async () => {
  const app = setup();
  app.chooseAction('pdf');
  const save = app.save().props.onClick();
  await app.frame();
  app.saves[0].resolve({ id: 'resume-a' });
  await save;
  assert.equal(app.downloads[0].format, 'pdf');
  assert.equal(app.downloads[0].args.length, 3);
  assert.equal(app.downloads[0].resume.id, 'resume-a');
});

test('first save downloads before navigation and preserves newer draft edits', async () => {
  const app = setup({ id: '' });
  app.chooseAction('docx');
  const save = app.save().props.onClick();
  await app.frame();
  assert.equal(app.creates.length, 1);
  app.edit({ id: 'created-resume', title: 'Newer edit' });
  assert.deepEqual(app.routes, []);
  app.creates[0].resolve({ id: 'created-resume' });
  await save;
  assert.equal(app.currentResume.title, 'Newer edit');
  assert.equal(app.downloads[0].resume.id, 'created-resume');
  assert.equal(app.routes[0].route, '/builder/created-resume');
});

test('mismatched resume routes cannot expose the previous resume editor or save control', () => {
  const app = setup();
  app.setRoute('resume-b');
  assert.equal(app.save(), undefined);
  assert.equal(find(app.render(), (node) => node.type === 'PersonalInfoSection'), undefined);
});

test('version conflicts pause normal saving without hiding the editable draft', async () => {
  const app = setup({ context: { saveConflict: { kind: 'remote' } } });
  assert.match(textContent(app.render()), /Another version was saved/);
  assert.match(textContent(app.render()), /Autosave paused/);
  assert.ok(find(app.render(), (node) => node.type === 'PersonalInfoSection'));
  assert.equal(app.save().props.disabled, true);
  assert.equal(find(app.render(), (node) => node.type === 'input' && node.props.type === 'checkbox').props.disabled, true);
  await app.save().props.onClick();
  await app.frame();
  assert.equal(app.saves.length, 0);
});

test('save-copy is single-flight, creates a distinct resume, and leaves typing intact', async () => {
  const app = setup({ context: { saveConflict: { kind: 'recovery' } } });
  app.edit({ title: 'Local version', revision: 3 });
  const button = app.button('Save my version as a copy');
  const saving = button.props.onClick();
  await button.props.onClick();
  assert.equal(app.creates.length, 1);
  assert.equal(app.creates[0].resume.id, '');
  assert.equal(app.creates[0].resume.revision, undefined);
  assert.equal(app.creates[0].resume.title, 'Local version (recovered copy)');
  app.edit({ title: 'Still typing' });
  app.creates[0].resolve({ id: 'separate-copy' });
  await saving;
  assert.equal(app.currentResume.title, 'Still typing');
  assert.equal(app.routes[0].route, '/builder/separate-copy');
  assert.equal(app.saves.length, 0);
});

test('failed copy stays recoverable and stale copy results cannot navigate another account', async () => {
  for (const switched of [false, true]) {
    const app = setup({ context: { saveConflict: { kind: 'remote' } } });
    const copying = app.button('Save my version as a copy').props.onClick();
    if (switched) {
      app.setUser({ id: 'account-b' });
      app.creates[0].resolve({ id: 'old-account-copy' });
    } else app.creates[0].reject(new Error('Resume limit reached'));
    await copying;
    assert.deepEqual(app.routes, []);
    assert.deepEqual(app.notices, []);
    if (!switched) {
      assert.match(textContent(app.render()), /Resume limit reached/);
      assert.ok(find(app.render(), (node) => node.type === 'PersonalInfoSection'));
      assert.equal(app.button('Save my version as a copy').props.disabled, false);
    }
  }
});

test('reloading the saved resume requires confirmation and does not save the local draft', async () => {
  const app = setup({ context: { saveConflict: { kind: 'remote' } } });
  app.confirm(false);
  await app.button('Reload saved version').props.onClick();
  assert.equal(app.reloads.length, 0);
  app.confirm(true);
  const reloading = app.button('Reload saved version').props.onClick();
  assert.equal(app.reloads.length, 1);
  app.reloads[0].resolve({ id: 'resume-a' });
  await reloading;
  assert.equal(app.saves.length, 0);
  assert.match(app.confirmations[0], /Replace the edits/);
});

test('recovery selection is explicit, confirmation-bound, and scoped to its exact key', () => {
  const drafts = [
    { key: 'writer-one', resume: { title: 'First' }, baseRevision: 1, editedAt: 10 },
    { key: 'writer-two', resume: { title: 'Second' }, baseRevision: null, editedAt: 20 },
  ];
  const app = setup({ context: { recoveryDrafts: drafts } });
  assert.deepEqual(app.recovered, []);
  find(app.render(), (node) => node.props?.id === 'recovery-draft').props.onChange({ target: { value: 'writer-two' } });
  app.confirm(false);
  app.button('Open recovery copy').props.onClick();
  assert.deepEqual(app.recovered, []);
  app.confirm(true);
  app.button('Open recovery copy').props.onClick();
  app.button('Discard recovery copy').props.onClick();
  assert.deepEqual(app.recovered, ['writer-two']);
  assert.deepEqual(app.discarded, ['writer-two']);
  assert.match(app.confirmations.at(-1), /cannot be undone/);
});

test('save failures and unavailable browser backup keep the editor and show actionable warnings', () => {
  const app = setup({ context: { error: 'Network unavailable', draftBackupAvailable: false } });
  assert.ok(find(app.render(), (node) => node.type === 'PersonalInfoSection'));
  assert.match(textContent(app.render()), /Network unavailable/);
  assert.match(textContent(app.render()), /Keep this tab open until you save or export/);
});

test('new resume restoration is delegated to isolated draft storage before profile prefill', () => {
  let restores = 0;
  const app = setup({ id: '', context: { restoreNewResumeDraft: () => { restores++; return true; } } });
  assert.equal(restores, 1);
  assert.equal(app.profiles.length, 0);
});

test('newly copied resumes keep a correct switcher label and refresh the saved list', async () => {
  const app = setup();
  await app.flush();
  app.edit({ id: 'copied-resume', title: 'Designer (recovered copy)' });
  app.setRoute('copied-resume');
  const select = find(app.render(), (node) => node.props?.id === 'resume-switch');
  const option = find(select, (node) => node.type === 'option' && node.props.value === 'copied-resume');
  assert.equal(textContent(option), 'Designer (recovered copy)');
  await app.flush();
  assert.deepEqual(app.listRequests, ['resume-a', 'copied-resume']);
});
