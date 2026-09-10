/**
 * Keep redirects inside the current app origin. Router state and query
 * parameters can be replayed by callers, so never pass an arbitrary URL to
 * navigate() without normalizing it first.
 */
export const getSafeInternalPath = (value, fallback = '/') => {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(value.trim(), origin);
    if (parsed.origin !== origin || !parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};
