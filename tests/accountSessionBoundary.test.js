import test from 'node:test';
import assert from 'node:assert/strict';
import PropTypes from 'prop-types';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

test('account subtree key changes only with identity and clears prior notifications', () => {
  let user = null;
  let previousAccount;
  let dismissals = 0;
  const children = { type: 'ProvidersAndRoutes' };
  const Fragment = Symbol('Fragment');
  const jsx = (type, props, key) => ({ type, props, key });
  const { exports: { default: Boundary } } = loadEdgeFunction('src/components/AccountSessionBoundary.jsx', {
    imports: {
      react: { Fragment, useRef: (initial) => { previousAccount ||= { current: initial }; return previousAccount; }, useEffect: (callback) => callback() },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'prop-types': { default: PropTypes },
      'react-hot-toast': { default: { remove: () => { dismissals += 1; } } },
      '../context/AuthContext': { useAuth: () => ({ user }) },
    },
  });
  const render = () => Boundary({ children });
  assert.equal(render().key, 'anonymous');
  assert.equal(dismissals, 0);
  user = { id: 'account-a', accessToken: 'old' };
  assert.equal(render().key, 'account-a');
  assert.equal(dismissals, 1);
  user = { id: 'account-a', accessToken: 'refreshed', email: 'updated@example.com' };
  assert.equal(render().key, 'account-a');
  assert.equal(dismissals, 1, 'Same-account refresh must retain the subtree and notifications');
  user = { id: 'account-b' };
  const next = render();
  assert.equal(next.type, Fragment);
  assert.equal(next.key, 'account-b');
  assert.equal(next.props.children, children);
  assert.equal(dismissals, 2);
  user = null;
  assert.equal(render().key, 'anonymous');
  assert.equal(dismissals, 3);
});

test('auth recovery stays outside the keyed account subtree while providers and routes stay inside', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const found = new Map();
  const visit = (node, ancestors = []) => {
    if (!node || typeof node !== 'object') return;
    const name = node.type === 'JSXElement' ? node.openingElement.name.name : null;
    if (name) found.set(name, ancestors);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue;
      const path = name ? [...ancestors, name] : ancestors;
      if (Array.isArray(value)) value.forEach((entry) => visit(entry, path));
      else if (value && typeof value === 'object') visit(value, path);
    }
  };
  visit(ast);
  assert.ok(found.get('AuthRecoveryBridge').includes('AuthProvider'));
  assert.ok(!found.get('AuthRecoveryBridge').includes('AccountSessionBoundary'));
  for (const name of ['SubscriptionProvider', 'ResumeProvider', 'Routes']) {
    assert.ok(found.get(name).includes('AccountSessionBoundary'), name);
  }
});
