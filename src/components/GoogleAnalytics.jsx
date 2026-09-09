import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnalyticsConsent } from '../context/AnalyticsConsentContext';
import { getAnalyticsConsent } from '../services/analyticsConsent';

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
const SCRIPT_ID = 'resumeats-google-analytics-script';

const clearAnalyticsCookies = () => {
  if (typeof document === 'undefined') return;
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (!name || (!name.startsWith('_ga') && !name.startsWith('_gid'))) continue;
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
};

const disableGoogleAnalytics = () => {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    try {
      window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied' });
    } catch {
      // Analytics teardown is best effort and must never affect navigation.
    }
  }
  document.getElementById(SCRIPT_ID)?.remove();
  window.__resumeatsGoogleAnalyticsInitialized = false;
  window.gtag = undefined;
  window.dataLayer = [];
  clearAnalyticsCookies();
};

const ensureGoogleAnalytics = () => {
  if (!MEASUREMENT_ID || typeof window === 'undefined') return false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  }

  if (!window.__resumeatsGoogleAnalyticsInitialized) {
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      send_page_view: false,
    });
    window.__resumeatsGoogleAnalyticsInitialized = true;
  }

  return true;
};

const GoogleAnalytics = () => {
  const location = useLocation();
  const { consent } = useAnalyticsConsent();
  const lastPagePathRef = useRef(null);

  useEffect(() => {
    if (consent !== 'granted' || getAnalyticsConsent() !== 'granted') {
      disableGoogleAnalytics();
      lastPagePathRef.current = null;
      return;
    }

    if (!ensureGoogleAnalytics()) return;

    const pagePath = location.pathname || '/';
    if (lastPagePathRef.current === pagePath) return;
    lastPagePathRef.current = pagePath;

    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: `${window.location.origin}${pagePath}`,
      page_path: pagePath,
      send_to: MEASUREMENT_ID,
    });
  }, [consent, location.pathname]);

  return null;
};

export default GoogleAnalytics;
