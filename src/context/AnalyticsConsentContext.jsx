import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ANALYTICS_CONSENT_EVENT,
  clearAnalyticsConsent,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from '../services/analyticsConsent';

const AnalyticsConsentContext = createContext(null);

export function AnalyticsConsentProvider({ children }) {
  const [consent, setConsent] = useState(() => getAnalyticsConsent());

  useEffect(() => {
    const refresh = () => setConsent(getAnalyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const updateConsent = useCallback((next) => {
    setConsent(setAnalyticsConsent(next));
  }, []);

  const resetConsent = useCallback(() => {
    setConsent(clearAnalyticsConsent());
  }, []);

  return (
    <AnalyticsConsentContext.Provider value={{
      consent,
      acceptAnalytics: () => updateConsent('granted'),
      declineAnalytics: () => updateConsent('denied'),
      resetAnalyticsConsent: resetConsent,
    }}>
      {children}
    </AnalyticsConsentContext.Provider>
  );
}

export function useAnalyticsConsent() {
  const context = useContext(AnalyticsConsentContext);
  if (!context) throw new Error('useAnalyticsConsent must be used within an AnalyticsConsentProvider');
  return context;
}
