import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import { componentHarness, find, textContent } from './helpers/componentHarness.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { buildResumeTextLines } from '../src/utils/resumeExportText.js';

function setup() {
  let now = Date.now();
  const captured = {
    handoffId: 'handoff-a', ownerId: 'owner-a', jobKey: 'https://jobs.example/1', expiresAt: now + 1000,
    jobSnapshot: { title: 'Designer', company: 'Cedar', description: 'Captured facts.', url: 'https://jobs.example/1' },
  };
  const saved = {
    id: 'saved-a', user_id: 'owner-a', revision: 3, title: 'Saved source',
    personal_info: { full_name: 'José Müller', phone: '', summary: 'Source-only summary.' },
    work_experience: [{ role: 'Designer', company: 'Cedar', responsibilities: 'Built an accessible design system.' }],
    certifications: [{ name: 'Course', issueDate: '2024-01' }], skills: [],
    projects: [{ name: 'Portfolio', details: 'Selected project detail.' }],
    additional_sections: [{ title: 'Volunteering', content: 'Supported the local library.' }],
  };
  const calls = { get: 0, refresh: 0, complete: 0, import: 0, rendered: [] };
  let refresh = async () => { calls.refresh += 1; };
  const service = loadEdgeFunction('src/services/browserAgentResumeArtifact.js', {
    imports: {
      './supabase': { supabase: { auth: {
        getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      } } },
      './supabaseService.js': { getResumeById: async () => saved },
      './resumePdfDocument.js': { buildTextPdf: async (snapshot) => {
        calls.rendered.push(snapshot);
        return { blob: new Blob(['%PDF-1.7\nsynthetic'], { type: 'application/pdf' }) };
      } },
    }, globals: { Blob },
  }).exports;
  const app = componentHarness('src/components/resume/ExtensionResumeHandoff.jsx', {
    props: { onImport: () => { calls.import += 1; return true; }, hasDraftContent: false, hasUnfinishedWork: false, canTailor: true },
    imports: {
      'prop-types': { default: PropTypes },
      'react-router-dom': { useLocation: () => ({ search: '?extensionRequest=handoff-a' }) },
      '../../context/AuthContext': { useAuth: () => ({ user: { id: 'owner-a' } }) },
      '../../context/ResumeContext': { useResume: () => ({ resumes: [saved], fetchUserResumes: refresh }) },
      '../ui/Button': { default: 'Button' },
      '../../utils/resumeExportText': { buildResumeTextLines },
      '../../services/browserAgentService': {
        getBrowserAgentResumeHandoff: async () => { calls.get += 1; return captured; },
        loadBrowserAgentSavedResume: service.loadBrowserAgentSavedResume,
        completeBrowserAgentResumeHandoff: async (selection) => {
          calls.complete += 1;
          const response = await service.prepareBrowserAgentSavedResumeArtifact({ ...selection, jobKey: captured.jobKey, expectedUserId: 'owner-a' });
          return { status: response.status, handoffId: response.handoffId, resume: response.resume };
        },
        cancelBrowserAgentResumeHandoff: async () => {},
      },
    }, globals: { Date: class extends Date { static now() { return now; } } },
  });
  app.render();
  const button = (label) => find(app.render(), (node) => node.type === 'Button' && textContent(node) === label);
  return {
    ...app, calls, button,
    async preview() {
      await app.flush();
      find(app.render(), (node) => node.props?.id === 'extension-saved-resume').props.onChange({ target: { value: saved.id } });
      await button('Preview saved version').props.onClick();
      app.render();
    },
    refreshAuthCallback() { refresh = async () => { calls.refresh += 1; }; app.render(); },
    advancePastExpiry() { now = captured.expiresAt + 1; },
  };
}

test('saved content preview exactly matches the normalized snapshot passed to the real artifact service renderer', async () => {
  const app = setup();
  await app.preview();
  const preview = textContent(find(app.render(), (node) => node.type === 'pre'));
  for (const expected of ['José Müller', 'Designer at Cedar', 'Built an accessible design system.', '2024-01', 'Selected project detail.', 'Supported the local library.']) assert.ok(preview.includes(expected), expected);
  await app.button('Use this saved version for this job').props.onClick();
  assert.equal(app.calls.rendered.length, 1);
  assert.equal(preview, buildResumeTextLines(app.calls.rendered[0]).join('\n'));
  assert.equal(app.calls.rendered[0].personalInfo.phone, '');
  assert.equal(app.calls.rendered[0].skills.length, 0);
  assert.equal(app.calls.import, 0);
});

test('same-account auth refresh callback replacement preserves the exact preview and does not restart retrieval', async () => {
  const app = setup();
  await app.preview();
  const preview = textContent(find(app.render(), (node) => node.type === 'pre'));
  app.refreshAuthCallback();
  await app.flush();
  assert.equal(app.calls.get, 1, 'Library callback identity is not a new handoff');
  assert.equal(textContent(find(app.render(), (node) => node.type === 'pre')), preview);
});

test('idle expiry is checked at selection and import time even without a new render', async () => {
  const app = setup();
  await app.preview();
  const complete = app.button('Use this saved version for this job').props.onClick;
  const importJob = app.button('Tailor a new resume for this job').props.onClick;
  app.advancePastExpiry();
  await complete();
  importJob();
  assert.equal(app.calls.complete, 0);
  assert.equal(app.calls.import, 0);
});
