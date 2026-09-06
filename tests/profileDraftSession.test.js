import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { createProfileDraftSession, hasSameProfileVersion } from '../src/utils/profileDraftSession.js';
import { componentHarness } from './helpers/componentHarness.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const profile = (name = 'Candidate', revision = 3) => ({ id: 'profile-a', revision, personal: { fullName: name }, applicationProfile: { workAuthorization: 'private answer' } });
const draft = (profileData = profile(), entryDrafts = {}) => ({ profileData, entryDrafts, activeSection: 'personal', hasUnsavedChanges: true });
const metadata = { profile_id: 'profile-a', revision: 4, updated_at: '2026-09-04T14:00:00Z' };

test('profile draft session snapshots writes and reads and refuses every foreign-owner operation', () => {
  const session = createProfileDraftSession('account-a');
  const original = draft();
  assert.equal(session.write('account-a', original), true);
  original.profileData.personal.fullName = 'Mutated outside';
  assert.equal(session.read('account-a').profileData.personal.fullName, 'Candidate');
  const read = session.read('account-a');
  read.profileData.applicationProfile.workAuthorization = 'Mutated read';
  assert.equal(session.read('account-a').profileData.applicationProfile.workAuthorization, 'private answer');
  assert.equal(session.read('account-b'), null);
  assert.equal(session.write('account-b', draft(profile('Wrong owner'))), false);
  session.acknowledge('account-b', profile(), metadata);
  session.clear('account-b');
  assert.equal(session.read('account-a').profileData.revision, 3);
  assert.equal(createProfileDraftSession(null).write(null, draft()), false);
  session.clear('account-a');
  assert.equal(session.read('account-a'), null);
});

test('acknowledging a fully submitted profile clears its clean draft while preserving no obsolete edits', () => {
  const session = createProfileDraftSession('account-a');
  session.write('account-a', draft());
  session.acknowledge('account-a', profile(), metadata);
  assert.equal(session.read('account-a'), null);
});

test('same-branch acknowledgment advances newer cached typing and unfinished entries without changing their content', () => {
  const session = createProfileDraftSession('account-a');
  const pending = { workExperience: { currentItem: { title: 'Unfinished role' }, editIndex: null, formError: '', pending: true } };
  session.write('account-a', draft(profile('Newer typing'), pending));
  session.acknowledge('account-a', profile(), metadata);
  const result = session.read('account-a');
  assert.equal(result.profileData.personal.fullName, 'Newer typing');
  assert.equal(result.profileData.id, 'profile-a');
  assert.equal(result.profileData.revision, 4);
  assert.equal(result.profileData.updatedAt, metadata.updated_at);
  assert.equal(result.entryDrafts.workExperience.currentItem.title, 'Unfinished role');
  assert.equal(result.hasUnsavedChanges, true);
});

test('an acknowledgment from another profile or earlier editing branch cannot rebase the cached snapshot', () => {
  const session = createProfileDraftSession('account-a');
  session.write('account-a', draft(profile('New branch', 8)));
  session.acknowledge('account-a', profile(), metadata);
  session.acknowledge('account-a', { ...profile('Candidate', 8), id: 'different-profile' }, metadata);
  assert.equal(session.read('account-a').profileData.revision, 8);
  assert.equal(session.read('account-a').profileData.personal.fullName, 'New branch');
});

test('acknowledgment subscriptions are owner scoped, snapshot isolated, branch matched and removable', () => {
  const session = createProfileDraftSession('account-a');
  const received = [];
  let foreignEvents = 0;
  session.subscribe('account-b', () => { foreignEvents += 1; });
  const unsubscribe = session.subscribe('account-a', (event) => {
    received.push(event);
    event.metadata.revision = 999;
    event.submittedProfile.personal.fullName = 'Listener mutation';
  });
  const secondListener = [];
  session.subscribe('account-a', (event) => secondListener.push(event));
  session.write('account-a', draft(profile('Newer typing')));
  session.acknowledge('account-b', profile(), metadata);
  session.acknowledge('account-a', profile('Stale', 2), metadata);
  assert.equal(received.length, 0);
  session.acknowledge('account-a', profile(), metadata);
  assert.equal(received.length, 1);
  assert.equal(foreignEvents, 0);
  assert.equal(secondListener[0].metadata.revision, 4);
  assert.equal(secondListener[0].submittedProfile.personal.fullName, 'Candidate');
  assert.equal(session.read('account-a').profileData.revision, 4);
  assert.equal(session.read('account-a').profileData.personal.fullName, 'Newer typing');
  unsubscribe();
  session.acknowledge('account-a', { ...profile('Newer typing', 4), updatedAt: metadata.updated_at }, { ...metadata, revision: 5 });
  assert.equal(received.length, 1);
  assert.equal(secondListener.length, 2);
});

test('new-profile acknowledgment assigns identity only to the matching new-profile branch', () => {
  const session = createProfileDraftSession('account-a');
  const submitted = { personal: { fullName: 'Submitted' } };
  session.write('account-a', draft({ personal: { fullName: 'Newer new profile' } }));
  session.acknowledge('account-a', submitted, { ...metadata, revision: 1 });
  assert.equal(session.read('account-a').profileData.id, 'profile-a');
  assert.equal(session.read('account-a').profileData.revision, 1);
  assert.equal(session.read('account-a').profileData.personal.fullName, 'Newer new profile');
  assert.equal(hasSameProfileVersion(null, {}), true);
  assert.equal(hasSameProfileVersion({ id: 'profile-a', revision: 1 }, {}), false);
  assert.equal(hasSameProfileVersion(profile('A', 1), profile('B', 2)), false);
});

test('only a newer own receipt from during the pending load can replace its older snapshot with complete accepted content', () => {
  const session = createProfileDraftSession('account-a');
  const started = session.sequence('account-a');
  const submitted = profile('Accepted edit', 3);
  session.acknowledge('account-a', submitted, metadata);
  assert.equal(session.sequence('account-a'), started + 1);
  const reconciled = session.reconcileLoad('account-a', profile('Earlier server text', 3), started);
  assert.equal(reconciled.personal.fullName, 'Accepted edit');
  assert.equal(reconciled.revision, 4);
  assert.equal(reconciled.updatedAt, metadata.updated_at);
  reconciled.personal.fullName = 'External mutation';
  assert.equal(session.reconcileLoad('account-a', profile('Old', 3), started).personal.fullName, 'Accepted edit');
  const afterReceipt = session.sequence('account-a');
  const laterLoad = profile('Server result from later read', 3);
  assert.equal(session.reconcileLoad('account-a', laterLoad, afterReceipt), laterLoad);
  const newerServer = profile('Newer remote edit', 5);
  assert.equal(session.reconcileLoad('account-a', newerServer, started), newerServer);
  const differentProfile = { ...profile('Replacement', 1), id: 'profile-b' };
  assert.equal(session.reconcileLoad('account-a', differentProfile, started), differentProfile);
  assert.equal(session.reconcileLoad('account-b', laterLoad, started), laterLoad);
  session.acknowledge('account-a', profile('Delayed old receipt', 2), { ...metadata, revision: 3 });
  assert.equal(session.sequence('account-a'), afterReceipt);
  assert.equal(session.reconcileLoad('account-a', profile('Old', 3), started).personal.fullName, 'Accepted edit');
});

test('a create receipt can reconcile a pending empty read but not a previously existing profile deleted remotely', () => {
  const session = createProfileDraftSession('account-a');
  const started = session.sequence('account-a');
  session.acknowledge('account-a', { personal: { fullName: 'Newly accepted' } }, { ...metadata, revision: 1 });
  assert.equal(session.reconcileLoad('account-a', null, started).personal.fullName, 'Newly accepted');
  assert.equal(session.reconcileLoad('account-a', null, started).id, 'profile-a');
  const existing = createProfileDraftSession('account-a');
  existing.acknowledge('account-a', profile('Existing'), metadata);
  assert.equal(existing.reconcileLoad('account-a', null, 0), null);
});

test('deactivation erases sensitive cache and receipts and rejects delayed writes, subscriptions and acknowledgments', () => {
  const session = createProfileDraftSession('account-a');
  session.write('account-a', draft());
  session.acknowledge('account-a', profile(), metadata);
  let events = 0;
  session.subscribe('account-a', () => { events += 1; });
  session.deactivate();
  assert.equal(session.read('account-a'), null);
  assert.equal(session.write('account-a', draft()), false);
  session.subscribe('account-a', () => { events += 1; });
  session.acknowledge('account-a', profile('Late'), { ...metadata, revision: 5 });
  const loaded = profile('Actual server');
  assert.equal(session.reconcileLoad('account-a', loaded, 0), loaded);
  session.activate();
  assert.equal(session.read('account-a'), null);
  assert.equal(session.reconcileLoad('account-a', loaded, 0), loaded);
  session.write('account-a', draft());
  session.acknowledge('account-a', profile(), metadata);
  assert.equal(events, 0);
});

test('StrictMode replay activates the provider before child passive acknowledgement subscriptions are recreated', () => {
  let memo;
  let layoutEffect;
  let passiveEffect;
  const jsx = (type, props) => ({ type, props });
  const { exports: { ProfileDraftProvider } } = loadEdgeFunction('src/context/ProfileDraftContext.jsx', {
    globals: { window: { addEventListener() {}, removeEventListener() {} } },
    imports: {
      react: {
        createContext: () => ({ Provider: 'Provider' }),
        useMemo: (create) => memo ||= create(),
        useLayoutEffect: (effect) => { layoutEffect = effect; },
        useEffect: (effect) => { passiveEffect = effect; },
      },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      './AuthContext': { useAuth: () => ({ user: { id: 'account-a' } }) },
      '../utils/profileDraftSession': { createProfileDraftSession },
      'prop-types': { default: PropTypes },
    },
  });
  const session = ProfileDraftProvider({ children: null }).props.value;
  let cleanup = layoutEffect?.() || passiveEffect?.();
  const initialUnsubscribe = session.subscribe('account-a', () => {});
  initialUnsubscribe();
  cleanup?.();
  // React18 installed runtime: layout mount replay completes before passive
  // mounts; passive children run before passive parents. Model that ordering.
  cleanup = layoutEffect?.();
  let acknowledged = 0;
  session.subscribe('account-a', () => { acknowledged += 1; });
  if (passiveEffect) cleanup = passiveEffect();
  session.write('account-a', draft());
  session.acknowledge('account-a', profile(), metadata);
  assert.equal(acknowledged, 1);
  cleanup?.();
});

test('profile draft session never reads or writes persistent browser storage', () => {
  const persistentStorage = {
    getItem() { assert.fail('Profile draft read persistent storage'); },
    setItem() { assert.fail('Profile draft wrote persistent storage'); },
    removeItem() { assert.fail('Profile draft removed persistent storage'); },
  };
  const { exports: { createProfileDraftSession: create } } = loadEdgeFunction('src/utils/profileDraftSession.js', {
    globals: { window: { localStorage: persistentStorage, sessionStorage: persistentStorage }, localStorage: persistentStorage, sessionStorage: persistentStorage },
  });
  const session = create('account-a');
  session.write('account-a', draft());
  assert.equal(session.read('account-a').profileData.applicationProfile.workAuthorization, 'private answer');
  session.acknowledge('account-a', profile(), metadata);
  session.clear('account-a');
  assert.equal(session.read('account-a'), null);
});

test('provider retains drafts across same-account refresh, discards the active session on identity changes, and scopes unload warnings', () => {
  let user = { id: 'account-a' };
  const listeners = new Map();
  const app = componentHarness('src/context/ProfileDraftContext.jsx', {
    exportName: 'ProfileDraftProvider', props: { children: 'Routes' },
    globals: { window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    } },
    imports: {
      './AuthContext': { useAuth: () => ({ user }) },
      '../utils/profileDraftSession': { createProfileDraftSession },
      'prop-types': { default: PropTypes },
    },
  });
  const first = app.render().props.value;
  let warnings = 0;
  const event = { preventDefault: () => { warnings += 1; }, returnValue: undefined };
  listeners.get('beforeunload')(event);
  assert.equal(warnings, 0);
  first.write('account-a', draft());
  listeners.get('beforeunload')(event);
  assert.equal(warnings, 1);
  assert.equal(event.returnValue, '');
  user = { id: 'account-a', refreshedToken: true };
  assert.equal(app.render().props.value, first);
  assert.equal(first.read('account-a').profileData.personal.fullName, 'Candidate');
  user = { id: 'account-b' };
  const second = app.render().props.value;
  assert.notEqual(second, first);
  assert.equal(first.read('account-a'), null);
  assert.equal(first.write('account-a', draft()), false);
  assert.equal(second.read('account-b'), null);
  assert.equal(second.read('account-a'), null);
  listeners.get('beforeunload')(event);
  assert.equal(warnings, 1);
  user = null;
  const anonymous = app.render().props.value;
  assert.equal(anonymous.read('account-a'), null);
  assert.equal(anonymous.write(null, draft()), false);
  app.unmount();
  assert.equal(listeners.size, 0);
});

test('profile draft provider lives outside route remounts but inside the authenticated account boundary', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const ancestorsByName = new Map();
  const walk = (node, ancestors = []) => {
    if (!node || typeof node !== 'object') return;
    const name = node.type === 'JSXElement' ? node.openingElement.name.name : null;
    if (name) ancestorsByName.set(name, ancestors);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue;
      const path = name ? [...ancestors, name] : ancestors;
      if (Array.isArray(value)) value.forEach((entry) => walk(entry, path));
      else if (value && typeof value === 'object') walk(value, path);
    }
  };
  walk(ast);
  assert.ok(ancestorsByName.get('ProfileDraftProvider').includes('AuthProvider'));
  assert.ok(ancestorsByName.get('ProfileDraftProvider').includes('AccountSessionBoundary'));
  assert.ok(!ancestorsByName.get('ProfileDraftProvider').includes('Routes'));
  assert.ok(ancestorsByName.get('Routes').includes('ProfileDraftProvider'));
  assert.ok(!ancestorsByName.get('AuthRecoveryBridge').includes('ProfileDraftProvider'));
});
