import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';

const preferences = { id: 'prefs-a', is_active: true, sender_name: 'Account A', job_titles: ['Engineer'], default_resume_id: 'resume-a' };
const resume = { id: 'resume-a', title: 'Fixture Resume', personalInfo: { fullName: 'Account A', email: 'a@example.test', jobTitle: 'Engineer' }, skills: ['JavaScript'] };

function setup({ prefs = preferences, resumes = [resume], services = {}, bridge = {}, state = { installed: true, queue: [], isRunning: false } } = {}) {
  let user = { id: 'account-a' };
  let jobs = [{ id: 'job-a', title: 'Engineer', company: 'Fixture', status: 'queued', job_url: 'https://example.test/job' }];
  const notices = [];
  const calls = [];
  const timers = [];
  const location = { hash: '#/auto-apply', pathname: '/', href: 'https://resumeats.cv/#/auto-apply' };
  const fetchUserResumes = async () => {};
  const getResumeById = async () => resume;
  const service = {
    getJobPreferences: async (account) => { calls.push(['load', account]); return { data: prefs, error: null }; },
    getAutoApplyStats: async () => ({ data: {} }),
    getAutoApplyJobs: async () => ({ data: jobs }),
    getAutoApplyRuns: async () => ({ data: [] }),
    getGmailConnection: async () => ({ data: null }),
    saveJobPreferences: async (form, account) => { calls.push(['save', form, account]); return { data: form, error: null }; },
    toggleAutoApply: async (...args) => { calls.push(['toggle', ...args]); return { error: null }; },
    triggerAutoApplyRun: async (...args) => { calls.push(['run', ...args]); return { error: null }; },
    connectGmail: async (...args) => { calls.push(['gmail', ...args]); return { data: { url: 'https://accounts.example.test/oauth' } }; },
    disconnectGmail: async () => ({ error: null }),
    scanGmailReplies: async () => ({ data: { total_classified: 0 } }),
    createAutoApplyJob: async (...args) => { calls.push(['create', ...args]); return { data: jobs[0] }; },
    updateAutoApplyJob: async (id, updates, account) => {
      calls.push(['reconcile', id, updates, account]);
      jobs = jobs.map((job) => job.id === id ? { ...job, ...updates } : job);
      return { data: jobs[0], error: null };
    },
    assertAutoApplyAccount: async (account) => {
      account.signal.throwIfAborted();
      if (user?.id !== account.expectedUserId) throw new Error('Account changed');
      return { user, session: { user } };
    },
    ...services,
  };
  const app = componentHarness('src/pages/AutoApply.jsx', {
    imports: {
      '../context/AuthContext': { useAuth: () => ({ user }) },
      '../context/ResumeContext': { useResume: () => ({ resumes, fetchUserResumes, getResumeById }) },
      '../components/ui': { Button: 'Button', Pagination: 'Pagination' },
      'framer-motion': { motion: { div: 'motion.div' } },
      '../components/ui/AnimatedElement': { default: 'AnimatedElement' },
      '../components/ui/StaggeredContainer': { default: 'StaggeredContainer' },
      '../components/ui/StaggeredItem': { default: 'StaggeredItem' },
      '../components/autoApply/BrowserAgentControlCard': { default: 'BrowserAgentControlCard' },
      '../utils/animationVariants': {},
      'react-hot-toast': { default: { success: (message) => notices.push(['success', message]), error: (message) => notices.push(['error', message]) } },
      'date-fns': { format: () => 'Today' },
      '../services/userProfileService': { getUserProfile: async () => ({ personal: { fullName: 'Account A' } }) },
      '../services/savedApplicationAnswers': { saveApplicationAnswers: async () => ({ personal: { fullName: 'Account A' }, applicationProfile: { reusableAnswers: [] } }) },
      '../services/autoApplyService': service,
      '../services/browserAgentService': {
        getBrowserAgentState: async () => state,
        pingBrowserAgent: async () => ({ installed: true, campaignSupported: true }),
        getSupportedBrowserAgentJobs: (rows) => rows,
        getBrowserAgentReadiness: () => ({ ready: true }),
        buildBrowserAgentProfile: async () => ({ candidate: { userId: user.id } }),
        syncBrowserAgentProfile: async (...args) => calls.push(['profile', ...args]),
        clearBrowserAgentQueue: async () => calls.push(['clear']),
        queueBrowserAgentJobs: async (...args) => calls.push(['queue', ...args]),
        buildBrowserAgentQueue: (rows) => rows,
        startBrowserAgentRun: async () => calls.push(['start']),
        startBrowserAgentCampaign: async (...args) => calls.push(['start', ...args]),
        parseDirectAtsJobUrl: () => null,
        ...bridge,
      },
    },
    globals: { window: {
      location, history: { replaceState() {} }, confirm: () => true,
      addEventListener() {}, removeEventListener() {},
      setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
      setInterval: () => 1, clearInterval() {},
    } },
  });
  app.render();
  const button = (label) => find(app.render(), (node) => ['Button', 'button'].includes(node.type) && textContent(node).trim() === label);
  const field = (id) => find(app.render(), (node) => node.props?.id === id);
  const card = () => find(app.render(), (node) => node.type === 'BrowserAgentControlCard');
  return { ...app, calls, notices, timers, location, button, field, card, setUser: (next) => { user = next; app.render(); } };
}

test('AutoApply returns actual extension state and reconciles completed queue jobs once without reload loops', async () => {
  const state = { installed: true, queue: [{ id: 'job-a', status: 'completed' }], isRunning: false };
  const app = setup({ state });
  await app.flush();
  await app.flush();
  const writes = app.calls.filter(([name]) => name === 'reconcile');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][2].status, 'applied');
  assert.equal(writes[0][3].expectedUserId, 'account-a');
  assert.equal(await app.card().props.onRefresh(), state);
  assert.equal(app.calls.filter(([name]) => name === 'load').length, 2);
});

test('AutoApply load failures stay out of the first-time setup wizard and expose retry', async () => {
  const app = setup({ services: {
    getJobPreferences: async () => ({ data: null, error: new Error('offline') }),
  } });
  await app.flush();
  assert.match(textContent(app.render()), /temporarily unavailable/);
  assert.equal(app.button('Continue'), undefined);
  assert.ok(app.button('Try again'));
});

test('malformed saved Auto-Apply and resume collections fail closed without breaking settings', async () => {
  const app = setup({
    prefs: {
      ...preferences,
      job_titles: { invalid: true },
      skills: null,
      locations: ['  Remote  ', { invalid: true }],
      industries: 'technology',
      excluded_companies: { invalid: true },
      remote_preference: { invalid: true },
      daily_limit: 'not-a-number',
      sender_name: { invalid: true },
    },
    resumes: [{ id: 'resume-a', title: { invalid: true }, personalInfo: { fullName: { invalid: true }, jobTitle: ['bad'], location: null }, skills: { invalid: true } }],
  });
  await app.flush();
  app.button('Settings').props.onClick();
  assert.doesNotThrow(() => app.render());
  assert.equal(app.field('auto-apply-settings-remote-preference').props.value, 'any');
  assert.equal(app.field('auto-apply-settings-daily-limit').props.value, 10);
  assert.match(textContent(app.render()), /Untitled Resume/);
});

test('AutoApply settings expose and persist every backend matching control', async () => {
  const app = setup({
    prefs: {
      ...preferences,
      remote_preference: 'hybrid',
      skills: ['React'],
      experience_level: 'senior',
      salary_min: 90000,
      salary_max: 150000,
      industries: ['SaaS'],
      excluded_companies: ['Acme'],
      speed: 'conservative',
      daily_limit: 25,
    },
  });
  await app.flush();
  app.button('Settings').props.onClick();

  assert.equal(app.field('auto-apply-settings-experience-level').props.value, 'senior');
  assert.equal(app.field('auto-apply-settings-salary-min').props.value, '90000');
  assert.equal(app.field('auto-apply-settings-salary-max').props.value, '150000');
  assert.equal(app.field('auto-apply-settings-speed').props.value, 'conservative');
  assert.equal(find(app.render(), (node) => node.props?.label === 'Skills to prioritize').props.tags[0], 'React');
  assert.equal(find(app.render(), (node) => node.props?.label === 'Industries').props.tags[0], 'SaaS');
  assert.equal(find(app.render(), (node) => node.props?.label === 'Companies to exclude').props.tags[0], 'Acme');

  app.field('auto-apply-settings-experience-level').props.onChange({ target: { value: 'lead' } });
  app.field('auto-apply-settings-salary-min').props.onChange({ target: { value: '100000' } });
  app.field('auto-apply-settings-salary-max').props.onChange({ target: { value: '175000' } });
  app.field('auto-apply-settings-speed').props.onChange({ target: { value: 'aggressive' } });
  find(app.render(), (node) => node.props?.label === 'Skills to prioritize').props.onChange(['React', 'TypeScript']);
  find(app.render(), (node) => node.props?.label === 'Industries').props.onChange(['SaaS', 'Fintech']);
  find(app.render(), (node) => node.props?.label === 'Companies to exclude').props.onChange(['Acme', 'Globex']);

  await app.button('Save Settings').props.onClick();
  const saved = app.calls.find(([name]) => name === 'save')[1];
  assert.deepEqual(saved.skills, ['React', 'TypeScript']);
  assert.equal(saved.experience_level, 'lead');
  assert.equal(saved.salary_min, '100000');
  assert.equal(saved.salary_max, '175000');
  assert.deepEqual(saved.industries, ['SaaS', 'Fintech']);
  assert.deepEqual(saved.excluded_companies, ['Acme', 'Globex']);
  assert.equal(saved.speed, 'aggressive');
});

test('late account A data cannot overwrite account B preferences', async () => {
  const loads = [];
  const app = setup({ services: { getJobPreferences: (account) => {
    const pending = deferred(); loads.push({ ...pending, account }); return pending.promise;
  } } });
  app.setUser({ id: 'account-b' });
  assert.equal(loads[0].account.signal.aborted, true);
  loads[1].resolve({ data: { ...preferences, sender_name: 'Account B' } });
  await app.flush();
  app.button('Settings').props.onClick();
  loads[0].resolve({ data: preferences });
  await app.flush();
  assert.equal(app.field('auto-apply-settings-sender-name').props.value, 'Account B');
});

test('pending preference save is owner-bound and emits no success/error after account change or unmount', async () => {
  for (const end of ['switch', 'unmount']) {
    const pending = deferred();
    let context;
    const app = setup({ services: { saveJobPreferences: (_form, account) => { context = account; return pending.promise; } } });
    await app.flush();
    app.button('Settings').props.onClick();
    const save = app.button('Save Settings').props.onClick();
    assert.equal(context.expectedUserId, 'account-a');
    if (end === 'switch') app.setUser({ id: 'account-b' }); else app.unmount();
    pending.resolve({ data: preferences });
    await save;
    assert.equal(context.signal.aborted, true);
    assert.deepEqual(app.notices, []);
  }
});

test('wizard discovery failure explains the saved settings and the available retry', async () => {
  const app = setup({ prefs: null, services: { triggerAutoApplyRun: async () => ({ error: new Error('Provider unavailable') }) } });
  await app.flush();
  find(app.render(), (node) => node.type === 'button' && textContent(node).includes('Account A')).props.onClick();
  app.button('Continue').props.onClick();
  app.button('Continue').props.onClick();
  await app.button('Start Job Discovery').props.onClick();
  assert.ok(app.notices.some(([type, message]) => type === 'error' && message === 'Preferences saved. Provider unavailable'));
  assert.ok(!app.notices.some(([type]) => type === 'success'));
  assert.equal(app.calls.filter(([name]) => name === 'load').length, 2);
});

test('wizard cancellation after save prevents activation and first discovery run', async () => {
  const pending = deferred();
  const app = setup({ prefs: null, services: { saveJobPreferences: () => pending.promise } });
  await app.flush();
  find(app.render(), (node) => node.type === 'button' && textContent(node).includes('Account A')).props.onClick();
  app.button('Continue').props.onClick();
  app.button('Continue').props.onClick();
  const finish = app.button('Start Job Discovery');
  assert.ok(finish, 'wizard finish action is available');
  assert.equal(finish.props.disabled, false);
  const action = finish.props.onClick();
  app.unmount();
  pending.resolve({ data: preferences });
  await action;
  assert.equal(app.calls.some(([name]) => name === 'toggle' || name === 'run'), false);
  assert.deepEqual(app.notices, []);
});

test('extension launch stops after pending profile sync on account change before clear/queue/start', async () => {
  const pending = deferred();
  let synced = 0;
  const app = setup({ bridge: { syncBrowserAgentProfile: () => { synced++; return pending.promise; } } });
  await app.flush();
  const launch = app.card().props.onLaunch();
  await app.flush();
  assert.equal(synced, 1);
  app.setUser({ id: 'account-b' });
  pending.resolve();
  await launch;
  assert.equal(app.calls.some(([name]) => ['clear', 'queue', 'start'].includes(name)), false);
  assert.deepEqual(app.notices, []);
});

for (const action of ['onSync', 'onLaunch']) {
  test(`AutoApply ${action} has no legacy document preparation option`, async () => {
    const inputs = [];
    const app = setup({ bridge: { buildBrowserAgentProfile: async (input) => {
      inputs.push(input);
      return { candidate: { userId: input.user.id }, documents: {} };
    } } });
    await app.flush();
    await app.card().props[action]();
    assert.equal(inputs.length, 1);
    assert.equal(Object.hasOwn(inputs[0], 'includeResumeDocument'), false);
    assert.equal(inputs[0].resume.id, 'resume-a');
    assert.deepEqual(app.calls.find(([name]) => name === 'profile')[1].documents, {});
    app.unmount();
  });
}

test('late Gmail connect result cannot navigate away after leaving the account', async () => {
  const pending = deferred();
  let context;
  const app = setup({ services: { connectGmail: (account) => { context = account; return pending.promise; } } });
  await app.flush();
  app.button('Settings').props.onClick();
  const connect = app.button('Connect Gmail').props.onClick();
  app.unmount();
  pending.resolve({ data: { url: 'https://accounts.example.test/oauth' } });
  await connect;
  assert.equal(context.expectedUserId, 'account-a');
  assert.equal(app.location.href, 'https://resumeats.cv/#/auto-apply');
  assert.deepEqual(app.notices, []);
});

test('timed-out discovery follow-ups and late errors stay silent after unmount', async () => {
  const pending = deferred();
  const app = setup({ services: { triggerAutoApplyRun: () => pending.promise } });
  await app.flush();
  const run = app.button('Discover Jobs').props.onClick();
  app.timers.find((timer) => timer.delay === 8000).callback();
  await run;
  const noticeCount = app.notices.length;
  const loadCount = app.calls.filter(([name]) => name === 'load').length;
  app.unmount();
  for (const timer of app.timers.filter((timer) => timer.delay !== 8000)) timer.callback();
  pending.resolve({ error: new Error('Old account provider error') });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.notices.length, noticeCount);
  assert.equal(app.calls.filter(([name]) => name === 'load').length, loadCount);
});

test('scan failure is shown as failure rather than a successful empty inbox', async () => {
  const app = setup({ services: {
    getGmailConnection: async () => ({ data: { email: 'account-a@example.test', is_active: true } }),
    scanGmailReplies: async () => ({ data: null, error: new Error('Provider unavailable') }),
  } });
  await app.flush();
  app.button('Settings').props.onClick();
  await app.button('Scan Replies').props.onClick();
  assert.equal(app.notices.at(-1)[0], 'error');
  assert.equal(app.notices.some(([, message]) => /No new replies/.test(message)), false);
});
