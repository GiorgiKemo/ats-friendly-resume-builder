import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find, textContent, visit } from './helpers/componentHarness.js';
import { createProfileDraftSession, hasSameProfileVersion } from '../src/utils/profileDraftSession.js';

const sections = ['PersonalDetails', 'WorkExperience', 'Education', 'Skills', 'Certifications', 'Projects', 'Languages', 'Interests', 'References', 'ApplicationProfile'];
const profile = (fullName = 'Initial', revision = 1) => ({
  id: 'profile-a', revision, updatedAt: '2026-09-04T12:00:00Z', personal: { fullName },
  workExperience: [], education: [], skills: [], certifications: [], projects: [], languages: [], interests: [], references: [], applicationProfile: {},
});
const acknowledgement = (revision = 2) => ({ profile_id: 'profile-a', revision, updated_at: '2026-09-04T13:00:00Z' });

function setup({ drafts: suppliedDrafts } = {}) {
  let user = { id: 'user-a' };
  let drafts = suppliedDrafts || createProfileDraftSession(user.id);
  const loads = [];
  const saves = [];
  const notices = [];
  const toast = (message) => notices.push(message);
  toast.error = toast.custom = toast;
  const navigate = () => {};
  const app = componentHarness('src/pages/UserProfile.jsx', {
    imports: {
      '../context/AuthContext': { useAuth: () => ({ user }) },
      '../context/ThemeContext': { useTheme: () => ({ isDark: false }) },
      '../context/ProfileDraftContext': { useProfileDraft: () => drafts },
      '../utils/profileDraftSession': { hasSameProfileVersion },
      'react-router-dom': { useNavigate: () => navigate },
      'react-hot-toast': { default: toast },
      '../components/ui/Button': { default: 'Button' },
      ...Object.fromEntries(sections.map((section) => [`../components/profile/${section}Section`, { default: section }])),
      '../services/userProfileService': {
        getUserProfile: (userId) => { const request = deferred(); loads.push({ ...request, userId }); return request.promise; },
        saveUserProfile: (profile, userId) => { const request = deferred(); saves.push({ ...request, profile, userId }); return request.promise; },
      },
    },
  });
  const saveButton = () => find(app.render(), (node) => node.type === 'Button' && /Save profile|Saving/.test(textContent(node)));
  const personal = () => find(app.render(), (node) => node.type === 'PersonalDetails');
  app.render();
  const select = (section) => find(app.render(), (node) => node.type === 'select' && node.props.id === 'profile-section').props.onChange({ target: { value: section } });
  const section = (name) => find(app.render(), (node) => node.type === name);
  return { ...app, loads, saves, notices, saveButton, personal, select, section,
    get drafts() { return drafts; },
    setUser: (next) => { user = next; drafts = createProfileDraftSession(next?.id); app.render(); } };
}

test('profile cannot save empty initial state while loading or after a failed load; retry works', async () => {
  const app = setup();
  assert.equal(app.saveButton().props.disabled, true);
  await app.saveButton().props.onClick();
  assert.equal(app.saves.length, 0);
  app.loads[0].reject(new Error('Offline'));
  await app.flush();
  assert.equal(app.saveButton().props.disabled, true);
  assert.equal(app.personal(), undefined);
  find(app.render(), (node) => textContent(node) === 'Try again' && node.type === 'Button').props.onClick();
  app.render();
  app.loads[1].resolve(null);
  await app.flush();
  assert.equal(app.saveButton().props.disabled, false);
  assert.equal(app.personal().props.data.fullName, '');
});

test('slow profile saves preserve newer edits and reject duplicate clicks synchronously', async () => {
  const app = setup();
  app.loads[0].resolve(profile());
  await app.flush();
  app.personal().props.onChange({ fullName: 'First edit' });
  const button = app.saveButton();
  const first = button.props.onClick();
  await button.props.onClick();
  assert.equal(app.saves.length, 1);
  assert.equal(app.saves[0].userId, 'user-a');
  app.personal().props.onChange({ fullName: 'Newer edit' });
  app.saves[0].resolve(acknowledgement());
  await first;
  assert.equal(app.personal().props.data.fullName, 'Newer edit');
  assert.match(textContent(app.render()), /unsaved profile changes/);
  assert.ok(app.notices.some((notice) => typeof notice === 'string' && notice.includes('latest edits')));
});

test('failed profile save preserves changes and allows retry', async () => {
  const app = setup();
  app.loads[0].resolve(null);
  await app.flush();
  app.personal().props.onChange({ fullName: 'Keep me' });
  const save = app.saveButton().props.onClick();
  app.saves[0].reject(new Error('Offline'));
  await save;
  assert.equal(app.personal().props.data.fullName, 'Keep me');
  assert.equal(app.saveButton().props.disabled, false);
  assert.match(textContent(app.render()), /unsaved profile changes/);
});

test('account switches discard stale loads, clear no-profile accounts, and ignore old save completion', async () => {
  const app = setup();
  app.setUser({ id: 'user-b' });
  app.loads[0].resolve(profile('Private A'));
  await app.flush();
  assert.equal(app.personal(), undefined);
  app.loads[1].resolve(profile('B'));
  await app.flush();
  const save = app.saveButton().props.onClick();
  app.setUser({ id: 'user-c' });
  app.loads[2].resolve(null);
  app.saves[0].resolve(acknowledgement());
  await save;
  await app.flush();
  assert.equal(app.personal().props.data.fullName, '');
  assert.equal(app.notices.length, 0);
});

test('existing source editors are reachable in profile navigation', async () => {
  const app = setup();
  app.loads[0].resolve(null);
  await app.flush();
  const options = visit(app.render(), (node) => node.type === 'option').map((node) => node.props.value);
  for (const section of ['workExperience', 'skills', 'projects']) assert.ok(options.includes(section));
});

test('route unmount and remount restore current-account profile and unfinished entry drafts without committing them', async () => {
  const first = setup();
  first.loads[0].resolve(profile());
  await first.flush();
  first.personal().props.onChange({ fullName: 'Unsaved career details' });
  first.select('workExperience');
  first.section('WorkExperience').props.onDraftChange({ currentItem: { title: 'Unfinished role' }, editIndex: null, formError: '', pending: true });
  first.unmount();
  const next = setup({ drafts: first.drafts });
  next.loads[0].resolve(profile());
  await next.flush();
  assert.equal(next.section('WorkExperience').props.draft.currentItem.title, 'Unfinished role');
  assert.equal(next.section('WorkExperience').props.data?.length || 0, 0);
  assert.match(textContent(next.render()), /Finish these entries before saving/);
  await next.saveButton().props.onClick();
  assert.equal(next.saves.length, 0);
  assert.match(textContent(next.render()), /Finish or discard/);
  next.select('personal');
  assert.equal(next.personal().props.data.fullName, 'Unsaved career details');
});

test('cached profile content remains visible but cannot overwrite a newer server revision on route return', async () => {
  const drafts = createProfileDraftSession('user-a');
  drafts.write('user-a', { profileData: profile('Local version', 2), entryDrafts: {}, activeSection: 'personal', hasUnsavedChanges: true });
  const app = setup({ drafts });
  app.loads[0].resolve(profile('Remote version', 5));
  await app.flush();
  assert.equal(app.personal().props.data.fullName, 'Local version');
  assert.ok(find(app.render(), (node) => node.props?.['aria-label'] === 'Profile save conflict'));
  assert.equal(app.saveButton().props.disabled, true);
  await app.saveButton().props.onClick();
  assert.equal(app.saves.length, 0);
  assert.equal(app.drafts.read('user-a').profileData.revision, 2);
});

test('save acknowledgments advance metadata without losing newer typing and the following save uses that revision', async () => {
  const app = setup();
  app.loads[0].resolve(profile());
  await app.flush();
  app.personal().props.onChange({ fullName: 'Submitted' });
  const first = app.saveButton().props.onClick();
  app.personal().props.onChange({ fullName: 'Later typing' });
  app.saves[0].resolve(acknowledgement(2));
  await first;
  assert.equal(app.personal().props.data.fullName, 'Later typing');
  assert.equal(app.drafts.read('user-a').profileData.revision, 2);
  const second = app.saveButton().props.onClick();
  assert.equal(app.saves[1].profile.revision, 2);
  assert.equal(app.saves[1].profile.personal.fullName, 'Later typing');
  app.saves[1].resolve(acknowledgement(3));
  await second;
  assert.equal(app.drafts.read('user-a'), null);
  assert.doesNotMatch(textContent(app.render()), /unsaved profile changes/);
});

test('acknowledgment after route unmount clears a fully saved cache without stale success notifications', async () => {
  const app = setup();
  app.loads[0].resolve(profile());
  await app.flush();
  app.personal().props.onChange({ fullName: 'Submitted before navigation' });
  const request = app.saveButton().props.onClick();
  app.unmount();
  app.saves[0].resolve(acknowledgement());
  await request;
  assert.equal(app.drafts.read('user-a'), null);
  assert.equal(app.notices.length, 0);
});

test('acknowledgment after route unmount advances a newer cached draft which restores on the next visit', async () => {
  const app = setup();
  app.loads[0].resolve(profile());
  await app.flush();
  app.personal().props.onChange({ fullName: 'Submitted' });
  const request = app.saveButton().props.onClick();
  app.personal().props.onChange({ fullName: 'Typing before leaving' });
  app.unmount();
  app.saves[0].resolve(acknowledgement());
  await request;
  const next = setup({ drafts: app.drafts });
  next.loads[0].resolve(profile('Submitted', 2));
  await next.flush();
  assert.equal(next.personal().props.data.fullName, 'Typing before leaving');
  assert.equal(next.drafts.read('user-a').profileData.revision, 2);
  assert.equal(find(next.render(), (node) => node.props?.['aria-label'] === 'Profile save conflict'), undefined);
});

test('an entry begun during a profile save remains unfinished and blocks the next save until committed or discarded', async () => {
  const app = setup();
  app.loads[0].resolve(profile());
  await app.flush();
  const request = app.saveButton().props.onClick();
  app.select('projects');
  app.section('Projects').props.onDraftChange({ currentItem: { title: 'Pending project' }, editIndex: null, formError: '', pending: true });
  app.saves[0].resolve(acknowledgement());
  await request;
  assert.equal(app.section('Projects').props.draft.currentItem.title, 'Pending project');
  assert.equal(app.drafts.read('user-a').profileData.revision, 2);
  await app.saveButton().props.onClick();
  assert.equal(app.saves.length, 1);
  app.section('Projects').props.onDraftChange(null);
  const second = app.saveButton().props.onClick();
  assert.equal(app.saves[1].profile.revision, 2);
  app.saves[1].resolve(acknowledgement(3));
  await second;
});

test('a save acknowledgment retains the section selected during the request when its draft is restored after navigation', async () => {
  const first = setup();
  first.loads[0].resolve(profile());
  await first.flush();
  first.personal().props.onChange({ fullName: 'Submitted personal details' });
  const request = first.saveButton().props.onClick();
  first.select('workExperience');
  first.section('WorkExperience').props.onDraftChange({ currentItem: { title: 'Draft begun during save' }, editIndex: null, formError: '', pending: true });
  first.saves[0].resolve(acknowledgement());
  await request;
  assert.equal(first.drafts.read('user-a').activeSection, 'workExperience');
  first.unmount();
  const next = setup({ drafts: first.drafts });
  next.loads[0].resolve(profile('Submitted personal details', 2));
  await next.flush();
  assert.equal(next.section('WorkExperience').props.draft.currentItem.title, 'Draft begun during save');
});

const openConflict = async () => {
  const drafts = createProfileDraftSession('user-a');
  drafts.write('user-a', { profileData: profile('Keep local edits', 1), entryDrafts: {}, activeSection: 'personal', hasUnsavedChanges: true });
  const app = setup({ drafts });
  app.loads[0].resolve(profile('Remote version', 4));
  await app.flush();
  find(app.render(), (node) => node.type === 'Button' && textContent(node) === 'Load saved profile').props.onClick();
  return app;
};
const replaceButton = (app) => find(app.render(), (node) => node.type === 'Button' && textContent(node) === 'Replace local edits');

test('failed conflict reload preserves local content, pending confirmation and its original version', async () => {
  const app = await openConflict();
  const request = replaceButton(app).props.onClick();
  app.loads[1].reject(new Error('Network unavailable'));
  await request;
  assert.equal(app.personal().props.data.fullName, 'Keep local edits');
  assert.equal(app.drafts.read('user-a').profileData.revision, 1);
  assert.ok(replaceButton(app));
  assert.equal(app.saveButton().props.disabled, true);
  assert.match(textContent(app.render()), /Your edits were kept/);
});

test('typing during conflict reload prevents replacement and preserves the draft until an explicit retry succeeds', async () => {
  const app = await openConflict();
  const request = replaceButton(app).props.onClick();
  app.personal().props.onChange({ fullName: 'Typed during reload' });
  app.loads[1].resolve(profile('Remote version', 5));
  await request;
  assert.equal(app.personal().props.data.fullName, 'Typed during reload');
  assert.equal(app.drafts.read('user-a').profileData.revision, 1);
  assert.match(textContent(app.render()), /while it was loading/);
  const retry = replaceButton(app).props.onClick();
  app.loads[2].resolve(profile('Explicitly accepted remote', 6));
  await retry;
  assert.equal(app.personal().props.data.fullName, 'Explicitly accepted remote');
  assert.equal(app.drafts.read('user-a'), null);
  assert.equal(app.saveButton().props.disabled, false);
});

test('callbacks captured by an earlier account cannot edit or save the newly loaded account', async () => {
  const app = setup();
  app.loads[0].resolve(profile('Private A'));
  await app.flush();
  const staleEdit = app.personal().props.onChange;
  const staleSave = app.saveButton().props.onClick;
  app.setUser({ id: 'user-b' });
  app.loads[1].resolve(profile('Account B'));
  await app.flush();
  staleEdit({ fullName: 'Stale A callback' });
  assert.equal(app.personal().props.data.fullName, 'Account B');
  await staleSave();
  assert.equal(app.saves.length, 0);
  assert.equal(app.saveButton().props.disabled, false);
});

test('a save completing after navigation advances the currently remounted editor branch without reverting newer typing', async () => {
  const first = setup();
  first.loads[0].resolve(profile());
  await first.flush();
  first.personal().props.onChange({ fullName: 'Submitted on previous page' });
  const request = first.saveButton().props.onClick();
  first.unmount();
  const next = setup({ drafts: first.drafts });
  next.loads[0].resolve(profile());
  await next.flush();
  next.personal().props.onChange({ fullName: 'Typed after returning' });
  first.saves[0].resolve(acknowledgement());
  await request;
  assert.equal(next.drafts.read('user-a').profileData.revision, 2);
  next.personal().props.onChange({ fullName: 'Typed after previous save completed' });
  const second = next.saveButton().props.onClick();
  assert.equal(next.saves[0].profile.revision, 2);
  next.saves[0].resolve(acknowledgement(3));
  await second;
  assert.equal(next.personal().props.data.fullName, 'Typed after previous save completed');
});

test('a same-session save acknowledged while the remounted route is loading replaces the stale load snapshot with the accepted content', async () => {
  const first = setup();
  first.loads[0].resolve(profile('Earlier server content'));
  await first.flush();
  first.personal().props.onChange({ fullName: 'Accepted submitted content' });
  const request = first.saveButton().props.onClick();
  first.unmount();
  const next = setup({ drafts: first.drafts });
  first.saves[0].resolve(acknowledgement(2));
  await request;
  next.loads[0].resolve(profile('Earlier server content', 1));
  await next.flush();
  assert.equal(next.personal().props.data.fullName, 'Accepted submitted content');
  assert.doesNotMatch(textContent(next.render()), /unsaved profile changes/);
  const save = next.saveButton().props.onClick();
  assert.equal(next.saves[0].profile.revision, 2);
  assert.equal(next.saves[0].profile.personal.fullName, 'Accepted submitted content');
  next.saves[0].resolve(acknowledgement(3));
  await save;
});

test('a newly created profile acknowledged during a stale empty load keeps its assigned identity on route return', async () => {
  const first = setup();
  first.loads[0].resolve(null);
  await first.flush();
  first.personal().props.onChange({ fullName: 'Newly created profile' });
  const request = first.saveButton().props.onClick();
  first.unmount();
  const next = setup({ drafts: first.drafts });
  first.saves[0].resolve(acknowledgement(1));
  await request;
  next.loads[0].resolve(null);
  await next.flush();
  assert.equal(next.personal().props.data.fullName, 'Newly created profile');
  const save = next.saveButton().props.onClick();
  assert.equal(next.saves[0].profile.id, 'profile-a');
  assert.equal(next.saves[0].profile.revision, 1);
  next.saves[0].resolve(acknowledgement(2));
  await save;
});
