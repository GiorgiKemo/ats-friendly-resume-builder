import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';

function loadPasswordService({ session = async () => ({ data: { session: { access_token: 'token-a' } } }), verify = async () => ({ data: { user: { id: 'account-a' } } }), request = async () => Response.json({ id: 'account-a' }) } = {}) {
  const requests = [];
  const verifiedTokens = [];
  const { exports } = loadEdgeFunction('src/services/passwordRecoveryService.js', {
    imports: { './supabase': {
      supabaseUrl: 'https://configured-project.invalid', supabasePublishableKey: 'fixture-public-key',
      supabase: { auth: {
        getSession: session,
        getUser: (token) => { verifiedTokens.push(token); return verify(token); },
        updateUser: () => { throw new Error('Mutable-session password mutation is forbidden'); },
        signOut: () => { throw new Error('Signing out the current account is forbidden'); },
      } },
    } },
    fetch: (url, options) => { requests.push({ url, options }); return request(url, options); },
  });
  return { ...exports, requests, verifiedTokens };
}

test('password mutation pins the validated JWT even if global session state changes during verification', async () => {
  const verification = deferred();
  let currentToken = 'token-a';
  const service = loadPasswordService({
    session: async () => ({ data: { session: { access_token: currentToken } } }),
    verify: () => verification.promise,
  });
  const pending = service.updateRecoveryPassword('fixture-only-password', 'account-a');
  await new Promise((resolve) => setImmediate(resolve));
  currentToken = 'token-b';
  verification.resolve({ data: { user: { id: 'account-a' } } });
  await pending;
  assert.deepEqual(service.verifiedTokens, ['token-a']);
  assert.equal(service.requests.length, 1);
  assert.equal(service.requests[0].url, 'https://configured-project.invalid/auth/v1/user');
  assert.equal(service.requests[0].options.headers.Authorization, 'Bearer token-a');
  assert.equal(service.requests[0].options.headers.apikey, 'fixture-public-key');
  assert.deepEqual(JSON.parse(service.requests[0].options.body), { password: 'fixture-only-password' });
});

test('password mutation rejects another verified user, missing sessions, and verification errors before PUT', async () => {
  for (const options of [
    { verify: async () => ({ data: { user: { id: 'account-b' } } }) },
    { session: async () => ({ data: { session: null } }) },
    { session: async () => ({ error: new Error('Session unavailable') }) },
    { verify: async () => ({ data: { user: null }, error: new Error('Expired token') }) },
  ]) {
    const service = loadPasswordService(options);
    await assert.rejects(service.updateRecoveryPassword('fixture-only-password', 'account-a'));
    assert.equal(service.requests.length, 0);
  }
});

test('password mutation cancels before PUT if account or page changes during token validation', async () => {
  const verification = deferred();
  let active = true;
  const service = loadPasswordService({ verify: () => verification.promise });
  const pending = service.updateRecoveryPassword('fixture-only-password', 'account-a', {
    assertCurrentRequest: () => { if (!active) throw new Error('Request cancelled'); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  active = false;
  verification.resolve({ data: { user: { id: 'account-a' } } });
  await assert.rejects(pending, /cancelled/);
  assert.equal(service.requests.length, 0);
});

test('password mutation surfaces Auth API errors and transport failures', async () => {
  for (const [request, expected] of [
    [async () => Response.json({ msg: 'Password does not meet requirements' }, { status: 422 }), /requirements/],
    [async () => { throw new Error('Offline'); }, /Offline/],
    [async () => new Response('not JSON', { status: 503 }), /Could not update/],
  ]) {
    const service = loadPasswordService({ request });
    await assert.rejects(service.updateRecoveryPassword('fixture-only-password', 'account-a'), expected);
  }
});

function setupPage({ recovery = false } = {}) {
  let user = { id: 'account-a' };
  const loads = [];
  const writes = [];
  const app = componentHarness('src/pages/UpdatePassword.jsx', {
    imports: {
      '../context/AuthContext': { useAuth: () => ({ user, loading: false }) },
      '../services/supabase': { supabase: { auth: {
        getSession: () => { const request = deferred(); loads.push(request); return request.promise; },
        setSession: () => { throw new Error('Only the app recovery bridge may establish URL sessions'); },
        updateUser: () => { throw new Error('Must use token-bound password service'); },
        signOut: () => { throw new Error('Must not sign out a potentially different current account'); },
      } } },
      '../services/passwordRecoveryService': { updateRecoveryPassword: (...args) => { const request = deferred(); writes.push({ ...request, args }); return request.promise; } },
      '../utils/authRecovery': { extractRecoverySessionFromUrl: () => recovery ? { accessToken: 'token-a' } : null },
      '../components/ui/Input': { default: 'Input' }, '../components/ui/Button': { default: 'Button' },
    },
  });
  app.render();
  const field = (id) => find(app.render(), (node) => node.props?.id === id);
  const button = (label) => find(app.render(), (node) => node.type === 'Button' && textContent(node) === label);
  const form = () => find(app.render(), (node) => node.type === 'form');
  const fill = () => {
    field('password').props.onChange({ target: { value: 'fixture-only-password' } });
    field('confirmPassword').props.onChange({ target: { value: 'fixture-only-password' } });
  };
  return { ...app, loads, writes, field, button, form, fill, setAccount: () => { user = { id: 'account-b' }; app.render(); } };
}

const ready = async (app) => {
  app.loads[0].resolve({ data: { session: { user: { id: 'account-a' } } } });
  await app.flush();
};

test('reset page reports bootstrap errors with retry instead of leaving a pending spinner', async () => {
  const app = setupPage();
  app.loads[0].reject(new Error('Lock wait failed'));
  await app.flush();
  assert.match(textContent(app.render()), /could not verify/);
  app.button('Try again').props.onClick();
  app.render();
  app.loads[1].resolve({ data: { session: { user: { id: 'account-a' } } } });
  await app.flush();
  assert.ok(app.form());
  assert.equal(app.field('password').props.autoComplete, 'new-password');
  assert.equal(app.field('confirmPassword').props.autoComplete, 'new-password');
  assert.equal(find(app.render(), (node) => node.type === 'h1').props.children, 'Set New Password');
});

test('reset page leaves URL recovery establishment exclusively to the app bridge', () => {
  const app = setupPage({ recovery: true });
  assert.equal(app.loads.length, 0);
  assert.equal(app.form(), undefined);
  assert.match(textContent(app.render()), /Verifying/);
});

test('reset page submits once and confirms success without signing out or navigating another account', async () => {
  const app = setupPage();
  await ready(app);
  app.fill();
  const submit = app.form().props.onSubmit;
  const event = { preventDefault() {} };
  const pending = submit(event);
  await submit(event);
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].args[1], 'account-a');
  assert.doesNotThrow(app.writes[0].args[2].assertCurrentRequest);
  app.writes[0].resolve({ id: 'account-a' });
  await pending;
  assert.match(textContent(app.render()), /Password updated/);
  assert.equal(app.button('Return to dashboard').props.to, '/dashboard');
  assert.equal(app.form(), undefined);
});

test('reset page preserves entered passwords after a failed update and allows retry', async () => {
  const app = setupPage();
  await ready(app);
  app.fill();
  const pending = app.form().props.onSubmit({ preventDefault() {} });
  app.writes[0].reject(new Error('Password requirements not met'));
  await pending;
  assert.match(textContent(app.render()), /requirements/);
  assert.equal(app.field('password').props.value, 'fixture-only-password');
  assert.equal(app.button('Update Password').props.disabled, false);
});

test('account changes and unmount invalidate pending reset writes and their success/error results', async () => {
  for (const unmount of [false, true]) {
    for (const fail of [false, true]) {
      const app = setupPage();
      await ready(app);
      app.fill();
      const pending = app.form().props.onSubmit({ preventDefault() {} });
      if (unmount) app.unmount();
      else app.setAccount();
      assert.throws(app.writes[0].args[2].assertCurrentRequest, /changed/);
      if (fail) app.writes[0].reject(new Error('Old account error'));
      else app.writes[0].resolve({ id: 'account-a' });
      await pending;
      assert.doesNotMatch(textContent(app.render()), /Password updated|Old account error/);
    }
  }
});

test('late reset bootstrap results cannot restore another account form', async () => {
  const app = setupPage();
  app.setAccount();
  app.loads[0].resolve({ data: { session: { user: { id: 'account-a' } } } });
  await app.flush();
  assert.equal(app.form(), undefined);
  app.loads[1].resolve({ data: { session: null } });
  await app.flush();
  assert.match(textContent(app.render()), /Reset Link Invalid/);
});
