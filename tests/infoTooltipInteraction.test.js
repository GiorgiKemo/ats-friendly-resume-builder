import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import { componentHarness, find } from './helpers/componentHarness.js';

const setup = () => componentHarness('src/components/ui/InfoTooltip.jsx', {
  imports: { 'prop-types': { default: PropTypes } },
  props: { content: 'Password must be at least 6 characters' },
});

const parts = (tree) => ({
  wrapper: find(tree, (node) => node.props?.onFocus && node.props?.onKeyDown),
  button: find(tree, (node) => node.type === 'button'),
  tooltip: find(tree, (node) => node.props?.role === 'tooltip'),
});

test('InfoTooltip stays open when click follows focus and dismisses with Escape', () => {
  const app = setup();
  let tree = app.render();
  let { wrapper, button, tooltip } = parts(tree);
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(tooltip, undefined);

  wrapper.props.onFocus();
  tree = app.render();
  ({ wrapper, button, tooltip } = parts(tree));
  assert.equal(button.props['aria-expanded'], true);
  assert.ok(tooltip);

  button.props.onClick();
  tree = app.render();
  ({ wrapper, button, tooltip } = parts(tree));
  assert.equal(button.props['aria-expanded'], true, 'click after focus must not toggle the tooltip closed');
  assert.ok(tooltip);

  let stopped = false;
  wrapper.props.onKeyDown({ key: 'Escape', stopPropagation() { stopped = true; } });
  tree = app.render();
  ({ button, tooltip } = parts(tree));
  assert.equal(stopped, true);
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(tooltip, undefined);
});

test('InfoTooltip opens on pointer entry and closes on pointer exit', () => {
  const app = setup();
  let tree = app.render();
  let { wrapper, button, tooltip } = parts(tree);

  wrapper.props.onMouseEnter();
  tree = app.render();
  ({ wrapper, button, tooltip } = parts(tree));
  assert.equal(button.props['aria-expanded'], true);
  assert.ok(tooltip);

  wrapper.props.onMouseLeave();
  tree = app.render();
  ({ button, tooltip } = parts(tree));
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(tooltip, undefined);
});

test('inline InfoTooltip floats above the label without shifting the form layout', () => {
  const app = componentHarness('src/components/ui/InfoTooltip.jsx', {
    imports: { 'prop-types': { default: PropTypes } },
    props: { content: 'Password must be at least 6 characters', position: 'inline' },
  });
  let tree = app.render();
  let { wrapper, button } = parts(tree);
  const closedWrapperClass = wrapper.props.className;
  // The 44px touch target comes from a pseudo-element, so the icon keeps the label row compact.
  assert.match(button.props.className, /\bh-4 w-4\b/);
  assert.match(button.props.className, /before:absolute before:-inset-3\.5/);

  wrapper.props.onFocus();
  tree = app.render();
  const opened = parts(tree);
  assert.equal(opened.wrapper.props.className, closedWrapperClass, 'opening must not change the wrapper layout');
  assert.match(opened.tooltip.props.className, /\babsolute\b/);
  assert.match(opened.tooltip.props.className, /bottom-full/);
  assert.match(opened.tooltip.props.className, /pointer-events-none/);
});
