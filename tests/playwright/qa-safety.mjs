import { URL } from 'node:url';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PRODUCTION_HOSTS = new Set(['resumeats.cv', 'www.resumeats.cv', 'onuxzcectniowxqtmjpg.supabase.co']);

export function requireLiveQaOptIn(env) {
  if (env.QA_ALLOW_LIVE_MUTATIONS !== '1') {
    throw new Error('Live QA is disabled. It creates accounts and data. Use test:website:full for isolated fixtures. Staging-only runs require QA_ALLOW_LIVE_MUTATIONS=1, QA_BASE_URL and QA_SUPABASE_URL.');
  }
  if (!env.QA_BASE_URL || !env.QA_SUPABASE_URL) throw new Error('Live QA requires explicit QA_BASE_URL and QA_SUPABASE_URL staging targets.');
  const targets = [env.QA_BASE_URL, env.QA_SUPABASE_URL].map((value) => new URL(value));
  for (const url of targets) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('QA targets must be HTTP(S) URLs without credentials.');
    if (PRODUCTION_HOSTS.has(url.hostname) || url.hostname.endsWith('.resumeats.cv')) throw new Error('Live QA must not run against production. Use local fixtures or an isolated staging project.');
    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) throw new Error('Remote staging QA targets must use HTTPS.');
  }
  return { appOrigin: targets[0].origin, backendOrigin: targets[1].origin };
}

export function isAllowedQaRequest(requestUrl, allowedOrigins) {
  try {
    const url = new URL(requestUrl);
    return ['data:', 'blob:', 'about:'].includes(url.protocol) || allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

export function localFixtureEnvironment(env, backendUrl) {
  const url = new URL(backendUrl);
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) throw new Error('Fixture backend must be loopback HTTP.');
  return {
    ...env,
    VITE_SUPABASE_URL: url.origin,
    VITE_SUPABASE_URL_DEV: url.origin,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'qa-local-anon-key',
    VITE_SUPABASE_PUBLISHABLE_KEY_DEV: 'qa-local-anon-key',
    VITE_SUPABASE_ANON_KEY: 'qa-local-anon-key',
    VITE_SUPABASE_ANON_KEY_DEV: 'qa-local-anon-key',
    VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_local_fixture_disabled',
    VITE_DISABLE_SYSTEM_LOGGING: 'true',
  };
}
