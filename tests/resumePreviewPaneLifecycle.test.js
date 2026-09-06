import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find } from './helpers/componentHarness.js';

function setup(document = { body: { style: { overflow: 'auto' } } }) {
  let user = { id: 'account-a' };
  let resume = { id: 'resume-a', personalInfo: { fullName: 'Private A' } };
  let saveState = { hasUnsavedChanges: false, saveConflict: null };
  const downloads = [];
  const notices = [];
  const download = (format, args) => {
    const request = deferred();
    downloads.push({ ...request, format, args });
    return request.promise;
  };
  const app = componentHarness('src/components/resume/ResumePreviewPane.jsx', {
    globals: { document },
    imports: {
      '../../context/ResumeContext': { useResume: () => ({ currentResume: resume, ...saveState }) },
      '../../context/AuthContext': { useAuth: () => ({ user }) },
      './MobileResumePreview': { default: 'MobileResumePreview' },
      './DesktopResumePreview': { default: 'DesktopResumePreview' },
      '../../services/pdfService': { downloadResumePdf: (...args) => download('pdf', args) },
      '../../services/docxService': { downloadResumeDocx: (...args) => download('docx', args) },
      'react-hot-toast': { default: { success: (message) => notices.push(message), error: (message) => notices.push(message) } },
      ...Object.fromEntries(['Basic', 'Minimalist', 'Traditional', 'Modern', 'ATSFriendly'].map((name) => [`../templates/${name}Template`, { default: `${name}Template` }])),
    },
  });
  app.render();
  const preview = () => find(app.render(), (node) => node.type === 'DesktopResumePreview');
  return { ...app, document, downloads, notices, preview,
    setAccount: () => { user = { id: 'account-b' }; resume = { ...resume, id: 'resume-b' }; app.render(); },
    setResume: (id) => { resume = { ...resume, id }; app.render(); },
    setSaveState: (next) => { saveState = { ...saveState, ...next }; app.render(); },
  };
}

test('preview pane locks duplicate exports and restores its scroll change', async () => {
  const app = setup();
  const callback = app.preview().props.onExport;
  const pending = callback();
  await callback();
  await app.flush();
  assert.equal(app.downloads.length, 1);
  assert.equal(app.downloads[0].args[1].id, 'resume-a');
  assert.equal(app.downloads[0].args.length, 3);
  assert.equal(app.preview().props.isExporting, true);
  assert.equal(app.document.body.style.overflow, 'hidden');
  app.downloads[0].resolve(true);
  await pending;
  assert.equal(app.document.body.style.overflow, 'auto');
  assert.equal(app.preview().props.isExporting, false);
  assert.equal(app.notices.length, 1);
});

test('unsaved and conflicted preview PDF exports are local-only without mutating the current resume', async () => {
  for (const state of [
    { hasUnsavedChanges: true },
    { saveConflict: { resumeId: 'resume-a', kind: 'remote', serverRevision: 2 } },
    { hasUnsavedChanges: true, saveConflict: { resumeId: 'resume-a', kind: 'recovery', serverRevision: 3 } },
  ]) {
    const app = setup();
    app.setSaveState(state);
    const current = app.preview().props.resume;
    const pending = app.preview().props.onExport();
    await app.flush();
    const exported = app.downloads[0].args[1];
    assert.equal(exported, current, 'Every download uses the exact local snapshot without a cloud destination');
    assert.equal(exported.personalInfo.fullName, 'Private A');
    assert.equal(app.downloads[0].args.length, 3);
    assert.equal(app.preview().props.resume, current);
    assert.equal(current.id, 'resume-a');
    app.downloads[0].resolve(true);
    await pending;
  }
});

test('draft, conflicted, and saved previews all retain the same local PDF snapshot contract', async () => {
  const app = setup();
  app.setSaveState({ hasUnsavedChanges: true, saveConflict: { kind: 'remote' } });
  const draftExport = app.preview().props.onExport();
  await app.flush();
  assert.equal(app.downloads[0].args[1], app.preview().props.resume);
  app.downloads[0].resolve(true);
  await draftExport;
  app.setSaveState({ hasUnsavedChanges: false, saveConflict: null });
  const savedExport = app.preview().props.onExport();
  await app.flush();
  assert.equal(app.downloads[1].args[1].id, 'resume-a');
  assert.equal(app.downloads[1].args[1], app.preview().props.resume);
  app.downloads[1].resolve(true);
  await savedExport;
});

test('preview pane cancels both export formats before download when the account, resume, or mount changes', async () => {
  for (const format of ['pdf', 'docx']) {
    for (const change of ['account', 'resume', 'unmount']) {
      const app = setup();
      app.preview().props.setExportFormat(format);
      const pending = app.preview().props.onExport();
      if (change === 'account') app.setAccount();
      else if (change === 'resume') app.setResume('another-resume');
      else app.unmount();
      await pending;
      assert.equal(app.downloads.length, 0);
      assert.equal(app.notices.length, 0);
      assert.equal(app.document.body.style.overflow, 'auto');
    }
  }
});

test('an obsolete export cannot restore scroll or status over the next account export', async () => {
  const app = setup();
  const previous = app.preview().props.onExport();
  await app.flush();
  app.setAccount();
  assert.equal(app.document.body.style.overflow, 'auto');
  assert.equal(app.preview().props.isExporting, false);
  const current = app.preview().props.onExport();
  await app.flush();
  app.downloads[0].reject(new Error('Previous export failed'));
  await previous;
  assert.equal(app.document.body.style.overflow, 'hidden');
  assert.equal(app.preview().props.isExporting, true);
  assert.equal(app.notices.length, 0);
  app.downloads[1].resolve(true);
  await current;
  assert.equal(app.document.body.style.overflow, 'auto');
  assert.equal(app.preview().props.isExporting, false);
  assert.equal(app.notices.length, 1);
});

test('unmount restores scroll immediately and late completion cannot undo another pane scroll lock', async () => {
  const app = setup();
  const old = app.preview().props.onExport();
  await app.flush();
  app.unmount();
  assert.equal(app.document.body.style.overflow, 'auto');
  const next = setup(app.document);
  const current = next.preview().props.onExport();
  await next.flush();
  app.downloads[0].resolve(true);
  await old;
  assert.equal(app.document.body.style.overflow, 'hidden');
  assert.equal(app.notices.length, 0);
  next.downloads[0].reject(new Error('Download failed'));
  await current;
  assert.equal(app.document.body.style.overflow, 'auto');
  assert.equal(next.notices.length, 1);
});

for (const format of ['pdf', 'docx']) {
  test(`${format} export exposes truthful account-bound feedback and clears it for retry`, async () => {
    const app = setup();
    app.preview().props.setExportFormat(format);
    const failed = app.preview().props.onExport();
    await app.flush();
    assert.equal(app.preview().props.exportFeedback, null);
    app.downloads[0].reject(new Error('Synthetic exact export failure'));
    await failed;
    const error = app.preview().props.exportFeedback;
    assert.equal(error.kind, 'error');
    assert.equal(error.message, 'Failed to export resume: Synthetic exact export failure');
    assert.equal(error.key, 'account-a:resume-a');
    assert.equal(app.preview().props.isExporting, false, 'Retry must be enabled after failure');
    assert.equal(app.notices[0], error.message);
    const retry = app.preview().props.onExport();
    await app.flush();
    assert.equal(app.preview().props.exportFeedback, null);
    app.downloads[1].resolve(true);
    await retry;
    const success = app.preview().props.exportFeedback;
    assert.equal(success.kind, 'success');
    assert.equal(success.message, `${format.toUpperCase()} download requested. Check your downloads.`);
    assert.equal(success.key, 'account-a:resume-a');
    assert.equal(app.notices[1], success.message);
    const mobile = find(app.render(), (node) => node.type === 'MobileResumePreview');
    assert.equal(mobile.props.exportFeedback, success);
    app.unmount();
  });

  test(`${format} late success and failure never expose feedback after account, resume, or unmount change`, async () => {
    for (const outcome of ['resolve', 'reject']) {
      for (const change of ['account', 'resume', 'unmount']) {
        const app = setup();
        app.preview().props.setExportFormat(format);
        const pending = app.preview().props.onExport();
        await app.flush();
        if (change === 'account') app.setAccount();
        else if (change === 'resume') app.setResume('resume-b');
        else app.unmount();
        app.downloads[0][outcome](outcome === 'resolve' ? true : new Error('Private old outcome'));
        await pending;
        assert.equal(app.preview().props.exportFeedback, null);
        assert.equal(app.notices.length, 0);
      }
    }
  });
}

test('a prior account outcome cannot replace a newer successful feedback record', async () => {
  const app = setup();
  const old = app.preview().props.onExport();
  await app.flush();
  app.setAccount();
  app.preview().props.setExportFormat('docx');
  const current = app.preview().props.onExport();
  await app.flush();
  app.downloads[1].resolve(true);
  await current;
  const feedback = app.preview().props.exportFeedback;
  assert.equal(feedback.key, 'account-b:resume-b');
  assert.equal(feedback.message, 'DOCX download requested. Check your downloads.');
  app.downloads[0].reject(new Error('Private obsolete PDF failure'));
  await old;
  assert.equal(app.preview().props.exportFeedback, feedback);
  assert.deepEqual(app.notices, [feedback.message]);
  app.setResume('resume-c');
  assert.equal(app.preview().props.exportFeedback, null);
});
