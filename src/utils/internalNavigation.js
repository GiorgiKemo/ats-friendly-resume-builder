const SENSITIVE_NAVIGATION_PARAMS = new Set([
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'code', 'token', 'state', 'error', 'error_code', 'error_description',
]);

const stripSensitiveSearch = (search = '') => {
  const params = new URLSearchParams(search);
  [...params.keys()].forEach((key) => {
    if (SENSITIVE_NAVIGATION_PARAMS.has(key.toLowerCase())) params.delete(key);
  });
  const value = params.toString();
  return value ? `?${value}` : '';
};

const stripSensitiveHash = (hash = '') => {
  if (!hash.startsWith('#/')) {
    if (!hash.startsWith('#') || hash.length <= 1 || (!hash.includes('=') && !hash.includes('&'))) return hash;
    const sanitized = stripSensitiveSearch(`?${hash.slice(1)}`);
    return sanitized === `?${hash.slice(1)}` ? hash : sanitized ? `#${sanitized.slice(1)}` : '';
  }
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return hash;
  return `${hash.slice(0, queryIndex)}${stripSensitiveSearch(hash.slice(queryIndex))}`;
};

/**
 * Keep redirects inside the current app origin. Router state and query
 * parameters can be replayed by callers, so never pass an arbitrary URL or
 * auth/recovery token to navigate() without normalizing it first.
 */
export const getSafeInternalPath = (value, fallback = '/') => {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(value.trim(), origin);
    if (parsed.origin !== origin || !parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
      return fallback;
    }

    return `${parsed.pathname}${stripSensitiveSearch(parsed.search)}${stripSensitiveHash(parsed.hash)}`;
  } catch {
    return fallback;
  }
};
