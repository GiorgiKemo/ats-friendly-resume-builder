import React from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsConsent } from '../context/AnalyticsConsentContext';

const AnalyticsConsentBanner = ({ hidden = false, compact = false }) => {
  const { consent, acceptAnalytics, declineAnalytics } = useAnalyticsConsent();

  if (hidden || consent !== 'unknown') return null;

  const wrapperClass = compact
    ? 'mx-3 mb-3 mt-1 sm:mx-6 sm:mb-4 sm:mt-2'
    : 'mx-4 mb-4 mt-2 sm:mx-6 sm:mb-5 sm:mt-3';
  const asideClass = compact
    ? 'mx-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-3.5'
    : 'mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-5';

  return (
    <div className={wrapperClass}>
      <aside
        className={asideClass}
        aria-label="Analytics preferences"
        aria-describedby="analytics-consent-description"
      >
        <div className={`flex flex-col ${compact ? 'gap-2.5' : 'gap-4'} sm:flex-row sm:items-start sm:justify-between`}>
          <div className={compact ? 'min-w-0' : 'max-w-2xl'}>
            <h2 className="text-sm font-bold">Help us improve ResumeATS</h2>
            <p id="analytics-consent-description" className={`${compact ? 'mt-0.5 text-xs leading-5' : 'mt-1 text-sm leading-6'} text-slate-600 dark:text-slate-300`}>
              Optional analytics help us understand visits and feature usage. Resume content, account fields, and form values are not sent to analytics. You can change this choice later in the <Link to="/privacy-policy" className="font-semibold text-blue-700 underline dark:text-blue-300">Privacy Policy</Link>.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <button type="button" className={`${compact ? 'rounded-lg px-2.5 py-1.5 text-xs' : 'rounded-xl px-3 py-2 text-sm'} border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800`} onClick={declineAnalytics}>
              Decline
            </button>
            <button type="button" className={`${compact ? 'rounded-lg px-2.5 py-1.5 text-xs' : 'rounded-xl px-3 py-2 text-sm'} bg-blue-600 font-semibold text-white hover:bg-blue-700`} onClick={acceptAnalytics}>
              Accept analytics
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default AnalyticsConsentBanner;
