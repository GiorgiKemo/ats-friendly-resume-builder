import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const never = () => new Promise(() => {});
function loadAuth({ failure = null, telemetry = never, extensionFailure = false } = {}) {
  const calls = [];
  let onAuthChange;
  let stateIndex = 0;
  const user = { id: 'user-1', email: 'candidate@example.com' };
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState: () => [stateIndex++ === 0 ? user : false, () => {}],
    useEffect: (callback) => callback(),
    useMemo: (callback) => callback(),
  };
  const authResult = async () => ({ data: { user }, error: failure });
  const auth = {
    onAuthStateChange: (callback) => { onAuthChange = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signInWithPassword: authResult, signUp: authResult, resend: authResult,
    signOut: async () => {
      calls.push('signOut');
      if (!failure) onAuthChange('SIGNED_OUT', null);
      return { error: failure };
    },
  };
  const extension = {
    syncBrowserAgentProfile: async (profile) => { calls.push(['sync', profile]); if (extensionFailure) throw new Error('Extension unavailable'); },
    clearBrowserAgentQueue: async () => { calls.push('clearQueue'); if (extensionFailure) throw new Error('Extension unavailable'); },
  };
  const { exports: { AuthProvider } } = loadEdgeFunction('src/context/AuthContext.jsx', {
    imports: {
      react, 'react/jsx-runtime': { jsx: (_type, props) => props },
      '../services/supabase': { supabase: { auth } },
      '../services/monitoringService': { trackSuccessfulLogin: telemetry, trackFailedLogin: telemetry, logEvent: telemetry, EVENT_TYPES: {}, SEVERITY: {} },
      '../services/browserAgentService': extension,
    },
  });
  return { value: AuthProvider({ children: null }).value, calls, onAuthChange, user };
}

test('successful login, signup and resend return while telemetry is still pending', async () => {
  const { value, user } = loadAuth();
  assert.equal((await value.signIn(user.email, 'password')).user.id, user.id);
  assert.equal((await value.signUp(user.email, 'password', 'Candidate')).user.id, user.id);
  assert.equal((await value.resendVerificationEmail(user.email)).error, null);
});

test('auth failures preserve the original error even if monitoring throws', async () => {
  const failure = new Error('Invalid login credentials');
  const { value } = loadAuth({ failure, telemetry: () => { throw new Error('Monitoring offline'); } });
  for (const action of [value.signIn, value.signUp, value.resendVerificationEmail]) {
    await assert.rejects(action('candidate@example.com', 'password'), (error) => error === failure);
  }
});

test('logout does not wait for telemetry and clears extension profile plus queue', async () => {
  const { value, calls } = loadAuth();
  await value.signOut();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[0], 'signOut');
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'sync' && call[1] === null));
  assert.ok(calls.includes('clearQueue'));
});

test('external signed-out events also clear cached extension applicant data', async () => {
  const { calls, onAuthChange } = loadAuth();
  onAuthChange('SIGNED_OUT', null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'sync' && call[1] === null));
  assert.ok(calls.includes('clearQueue'));
});

test('a missing extension cannot prevent logout or create an unhandled rejection', async () => {
  const { value } = loadAuth({ extensionFailure: true });
  await value.signOut();
  await new Promise((resolve) => setImmediate(resolve));
});
