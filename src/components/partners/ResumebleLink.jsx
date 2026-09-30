import React from 'react';
import { getResumebleReferralUrl } from '../../config/resumeblePartner';
import { trackGoogleAnalyticsEvent } from '../../services/analyticsService';

const ResumebleLink = ({ source, children = 'View Resumeble packages', className = '' }) => (
  <a
    href={getResumebleReferralUrl(source)}
    target="_blank"
    rel="sponsored noopener noreferrer"
    className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${className}`}
    onClick={() => trackGoogleAnalyticsEvent('affiliate_outbound_click', { partner: 'resumeble', source })}
  >
    {children}
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M7 7h10v10" />
    </svg>
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

export default ResumebleLink;
