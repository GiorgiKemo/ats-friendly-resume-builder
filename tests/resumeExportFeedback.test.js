import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, textContent } from './helpers/componentHarness.js';

test('fullscreen export success is a polite status with exact delivery-limited wording', () => {
  const message = 'PDF download requested. Check your downloads.';
  const app = componentHarness('src/components/resume/ResumeExportFeedback.jsx', { props: { feedback: { kind: 'success', message } } });
  const tree = app.render();
  assert.equal(tree.props.role, 'status');
  assert.equal(tree.props['aria-atomic'], 'true');
  assert.equal(textContent(tree), message);
});

test('fullscreen export failure is an alert that preserves the exact error text', () => {
  const message = 'Failed to export resume: Unsupported glyph <example> — try again';
  const app = componentHarness('src/components/resume/ResumeExportFeedback.jsx', { props: { feedback: { kind: 'error', message } } });
  const tree = app.render();
  assert.equal(tree.props.role, 'alert');
  assert.equal(textContent(tree), message);
  assert.equal(tree.props.dangerouslySetInnerHTML, undefined);
});

test('cleared export feedback leaves no stale status in the modal', () => {
  const app = componentHarness('src/components/resume/ResumeExportFeedback.jsx', { props: { feedback: null } });
  assert.equal(app.render(), null);
});
