const EMPTY_FORM = {
  subject: '',
  message: '',
};

export const CONCIERGE_OFFER = 'concierge';
export const PRIVACY_DELETION_REQUEST = 'privacy-deletion';

export const getConciergePrefill = (search = typeof window !== 'undefined' ? window.location.search : '') => {
  const params = new URLSearchParams(search);
  if (params.get('offer') !== CONCIERGE_OFFER) return null;

  return {
    subject: 'ResumeATS $99 concierge slot request',
    message: 'I would like to request the $99 resume plus one target-job tailoring slot. I will send my current resume and the job description after you confirm availability and payment details.',
  };
};

export const getPrivacyDeletionPrefill = (search = typeof window !== 'undefined' ? window.location.search : '') => {
  const params = new URLSearchParams(search);
  if (params.get('request') !== PRIVACY_DELETION_REQUEST) return null;

  return {
    subject: 'Account and associated-data deletion request',
    message: 'I would like to request deletion of my ResumeATS account and associated data. Please confirm the request, explain any records that must be retained, and let me know when the reviewed deletion process is complete.',
  };
};

export const emptyConciergeForm = () => ({ ...EMPTY_FORM });
