import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const sections = [
  { id: 'contact', label: 'Contact information' },
  { id: 'disabled', label: 'Unavailable section', disabled: true },
  { id: 'skills', label: 'Skills' },
];

const visit = (node, predicate) => {
  if (Array.isArray(node)) return node.flatMap((child) => visit(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...visit(node.props?.children, predicate)];
};
const find = (tree, predicate) => visit(tree, predicate)[0];
const textContent = (node) => {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'string') return node;
  return node && typeof node === 'object' ? textContent(node.props?.children) : '';
};

function setup(name, initialSection = 'contact') {
  let cursor = 0;
  let pendingEffects = [];
  let activeSection = initialSection;
  const hooks = [];
  const changes = [];
  const listeners = new Map();
  let triggerFocus = 0;
  let panelFocus = 0;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((item, index) => item === b[index]);
  const react = {
    useId: () => { const index = cursor++; return `mobile-nav-${index}`; },
    useState: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect: (callback, deps) => {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) {
        const cleanup = hooks[index]?.cleanup;
        hooks[index] = { deps };
        pendingEffects.push(() => { cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const { exports: { default: Component } } = loadEdgeFunction(`src/components/resume/${name}.jsx`, {
    globals: {
      document: {
        addEventListener: (type, handler) => listeners.set(type, handler),
        removeEventListener: (type) => listeners.delete(type),
      },
    },
    imports: {
      react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'prop-types': { default: PropTypes },
      '../../context/ThemeContext': { useTheme: () => ({ isDark: false }) },
      './ResumeSectionIcon': { default: () => null },
      './ResumeSectionStatusBadge': { default: () => null },
    },
  });
  const render = () => {
    cursor = 0;
    const tree = Component({ sections, activeSection, setActiveSection: (id) => { changes.push(id); activeSection = id; } });
    for (const node of visit(tree, (item) => item.props?.ref)) {
      if (node.type === 'button') node.props.ref.current = { focus: () => { triggerFocus += 1; } };
      else if (node.props.id) node.props.ref.current = { querySelector: () => ({ focus: () => { panelFocus += 1; } }) };
      else node.props.ref.current = { contains: (target) => target === 'inside' };
    }
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach((effect) => effect());
    return tree;
  };
  return { render, changes, listeners, get triggerFocus() { return triggerFocus; }, get panelFocus() { return panelFocus; } };
}

test('mobile top navigation is one labelled native select with disabled options', () => {
  const app = setup('MobileNavigation');
  const tree = app.render();
  const select = find(tree, (node) => node.type === 'select');
  const label = find(tree, (node) => node.type === 'label');
  assert.equal(label.props.htmlFor, select.props.id);
  assert.equal(textContent(label), 'Resume section');
  assert.equal(select.props.value, 'contact');
  assert.equal(visit(tree, (node) => node.type === 'select').length, 1);
  assert.equal(visit(tree, (node) => typeof node.type === 'function').length, 0, 'No duplicate progress component');
  assert.equal(find(tree, (node) => node.type === 'option' && node.props.value === 'disabled').props.disabled, true);
  select.props.onChange({ target: { value: 'disabled' } });
  select.props.onChange({ target: { value: 'skills' } });
  assert.deepEqual(app.changes, ['skills']);
});

test('bottom navigation has a linked disclosure with native controls and current-section state', () => {
  const app = setup('MobileResumeNavBar');
  let tree = app.render();
  assert.equal(tree.type, 'nav');
  const trigger = find(tree, (node) => node.props?.['aria-controls']);
  assert.equal(trigger.props['aria-expanded'], false);
  assert.equal(find(tree, (node) => node.props?.id === trigger.props['aria-controls']).props.hidden, true);
  assert.equal(visit(tree, (node) => node.props?.role === 'listbox').length, 0);
  assert.ok(visit(tree, (node) => node.type === 'button').every((button) => button.props.type === 'button'));
  assert.equal(textContent(find(tree, (node) => node.props?.['aria-current'] === 'step')).includes('Contact information'), true);
  trigger.props.onClick();
  tree = app.render();
  assert.equal(find(tree, (node) => node.props?.['aria-controls']).props['aria-expanded'], true);
  assert.equal(app.panelFocus, 1, 'Opening moves keyboard focus into the section choices');
});

test('Escape closes the disclosure and restores focus to its trigger', () => {
  const app = setup('MobileResumeNavBar');
  find(app.render(), (node) => node.props?.['aria-controls']).props.onClick();
  const tree = app.render();
  let prevented = false;
  let stopped = false;
  find(tree, (node) => node.props?.onKeyDown).props.onKeyDown({
    key: 'Escape', preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; },
  });
  assert.equal(find(app.render(), (node) => node.props?.['aria-controls']).props['aria-expanded'], false);
  assert.equal(app.triggerFocus, 1);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(app.listeners.has('pointerdown'), false);
});

test('disabled sections cannot be activated and quick navigation skips them', () => {
  const app = setup('MobileResumeNavBar');
  let tree = app.render();
  const unavailable = find(tree, (node) => node.type === 'button' && textContent(node).includes('Unavailable section'));
  assert.equal(unavailable.props.disabled, true);
  unavailable.props.onClick();
  assert.equal(app.changes.length, 0);
  assert.equal(find(tree, (node) => node.props?.['aria-label'] === 'Previous section').props.disabled, true);
  find(tree, (node) => node.props?.['aria-label'] === 'Next section').props.onClick();
  assert.deepEqual(app.changes, ['skills']);
  tree = app.render();
  assert.equal(find(tree, (node) => node.props?.['aria-label'] === 'Next section').props.disabled, true);
  find(tree, (node) => node.props?.['aria-label'] === 'Previous section').props.onClick();
  assert.deepEqual(app.changes, ['skills', 'contact']);
});

test('choosing a section closes disclosure and restores focus without focus theft on outside clicks', () => {
  const app = setup('MobileResumeNavBar');
  find(app.render(), (node) => node.props?.['aria-controls']).props.onClick();
  const tree = app.render();
  find(tree, (node) => node.type === 'button' && textContent(node) === 'Skills').props.onClick();
  assert.deepEqual(app.changes, ['skills']);
  assert.equal(app.triggerFocus, 1);
  assert.equal(find(app.render(), (node) => node.props?.['aria-controls']).props['aria-expanded'], false);
  find(app.render(), (node) => node.props?.['aria-controls']).props.onClick();
  app.render();
  app.listeners.get('pointerdown')({ target: 'outside' });
  assert.equal(find(app.render(), (node) => node.props?.['aria-controls']).props['aria-expanded'], false);
  assert.equal(app.triggerFocus, 1, 'Outside dismissal must not move focus away from the clicked target');
});
