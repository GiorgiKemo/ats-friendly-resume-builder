import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import PropTypes from 'prop-types';
import { createTailoringDraftSession } from '../src/utils/tailoringDraftSession.js';
import { componentHarness } from './helpers/componentHarness.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const record = (runId = 'run-a') => ({ userId: 'account-a', runId, stage: 'review', decisions: { summary: { choice: 'edited', text: 'Private candidate wording.' } } });

test('tailoring sessions isolate owners and flows and reject obsolete run writes and clears', () => {
  const session = createTailoringDraftSession('account-a');
  assert.equal(session.write('quick', 'account-a', record()), true);
  assert.equal(session.read('quick', 'account-b'), null);
  assert.equal(session.write('quick', 'account-b', record()), false);
  assert.equal(session.write('unknown', 'account-a', record()), false);
  assert.equal(session.read('enhanced', 'account-a'), null);
  session.write('quick', 'account-a', record('run-b'));
  assert.equal(session.write('quick', 'account-a', record(), 'run-a'), false);
  assert.equal(session.clear('quick', 'account-a', 'run-a'), false);
  assert.equal(session.read('quick', 'account-a').runId, 'run-b');
  assert.equal(session.clear('quick', 'account-a', 'run-b'), true);
  assert.equal(session.hasPending(), false);
});

test('subscriptions update remounted consumers, unsubscribe cleanly, and logout rejects late results', () => {
  const session = createTailoringDraftSession('account-a');
  let notifications = 0;
  const stop = session.subscribe(() => { notifications += 1; });
  session.write('quick', 'account-a', record());
  stop();
  session.write('quick', 'account-a', { ...record(), stage: 'resolved' }, 'run-a');
  assert.equal(notifications, 1);
  session.subscribe(() => { notifications += 1; });
  session.deactivate();
  assert.equal(session.read('quick', 'account-a'), null);
  assert.equal(session.write('quick', 'account-a', record(), 'run-a'), false);
  session.subscribe(() => { notifications += 1; });
  session.activate();
  assert.equal(session.hasPending(), false);
  session.write('quick', 'account-a', record());
  assert.equal(notifications, 1);
});

test('review sessions never persist private wording to browser storage', () => {
  const storage = { getItem() { assert.fail('Persistent read'); }, setItem() { assert.fail('Persistent write'); }, removeItem() { assert.fail('Persistent delete'); } };
  const { exports } = loadEdgeFunction('src/utils/tailoringDraftSession.js', { globals: { window: { localStorage: storage, sessionStorage: storage }, localStorage: storage, sessionStorage: storage } });
  const session = exports.createTailoringDraftSession('account-a');
  session.write('quick', 'account-a', record());
  assert.equal(session.read('quick', 'account-a').decisions.summary.text, 'Private candidate wording.');
  session.clear('quick', 'account-a', 'run-a');
  session.deactivate();
});

test('provider keeps same-account memory, warns on reload, and destroys it on account change or unmount', () => {
  let user = { id: 'account-a' };
  const events = new Map();
  const app = componentHarness('src/context/TailoringDraftContext.jsx', {
    exportName: 'TailoringDraftProvider', props: { children: 'Routes' },
    globals: { window: { addEventListener: (name, callback) => events.set(name, callback), removeEventListener: (name) => events.delete(name) } },
    imports: { './AuthContext': { useAuth: () => ({ user }) }, '../utils/tailoringDraftSession': { createTailoringDraftSession }, 'prop-types': { default: PropTypes } },
  });
  const first = app.render().props.value;
  let warnings = 0;
  const event = { preventDefault() { warnings += 1; }, returnValue: undefined };
  events.get('beforeunload')(event);
  assert.equal(warnings, 0);
  first.write('quick', 'account-a', record());
  events.get('beforeunload')(event);
  assert.equal(warnings, 1);
  assert.equal(event.returnValue, '');
  user = { id: 'account-a', token: 'refresh' };
  assert.equal(app.render().props.value, first);
  user = { id: 'account-b' };
  const second = app.render().props.value;
  assert.equal(first.hasPending(), false);
  assert.equal(first.write('quick', 'account-a', record()), false);
  assert.equal(second.read('quick', 'account-b'), null);
  app.unmount();
  assert.equal(events.size, 0);
});

test('tailoring provider surrounds routes inside the account reset boundary and activates before child effects', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.indexOf('<AccountSessionBoundary>') < app.indexOf('<TailoringDraftProvider>'));
  assert.ok(app.indexOf('<TailoringDraftProvider>') < app.indexOf('<Routes>'));
  assert.ok(app.indexOf('</Routes>') < app.indexOf('</TailoringDraftProvider>'));
  assert.ok(app.indexOf('</TailoringDraftProvider>') < app.indexOf('</AccountSessionBoundary>'));
  const source = readFileSync(new URL('../src/context/TailoringDraftContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /useLayoutEffect\(\(\) => \{\s*drafts\.activate\(\)/);
});
