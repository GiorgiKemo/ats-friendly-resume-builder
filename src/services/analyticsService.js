import { supabase } from './supabase.js';
import { getAnalyticsConsent } from './analyticsConsent.js';

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
  if (getAnalyticsConsent() !== 'granted' || typeof window === 'undefined' || typeof window.gtag !== 'function') return false;

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

export const trackPurchase = ({ planId, provider, transactionId } = {}) => {
  if (!transactionId) return;
  trackGoogleAnalyticsEvent('purchase', {
    transaction_id: String(transactionId),
    plan_id: String(planId || 'unknown'),
    provider: String(provider || 'unknown'),
  });
};

export const trackApplicationCreated = ({ status = 'applied' } = {}) => {
  const properties = { status: String(status || 'unknown') };
  trackGoogleAnalyticsEvent('application_created', properties);
  void recordAnalyticsEvent('application_created', properties).catch(() => undefined);
};

export const trackResumeExport = (format) => {
  const properties = { format: String(format || 'unknown') };
  trackGoogleAnalyticsEvent('resume_exported', properties);
  void recordAnalyticsEvent('resume_exported', properties).catch(() => undefined);
};
