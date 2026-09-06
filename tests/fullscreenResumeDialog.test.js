import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createPortal } from 'react-dom';
import { renderToString } from 'react-dom/server';
import { componentHarness } from './helpers/componentHarness.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

// Native DOM boundary double: records actual component lifecycle calls. The
// browser's top-layer/inert/Tab implementation is checked separately in CUA.
function setup({ desktop = false, matches = desktop, overflow = 'auto', modalSupported = true, modalThrows = false } = {}) {
  const listeners = new Set();
  const microtasks = [];
  let closeCalls = 0;
  let showCalls = 0;
  let nextModal = false;
  const document = { body: { style: { overflow } }, activeElement: null, querySelector: () => dialog.open || nextModal ? dialog : null };
  const focusable = () => ({ isConnected: true, visible: true, focusCalls: 0,
    getClientRects() { return this.visible ? [{}] : []; },
    focus() { this.focusCalls++; document.activeElement = this; },
  });
  const opener = focusable();
  const exit = focusable();
  document.activeElement = opener;
  const dialog = { open: false, closeCalls: 0,
    showModal: modalSupported ? () => { showCalls++; if (modalThrows) throw new Error('Cannot open dialog'); dialog.open = true; } : undefined,
    close() { this.closeCalls++; this.open = false; },
  };
  const breakpoint = { matches,
    addEventListener(name, listener) { assert.equal(name, 'change'); listeners.add(listener); },
    removeEventListener(name, listener) { assert.equal(name, 'change'); listeners.delete(listener); },
  };
  const props = { children: 'Exact resume', labelledBy: 'preview-heading', desktop, onClose: () => closeCalls++, initialFocusRef: { current: exit }, returnFocusRef: { current: opener } };
  const jsx = (type, nodeProps) => {
    if (type === 'dialog') nodeProps.ref.current = dialog;
    return { type, props: nodeProps };
  };
  const app = componentHarness('src/components/resume/FullscreenResumeDialog.jsx', {
    props,
    globals: { document, queueMicrotask: (callback) => microtasks.push(callback), window: { matchMedia: (query) => { assert.equal(query, '(min-width: 768px)'); return breakpoint; } } },
    imports: { 'react-dom': { createPortal: (children, target) => ({ type: 'portal', props: { children, target } }) }, 'react/jsx-runtime': { jsx, jsxs: jsx } },
  });
  return { ...app, props, document, dialog, opener, exit, listeners,
    closeCalls: () => closeCalls, showCalls: () => showCalls,
    drainMicrotasks: () => microtasks.splice(0).forEach((callback) => callback()),
    resize: (value) => listeners.forEach((listener) => listener({ matches: value })),
    focusable, setNextModal: () => { nextModal = true; },
  };
}

test('native modal is portalled to body, escapes parent stacking, and focuses Exit', () => {
  const app = setup();
  const portal = app.render();
  assert.equal(portal.type, 'portal');
  assert.equal(portal.props.target, app.document.body);
  assert.equal(portal.props.children.type, 'dialog');
  assert.equal(portal.props.children.props['aria-modal'], 'true');
  assert.equal(portal.props.children.props['aria-labelledby'], 'preview-heading');
  assert.equal(portal.props.children.props.style.height, '100dvh');
  assert.equal(app.showCalls(), 1, 'showModal, not an open attribute or show(), activates native background inertness');
  assert.equal(app.dialog.open, true);
  assert.equal(app.document.activeElement, app.exit);
  assert.equal(app.document.body.style.overflow, 'hidden');
  app.unmount();
});

test('native Escape cancellation requests close and leaves cleanup to the state transition', () => {
  const app = setup();
  const dialog = app.render().props.children;
  let prevented = false;
  dialog.props.onCancel({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.closeCalls(), 1);
  app.unmount();
  app.drainMicrotasks();
  assert.equal(app.dialog.open, false);
  assert.equal(app.document.body.style.overflow, 'auto');
  assert.equal(app.document.activeElement, app.opener);
});

for (const overflow of ['', 'auto', 'scroll', 'hidden', 'clip']) {
  test(`unmount restores the exact prior body overflow ${JSON.stringify(overflow)} and removes the breakpoint listener`, () => {
    const app = setup({ overflow });
    app.render();
    app.unmount();
    assert.equal(app.document.body.style.overflow, overflow);
    assert.equal(app.dialog.closeCalls, 1);
    assert.equal(app.listeners.size, 0);
  });
}

for (const desktop of [false, true]) {
  test(`${desktop ? 'desktop' : 'mobile'} modal closes when its responsive preview becomes inactive`, () => {
    const app = setup({ desktop });
    app.render();
    app.resize(desktop);
    assert.equal(app.closeCalls(), 0);
    app.resize(!desktop);
    assert.equal(app.closeCalls(), 1);
    app.unmount();
    assert.equal(app.document.body.style.overflow, 'auto');
  });
}

test('a stale breakpoint or unavailable native modal never locks the background', () => {
  for (const options of [{ matches: true }, { modalSupported: false }, { modalThrows: true }]) {
    const app = setup(options);
    app.render();
    assert.equal(app.closeCalls(), 1);
    assert.equal(app.document.body.style.overflow, 'auto');
    assert.equal(app.dialog.open, false);
    assert.equal(app.listeners.size, 0);
    app.unmount();
  }
});

test('focus restoration uses the remounted opener, not the removed fullscreen trigger', () => {
  const app = setup();
  app.render();
  app.unmount();
  app.opener.isConnected = false;
  const replacement = app.focusable();
  app.props.returnFocusRef.current = replacement;
  app.drainMicrotasks();
  assert.equal(app.document.activeElement, replacement);
});

test('unmount does not focus a hidden or disconnected trigger or steal focus from a newer modal', () => {
  for (const change of ['hidden', 'disconnected', 'new-modal']) {
    const app = setup();
    app.render();
    app.unmount();
    if (change === 'hidden') app.opener.visible = false;
    if (change === 'disconnected') app.opener.isConnected = false;
    if (change === 'new-modal') app.setNextModal();
    app.drainMicrotasks();
    assert.equal(app.opener.focusCalls, 0);
  }
});

test('ordinary parent renders do not reopen the modal or replace its captured scroll state', () => {
  const app = setup();
  app.render();
  let latestCloseCalls = 0;
  const tree = app.setProps({ ...app.props, onClose: () => latestCloseCalls++ });
  assert.equal(app.showCalls(), 1);
  tree.props.children.props.onCancel({ preventDefault() {} });
  assert.equal(latestCloseCalls, 1);
  assert.equal(app.closeCalls(), 0);
  app.unmount();
  assert.equal(app.document.body.style.overflow, 'auto');
});

test('server rendering does not access document, portal, focus, or media-query APIs', () => {
  const { exports } = loadEdgeFunction('src/components/resume/FullscreenResumeDialog.jsx', {
    imports: { react: { ...React, default: React }, 'react/jsx-runtime': jsxRuntime, 'react-dom': { createPortal } },
  });
  assert.equal(renderToString(React.createElement(exports.default, { desktop: false, onClose() {}, initialFocusRef: { current: null }, returnFocusRef: { current: null } })), '');
});
