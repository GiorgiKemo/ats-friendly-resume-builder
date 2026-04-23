import { supabase } from './supabase';

const normalizeEmail = (email = '') => `${email}`.trim().toLowerCase();

export const subscribeToNewsletter = async (email, source = 'footer') => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({
      email: normalizedEmail,
      source,
      status: 'active',
    });

  if (error && error.code !== '23505') {
    throw error;
  }

  return {
    email: normalizedEmail,
    alreadySubscribed: error?.code === '23505',
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

  const { data, error } = await supabase
    .from('contact_inquiries')
    .insert(submission)
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data;
};
