import { getAnalyticsConsent } from './analyticsConsent.js';

const trackGoogleAnalyticsEvent = (eventName, properties = {}) => {
  if (getAnalyticsConsent() !== 'granted' || typeof window === 'undefined' || typeof window.gtag !== 'function') return false;

  try {
    window.gtag('event', eventName, properties);
    return true;
  } catch {
    return false;
  }
};

export const trackResumeExport = (format) => {
  trackGoogleAnalyticsEvent('resume_exported', { format: String(format || 'unknown') });
};
