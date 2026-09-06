import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';

const handoff = (id = 'handoff-a', ownerId = 'user-a') => ({
  handoffId: id, ownerId, jobKey: 'https://jobs.example/jobs/1', expiresAt: Date.now() + 1_800_000,
  jobSnapshot: { url: 'https://jobs.example/jobs/1', title: 'Engineer', company: 'Cedar', description: 'Captured job A.' },
});
const saved = { id: 'saved-a', revision: 3, title: 'Specific version', personalInfo: { fullName: 'Candidate', summary: 'My actual source.' }, skills: ['C++'] };

function setup({ get = async () => handoff(), load = async () => saved, complete, cancel = async (handoffId) => ({ status: 'cancelled', handoffId }), props: initialProps = {}, search = '?extensionRequest=handoff-a' } = {}) {
  let user = { id: 'user-a' };
  let location = { search };
  const calls = { get: [], load: [], complete: [], cancel: [], import: [], refresh: 0 };
  const fetchUserResumes = async () => { calls.refresh += 1; };
  let props = { canTailor: true, hasDraftContent: false, hasUnfinishedWork: false, onImport: (...args) => { calls.import.push(args); return true; }, ...initialProps };
  const app = componentHarness('src/components/resume/ExtensionResumeHandoff.jsx', {
    props,
    imports: {
      'prop-types': { default: PropTypes },
      'react-router-dom': { useLocation: () => location },
      '../../context/AuthContext': { useAuth: () => ({ user }) },
      '../../context/ResumeContext': { useResume: () => ({ resumes: [saved], fetchUserResumes }) },
      '../ui/Button': { default: 'Button' },
      '../../utils/resumeExportText': { buildResumeTextLines },
      '../../services/browserAgentService': {
        getBrowserAgentResumeHandoff: async (id) => { calls.get.push(id); return get(id); },
        loadBrowserAgentSavedResume: async (value) => { calls.load.push(value); return load(value); },
        completeBrowserAgentResumeHandoff: async (value) => { calls.complete.push(value); return complete ? complete(value) : { status: 'ready', handoffId: value.handoffId, resume: { id: value.resumeId, revision: value.expectedRevision } }; },
        cancelBrowserAgentResumeHandoff: async (id) => { calls.cancel.push(id); return cancel(id); },
      },
    },
  });
  app.render();
  const button = (label) => find(app.render(), (node) => node.type === 'Button' && textContent(node) === label);
  const choose = () => find(app.render(), (node) => node.props?.id === 'extension-saved-resume').props.onChange({ target: { value: saved.id } });
  const preview = async () => { choose(); await button('Preview saved version').props.onClick(); app.render(); };
  return { ...app, calls, button, choose, preview,
    setProps: (next) => { props = { ...props, ...next }; app.setProps(props); },
    setUser: (id) => { user = id ? { id } : null; app.render(); },
    setHandoff: (id) => { location = { search: `?extensionRequest=${id}` }; app.render(); },
  };
}

test('ordinary generator without a handoff makes no extension or library calls', async () => {
  const app = setup({ search: '' });
  assert.equal(await app.flush(), null);
  assert.equal(app.calls.get.length, 0);
  assert.equal(app.calls.refresh, 0);
});

test('opening a handoff only retrieves its frozen job and saved list, without preview, generation or selection', async () => {
  const app = setup();
  await app.flush();
  assert.deepEqual(app.calls.get, ['handoff-a']);
  assert.equal(app.calls.refresh, 1);
  assert.equal(app.calls.load.length + app.calls.complete.length + app.calls.import.length, 0);
  assert.match(textContent(app.render()), /Captured job A/);
  assert.equal(app.button('Preview saved version').props.disabled, true);
  assert.equal(app.button('Use this saved version for this job'), undefined);
});

test('saved path previews the exact listed revision, then sends only IDs after explicit confirmation', async () => {
  const app = setup();
  await app.flush();
  await app.preview();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.load)), [{ resumeId: saved.id, expectedRevision: 3, expectedUserId: 'user-a' }]);
  assert.equal(textContent(find(app.render(), (node) => node.type === 'pre')), buildResumeTextLines(saved).join('\n'));
  assert.match(textContent(app.render()), /site may upload it before final submission/);
  assert.equal(app.calls.complete.length, 0);
  await app.button('Use this saved version for this job').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.complete)), [{ handoffId: 'handoff-a', resumeId: saved.id, expectedRevision: 3 }]);
  assert.match(textContent(app.render()), /It has not been attached/);
  assert.equal(app.calls.import.length, 0);
});

test('wrong owner, wrong handoff, unsafe URL, missing expiry and expired handoffs fail before library disclosure', async () => {
  for (const value of [handoff('handoff-a', 'user-b'), handoff('other'), { ...handoff(), jobSnapshot: { url: 'javascript:alert(1)' } }, { ...handoff(), expiresAt: undefined }, { ...handoff(), expiresAt: 1 }]) {
    const app = setup({ get: async () => value });
    await app.flush();
    assert.ok(find(app.render(), (node) => node.props?.role === 'alert'));
    assert.equal(app.calls.refresh, 0);
    assert.equal(app.button('Preview saved version'), undefined);
  }
});

test('account switch before retrieval completes cannot display the old job or load its library', async () => {
  const pending = deferred();
  const app = setup({ get: () => pending.promise });
  app.setUser('user-b');
  pending.resolve(handoff());
  await app.flush();
  assert.doesNotMatch(textContent(app.render()), /Captured job A/);
  assert.equal(app.calls.refresh, 0);
});

test('new handoff invalidates old retrieval and cannot substitute the recent job', async () => {
  const pending = deferred();
  const app = setup({ get: (id) => id === 'handoff-a' ? pending.promise : Promise.resolve(handoff('handoff-b')) });
  app.setHandoff('handoff-b');
  await app.flush();
  pending.resolve({ ...handoff(), jobSnapshot: { ...handoff().jobSnapshot, title: 'Stale job' } });
  await app.flush();
  assert.doesNotMatch(textContent(app.render()), /Stale job/);
  assert.deepEqual(app.calls.get, ['handoff-a', 'handoff-b']);
});

test('saved preview load fails closed on a changed ID or revision and does not enable completion', async () => {
  for (const value of [{ ...saved, revision: 4 }, { ...saved, id: 'different' }]) {
    const app = setup({ load: async () => value });
    await app.flush(); await app.preview();
    assert.match(textContent(app.render()), /saved version changed/);
    assert.equal(app.button('Use this saved version for this job'), undefined);
    assert.equal(app.calls.complete.length, 0);
  }
});

test('delayed preview after account change cannot reveal or select the old resume', async () => {
  const pending = deferred();
  const app = setup({ load: () => pending.promise });
  await app.flush(); app.choose();
  const previewing = app.button('Preview saved version').props.onClick();
  app.setUser('user-b');
  pending.resolve(saved); await previewing; await app.flush();
  assert.doesNotMatch(textContent(app.render()), /My actual source/);
  assert.equal(app.button('Use this saved version for this job'), undefined);
});

test('rapid duplicate selection is single-flight and a failed response preserves the exact preview for retry', async () => {
  const pending = deferred();
  let count = 0;
  const app = setup({ complete: () => ++count === 1 ? pending.promise : { status: 'ready', handoffId: 'handoff-a', resume: saved } });
  await app.flush(); await app.preview();
  const click = app.button('Use this saved version for this job').props.onClick;
  const selecting = click(); await click();
  assert.equal(app.calls.complete.length, 1);
  pending.reject(new Error('Session storage unavailable.')); await selecting;
  assert.match(textContent(app.render()), /Session storage unavailable/);
  assert.match(textContent(app.render()), /My actual source/);
  await app.button('Use this saved version for this job').props.onClick();
  assert.equal(app.calls.complete.length, 2);
  assert.match(textContent(app.render()), /It has not been attached/);
});

test('wrong completion acknowledgements never report readiness', async () => {
  for (const result of [{ status: 'pending' }, { status: 'ready', handoffId: 'other', resume: saved }, { status: 'ready', handoffId: 'handoff-a', resume: { ...saved, revision: 9 } }]) {
    const app = setup({ complete: async () => result });
    await app.flush(); await app.preview();
    await app.button('Use this saved version for this job').props.onClick();
    assert.match(textContent(app.render()), /did not confirm/);
    assert.doesNotMatch(textContent(app.render()), /Selected:/);
  }
});

test('completion after logout cannot announce old-account readiness', async () => {
  const pending = deferred();
  const app = setup({ complete: () => pending.promise });
  await app.flush(); await app.preview();
  const selecting = app.button('Use this saved version for this job').props.onClick();
  app.setUser(null);
  pending.resolve({ status: 'ready', handoffId: 'handoff-a', resume: saved }); await selecting;
  assert.doesNotMatch(textContent(app.render()), /Selected:|My actual source/);
});

test('an existing form needs explicit replacement; declining preserves it and performs no import', async () => {
  const app = setup({ props: { hasDraftContent: true } });
  await app.flush();
  app.button('Tailor a new resume for this job').props.onClick();
  assert.equal(app.calls.import.length, 0);
  app.button('Keep current form').props.onClick();
  assert.equal(app.calls.import.length, 0);
  app.button('Tailor a new resume for this job').props.onClick();
  app.button('Replace job details and continue').props.onClick();
  assert.equal(app.calls.import.length, 1);
  assert.equal(app.calls.import[0][0].description, 'Captured job A.');
  assert.equal(app.calls.import[0][1], 'handoff-a');
  assert.equal(app.calls.complete.length, 0);
});

test('unfinished generation or review cannot be replaced but saved-resume selection stays available', async () => {
  const app = setup({ props: { hasUnfinishedWork: true } });
  await app.flush();
  const button = app.button('Tailor a new resume for this job');
  assert.equal(button.props.disabled, true);
  button.props.onClick();
  assert.equal(app.calls.import.length, 0);
  await app.preview();
  assert.equal(app.button('Use this saved version for this job').props.disabled, false);
});

test('a newly saved receipt enables only preview, not automatic selection', async () => {
  const app = setup({ props: { savedResume: saved } });
  await app.flush();
  assert.equal(app.calls.complete.length, 0);
  await app.button('Preview newly saved version').props.onClick();
  assert.equal(app.calls.load.length, 1);
  assert.equal(app.calls.complete.length, 0);
});

test('cancel is explicit, never imports or selects a resume, and preserves generator work', async () => {
  const app = setup({ props: { hasUnfinishedWork: true } });
  await app.flush();
  await app.button('Cancel job selection').props.onClick();
  assert.deepEqual(app.calls.cancel, ['handoff-a']);
  assert.match(textContent(app.render()), /unfinished tailoring work have not been changed/);
  assert.equal(app.calls.import.length + app.calls.complete.length, 0);
});

test('unmount invalidates in-flight preview state and stale action callbacks', async () => {
  const pending = deferred();
  const app = setup({ load: () => pending.promise });
  await app.flush(); app.choose();
  const previewing = app.button('Preview saved version').props.onClick();
  app.unmount(); pending.resolve(saved); await previewing;
  assert.equal(app.calls.complete.length, 0);
  assert.doesNotMatch(textContent(app.render()), /My actual source/);
});

test('saved selection stays available without Premium while AI import is disabled', async () => {
  const app = setup({ props: { canTailor: false } });
  await app.flush();
  const tailor = app.button('Tailor a new resume for this job');
  assert.equal(tailor.props.disabled, true);
  tailor.props.onClick();
  assert.equal(app.calls.import.length, 0);
  await app.preview();
  await app.button('Use this saved version for this job').props.onClick();
  assert.equal(app.calls.complete.length, 1);
});

test('stale completion callback after unmount cannot initiate selection', async () => {
  const app = setup();
  await app.flush(); await app.preview();
  const oldClick = app.button('Use this saved version for this job').props.onClick;
  app.unmount(); await oldClick();
  assert.equal(app.calls.complete.length, 0);
});

test('stale completion from an earlier preview cannot select after choosing another view', async () => {
  const app = setup();
  await app.flush(); await app.preview();
  const oldClick = app.button('Use this saved version for this job').props.onClick;
  app.button('Refresh list').props.onClick(); app.render();
  await oldClick();
  assert.equal(app.calls.complete.length, 0);
});

test('unacknowledged cancellation keeps the current chooser and never claims removal', async () => {
  const app = setup({ cancel: async () => ({ status: 'pending' }) });
  await app.flush(); await app.button('Cancel job selection').props.onClick();
  assert.match(textContent(app.render()), /did not confirm cancellation/);
  assert.doesNotMatch(textContent(app.render()), /Selection cancelled/);
  assert.ok(app.button('Preview saved version'));
});

test('an acknowledged selection can still be explicitly cancelled before Autofill', async () => {
  const app = setup();
  await app.flush(); await app.preview();
  await app.button('Use this saved version for this job').props.onClick();
  await app.button('Cancel job selection').props.onClick();
  assert.deepEqual(app.calls.cancel, ['handoff-a']);
  assert.match(textContent(app.render()), /Selection cancelled/);
});
