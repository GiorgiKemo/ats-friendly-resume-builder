import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, textContent } from './helpers/componentHarness.js';

const cases = [
  ['MobileResumePreview', false],
  ['DesktopResumePreview', true],
];

function setup(name, extra = {}) {
  const props = { children: 'Exact resume content', onExport: () => {}, exportFormat: 'docx', setExportFormat: () => {}, ...extra };
  return componentHarness(`src/components/resume/${name}.jsx`, {
    props,
    globals: { document: { body: { style: { overflow: 'auto' } } }, window: { addEventListener() {}, removeEventListener() {} } },
    imports: { '../ui/Button': { default: 'Button' }, './FullscreenResumeDialog': { default: 'FullscreenResumeDialog' }, './ResumeExportFeedback': { default: 'ResumeExportFeedback' } },
  });
}

for (const [name, desktop] of cases) {
  test(`${name} delegates fullscreen to the top-layer dialog and preserves content and export controls`, () => {
    const app = setup(name);
    find(app.render(), (node) => node.props?.['aria-label'] === 'View fullscreen').props.onClick();
    const fullscreen = app.render();
    assert.equal(fullscreen.type, 'FullscreenResumeDialog');
    assert.equal(fullscreen.props.desktop, desktop);
    assert.ok(textContent(fullscreen).includes('Exact resume content'));
    assert.ok(find(fullscreen, (node) => node.type === 'select' && node.props.value === 'docx'));
    assert.equal(find(fullscreen, (node) => node.props?.['aria-label'] === 'Exit fullscreen').props.ref, fullscreen.props.initialFocusRef);
    fullscreen.props.onClose();
    assert.ok(find(app.render(), (node) => node.props?.['aria-label'] === 'View fullscreen'));
    app.unmount();
  });

  test(`${name} cannot acquire a fullscreen scroll lock during an already-running export`, () => {
    const app = setup(name, { isExporting: true });
    const opener = find(app.render(), (node) => node.props?.['aria-label'] === 'View fullscreen');
    assert.equal(opener.props.disabled, true);
    opener.props.onClick();
    assert.notEqual(app.render().type, 'FullscreenResumeDialog', 'The handler must also reject entry while an export is pending');
    app.unmount();
  });

  test(`${name} keeps Exit available if export starts inside fullscreen`, () => {
    const app = setup(name);
    find(app.render(), (node) => node.props?.['aria-label'] === 'View fullscreen').props.onClick();
    const tree = app.setProps({ children: 'Exact resume content', isExporting: true });
    const exit = find(tree, (node) => node.props?.['aria-label'] === 'Exit fullscreen');
    assert.notEqual(exit.props.disabled, true);
    exit.props.onClick();
    assert.ok(find(app.render(), (node) => node.props?.['aria-label'] === 'View fullscreen'));
    app.unmount();
  });

  test(`${name} renders export feedback only inside fullscreen and retains an enabled retry control`, () => {
    const exportFeedback = { kind: 'error', message: 'Exact export failure', key: 'account:resume' };
    const app = setup(name, { exportFeedback });
    const feedback = () => find(app.render(), (node) => node.type === 'ResumeExportFeedback');
    assert.equal(feedback(), undefined);
    find(app.render(), (node) => node.props?.['aria-label'] === 'View fullscreen').props.onClick();
    assert.equal(feedback().props.feedback, exportFeedback);
    assert.equal(find(app.render(), (node) => node.type === 'Button').props.disabled, false);
    find(app.render(), (node) => node.props?.['aria-label'] === 'Exit fullscreen').props.onClick();
    assert.equal(feedback(), undefined);
    app.unmount();
  });
}

test('desktop fullscreen retains its zoom controls and resets zoom on reentry', () => {
  const app = setup('DesktopResumePreview');
  const button = (label) => find(app.render(), (node) => node.props?.['aria-label'] === label);
  button('View fullscreen').props.onClick();
  button('Zoom in').props.onClick();
  assert.equal(button('Reset zoom').props.children[0], 110);
  button('Exit fullscreen').props.onClick();
  button('View fullscreen').props.onClick();
  assert.equal(button('Reset zoom').props.children[0], 100);
  app.unmount();
});
