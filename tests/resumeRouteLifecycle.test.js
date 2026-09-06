import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';

function newResumeSetup() {
  let user = { id: 'account-a' };
  const creates = [];
  const updates = [];
  const routes = [];
  const notices = [];
  const navigate = (route) => routes.push(route);
  const app = componentHarness('src/pages/NewResume.jsx', {
    imports: {
      'react-router-dom': { useNavigate: () => navigate },
      'react-hot-toast': { default: { error: (notice) => notices.push(notice) } },
      '../context/AuthContext': { useAuth: () => ({ user, loading: false }) },
      '../context/SubscriptionContext': { useSubscription: () => ({ isPremium: true, loading: false }) },
      '../context/ResumeContext': {
        initialResumeState: { id: '', personalInfo: {} },
        useResume: () => ({
          updateCurrentResume: (resume) => updates.push(resume),
          createResume: () => { const call = deferred(); creates.push(call); return call.promise; },
        }),
      },
      '../components/ui/Button': { default: 'Button' },
    },
  });
  app.render();
  return {
    ...app, creates, updates, routes, notices,
    start: () => find(app.render(), (node) => node.type === 'button' && /Fill in my details/.test(textContent(node))),
    setUser: (next) => { user = next; app.render(); },
  };
}

test('new-resume creation rejects duplicate clicks and opens only the created editor', async () => {
  const app = newResumeSetup();
  const button = app.start();
  const request = button.props.onClick();
  await button.props.onClick();
  assert.equal(app.creates.length, 1);
  assert.equal(app.start().props.disabled, true);
  app.creates[0].resolve({ id: 'resume-a' });
  await request;
  assert.deepEqual(app.routes, ['/builder/resume-a']);
  // Context already handles the created record. The page must not reapply a
  // potentially stale snapshot over edits made while the request was pending.
  assert.equal(app.updates.length, 1);
  assert.equal(app.start().props.disabled, false);
});

test('account switch ignores late creation results and lets the new account create', async () => {
  const app = newResumeSetup();
  const first = app.start().props.onClick();
  app.setUser({ id: 'account-b' });
  assert.equal(app.start().props.disabled, false);
  const second = app.start().props.onClick();
  app.creates[0].resolve({ id: 'private-a' });
  await first;
  assert.equal(app.start().props.disabled, true);
  assert.deepEqual(app.routes, []);
  assert.equal(app.updates.length, 2);
  app.creates[1].resolve({ id: 'resume-b' });
  await second;
  assert.deepEqual(app.routes, ['/builder/resume-b']);
});

test('leaving new-resume ignores late success and failure notifications', async () => {
  for (const rejected of [false, true]) {
    const app = newResumeSetup();
    const request = app.start().props.onClick();
    app.unmount();
    if (rejected) app.creates[0].reject(new Error('Offline'));
    else app.creates[0].resolve({ id: 'resume-a' });
    await request;
    assert.deepEqual(app.routes, []);
    assert.deepEqual(app.notices, []);
  }
});

function previewSetup() {
  let user = { id: 'account-a' };
  let resumeId = 'requested-a';
  let currentResume = { id: 'old-resume', personalInfo: { fullName: 'Old candidate' } };
  const loads = [];
  const downloads = [];
  const routes = [];
  const notices = [];
  const navigate = (route) => routes.push(route);
  const loadResume = (id) => { const call = deferred(); loads.push({ ...call, id }); return call.promise; };
  const templates = ['Basic', 'Minimalist', 'Traditional', 'Modern', 'ATSFriendly'];
  const app = componentHarness('src/pages/ResumePreview.jsx', {
    imports: {
      'react-router-dom': { useNavigate: () => navigate, useParams: () => ({ resumeId }) },
      'react-hot-toast': { default: { error: (notice) => notices.push(notice), success: (notice) => notices.push(notice) } },
      '../context/AuthContext': { useAuth: () => ({ user }) },
      '../context/ResumeContext': { useResume: () => ({ currentResume, loading: false, error: null, getResumeById: loadResume }) },
      '../components/ui/Button': { default: 'Button' },
      'framer-motion': { motion: new Proxy({}, { get: (_target, key) => key }) },
      '../utils/resumeExportReadiness': {
        exportFormatOptions: [{ id: 'docx', label: 'DOCX', badge: 'Document', description: 'Document' }],
        getResumeExportReadiness: () => ({ checks: [], completedCount: 0, totalCount: 1 }),
      },
      ...Object.fromEntries(templates.map((name) => [`../components/templates/${name}Template`, { default: `${name}Template` }])),
      '../services/docxService': { downloadResumeDocx: async (resume) => downloads.push(resume) },
    },
  });
  app.render();
  return {
    ...app, loads, downloads, routes, notices,
    exportButton: () => find(app.render(), (node) => node.type === 'Button' && /Export as/.test(textContent(node))),
    template: () => find(app.render(), (node) => /Template$/.test(String(node.type))),
    setRoute: (id) => { resumeId = id; app.render(); },
    setUser: (next) => { user = next; app.render(); },
    setResume: (resume) => { currentResume = resume; app.render(); },
  };
}

test('preview hides stale context data until the requested resume is loaded', async () => {
  const app = previewSetup();
  assert.equal(app.template(), undefined);
  assert.equal(app.exportButton(), undefined);
  app.loads[0].resolve({ id: 'requested-a' });
  await app.flush();
  assert.equal(app.exportButton(), undefined);
  app.setResume({ id: 'requested-a', personalInfo: { fullName: 'Candidate A' } });
  assert.equal(app.template().props.resume.id, 'requested-a');
  await app.exportButton().props.onClick();
  assert.equal(app.downloads[0].id, 'requested-a');
});

test('a late failed preview load cannot redirect or replace the newer route', async () => {
  const app = previewSetup();
  app.setRoute('requested-b');
  app.setResume({ id: 'requested-b', personalInfo: { fullName: 'Candidate B' } });
  app.loads[1].resolve({ id: 'requested-b' });
  await app.flush();
  app.loads[0].reject(new Error('Old request failed'));
  await app.flush();
  assert.equal(app.template().props.resume.id, 'requested-b');
  assert.deepEqual(app.routes, []);
  assert.deepEqual(app.notices, []);
});

test('preview blocks an old export callback immediately after an account change', async () => {
  const app = previewSetup();
  app.setResume({ id: 'requested-a', personalInfo: { fullName: 'Candidate A' } });
  app.loads[0].resolve({ id: 'requested-a' });
  await app.flush();
  const exportRequest = app.exportButton().props.onClick();
  app.setUser({ id: 'account-b' });
  await exportRequest;
  assert.equal(app.exportButton(), undefined);
  assert.deepEqual(app.downloads, []);
  assert.deepEqual(app.notices, []);
});

test('preview shows a truthful failure without exporting an earlier resume', async () => {
  const app = previewSetup();
  app.loads[0].reject(new Error('Not found'));
  await app.flush();
  assert.match(textContent(app.render()), /Failed to load resume/);
  assert.equal(app.exportButton(), undefined);
  assert.equal(app.template(), undefined);
});
