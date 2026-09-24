export const ANALYTICS_CONSENT_STORAGE_KEY = 'resumeats.analytics-consent';
export const ANALYTICS_CONSENT_EVENT = 'resumeats:analytics-consent-changed';

const VALID_CONSENTS = new Set(['granted', 'denied']);
const ANALYTICS_PRODUCTION_HOSTS = new Set(['resumeats.cv', 'www.resumeats.cv']);

export const isAnalyticsEnvironmentAllowed = () => {
  if (typeof window === 'undefined') return false;

  const hostname = String(window.location?.hostname || '').toLowerCase();
  const pathname = String(window.location?.pathname || '/');
  return ANALYTICS_PRODUCTION_HOSTS.has(hostname) && !/^\/admin(?:\/|$)/i.test(pathname);
};

export const getAnalyticsRequestHeaders = () => (
  getAnalyticsConsent() === 'granted' && isAnalyticsEnvironmentAllowed()
    ? { 'X-Analytics-Consent': 'granted' }
    : {}
);

export const getAnalyticsConsent = () => {
  if (typeof window === 'undefined') return 'unknown';

  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return VALID_CONSENTS.has(stored) ? stored : 'unknown';
  } catch {
    return 'unknown';
  }
};

export const setAnalyticsConsent = (consent) => {
  const next = VALID_CONSENTS.has(consent) ? consent : 'unknown';

  if (typeof window === 'undefined') return next;

  try {
    if (next === 'unknown') window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    else window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, next);
  } catch {
    // Consent remains an in-memory decision for the current render when
    // browser storage is unavailable; analytics code still fails closed.
  }

  try {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: next })
      : { type: ANALYTICS_CONSENT_EVENT, detail: next };
    window.dispatchEvent?.(event);
  } catch {
    // A storage or event-listener failure must never enable analytics.
  }

  return next;
};

export const clearAnalyticsConsent = () => setAnalyticsConsent('unknown');
