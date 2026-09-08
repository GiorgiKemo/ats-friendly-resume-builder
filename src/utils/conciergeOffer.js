const EMPTY_FORM = {
  subject: '',
  message: '',
};

export const CONCIERGE_OFFER = 'concierge';

export const getConciergePrefill = (search = typeof window !== 'undefined' ? window.location.search : '') => {
  const params = new URLSearchParams(search);
  if (params.get('offer') !== CONCIERGE_OFFER) return null;

  return {
    subject: 'ResumeATS $99 concierge slot request',
    message: 'I would like to request the $99 resume plus one target-job tailoring slot. I will send my current resume and the job description after you confirm availability and payment details.',
  };
};

export const emptyConciergeForm = () => ({ ...EMPTY_FORM });
