import { supabase } from './supabase';

const normalizeEmail = (email = '') => `${email}`.trim().toLowerCase();

const invokePublicEngagement = async (action, payload) => {
  const { data, error } = await supabase.functions.invoke('public-engagement', {
    body: { action, payload },
  });

  if (error || data?.ok === false) {
    throw new Error(data?.error || error?.message || 'Request failed. Please try again later.');
  }

  return data;
};

export const subscribeToNewsletter = async (email, source = 'footer') => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  const data = await invokePublicEngagement('subscribeNewsletter', {
    email: normalizedEmail,
    source,
  });

  return {
    email: data.email || normalizedEmail,
    alreadySubscribed: Boolean(data.alreadySubscribed),
  };
};

export const submitContactInquiry = async (payload) => {
  const submission = {
    name: `${payload?.name || ''}`.trim(),
    email: normalizeEmail(payload?.email || ''),
    subject: `${payload?.subject || ''}`.trim(),
    message: `${payload?.message || ''}`.trim(),
    source: payload?.source || 'website',
  };

  if (!submission.name || !submission.email || !submission.subject || !submission.message) {
    throw new Error('Please fill out all required fields.');
  }

  return invokePublicEngagement('submitContactInquiry', submission);
};
