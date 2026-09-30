// Generated in Awin Link Builder for the joined ResumeATS account on 2026-09-30.
const RESUMEBLE_REFERRAL_URL = 'https://www.awin1.com/cread.php?awinmid=81719&awinaffid=3110649&clickref=resumeats_home&ued=https%3A%2F%2Fwww.resumeble.com%2F';

export const getResumebleReferralUrl = (source = 'guide') => {
  const url = new URL(RESUMEBLE_REFERRAL_URL);
  url.searchParams.set('clickref', `resumeats_${source}`);
  return url.toString();
};

export const RESUMEBLE_DISCLOSURE = 'Affiliate disclosure: ResumeATS may earn a commission if you purchase through our Resumeble link.';
