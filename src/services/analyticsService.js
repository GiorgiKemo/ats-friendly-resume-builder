import { supabase } from './supabase.js';
import { getAnalyticsConsent, isAnalyticsEnvironmentAllowed } from './analyticsConsent.js';

const createEventKey = (eventName) => {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `client:${eventName}:${randomPart}`;
};

const ALLOWED_EVENTS = new Set([
  'upgrade_click',
  'resume_created',
  'resume_exported',
  'application_created',
  'checkout_started',
  'support_started',
  'support_resolved',
]);

const getBillingInterval = (planId) => (
  String(planId || '').toLowerCase().includes('year') ? 'year' : 'month'
);

export const trackGoogleAnalyticsEvent = (eventName, properties = {}) => {
  if (getAnalyticsConsent() !== 'granted' || !isAnalyticsEnvironmentAllowed() || typeof window.gtag !== 'function') return false;

  try {
    window.gtag('event', eventName, properties);
    return true;
  } catch {
    // Analytics must never block checkout or surface a console error to users.
    return false;
  }
};

export const recordAnalyticsEvent = async (eventName, properties = {}, options = {}) => {
  if (!ALLOWED_EVENTS.has(eventName)) throw new Error('Analytics event is not allowlisted');
  if (getAnalyticsConsent() !== 'granted' || !isAnalyticsEnvironmentAllowed()) return false;

  const { data, error } = await supabase.rpc('record_analytics_event', {
    p_event_key: options.eventKey || createEventKey(eventName),
    p_event_name: eventName,
    p_properties: properties,
    p_occurred_at: options.occurredAt || new Date().toISOString(),
  });

  if (error) throw error;
  return data;
};

export const trackUpgradeClick = ({ planId, provider, source = 'pricing' } = {}) => {
  const properties = {
    plan_id: String(planId || 'unknown'),
    billing_interval: getBillingInterval(planId),
    provider: String(provider || 'unknown'),
    source: String(source || 'unknown'),
  };

  trackGoogleAnalyticsEvent('upgrade_click', properties);
  void recordAnalyticsEvent('upgrade_click', properties).catch(() => undefined);
};

export const trackCheckoutStarted = ({ planId, provider, source = 'pricing' } = {}) => {
  const properties = {
    plan_id: String(planId || 'unknown'),
    billing_interval: getBillingInterval(planId),
    provider: String(provider || 'unknown'),
    source: String(source || 'unknown'),
  };

  void recordAnalyticsEvent('checkout_started', properties).catch(() => undefined);
};

export const trackSignUp = (user) => {
  if (!Array.isArray(user?.identities) || user.identities.length === 0) return false;
  return trackGoogleAnalyticsEvent('sign_up', { method: 'email' });
};

export const trackPurchase = ({ planId, provider, analyticsTransactionId } = {}) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(analyticsTransactionId || ''))
    || !['stripe', 'paypal'].includes(provider)) return;
  trackGoogleAnalyticsEvent('purchase', {
    transaction_id: `${provider}:${analyticsTransactionId}`,
    plan_id: String(planId || 'unknown'),
    provider: String(provider || 'unknown'),
  });
};

export const trackApplicationCreated = ({ status = 'applied' } = {}) => {
  const properties = { status: String(status || 'unknown') };
  trackGoogleAnalyticsEvent('application_created', properties);
  // First-party application_created is captured by the database insert trigger.
};

export const trackResumeExport = (format) => {
  const properties = { format: String(format || 'unknown') };
  trackGoogleAnalyticsEvent('resume_exported', properties);
  void recordAnalyticsEvent('resume_exported', properties).catch(() => undefined);
};
