import React from 'react';
import { Link } from 'react-router-dom';
import ResumebleLink from './ResumebleLink';
import { RESUMEBLE_DISCLOSURE } from '../../config/resumeblePartner';

const ResumeblePartnerCard = ({ source }) => (
  <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.03] sm:p-8 dark:border-slate-700 dark:bg-slate-900">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Resumeble · Affiliate partner</p>
    <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Prefer a professional to write your resume?</h2>
    <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
      Work directly with a writer on a fuller resume rewrite, with cover-letter and LinkedIn options available through Resumeble.
    </p>
    <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
      Resumeble handles the service and payment. Check its current packages, prices, and terms before ordering.
    </p>
    <p className="mb-4 mt-5 text-sm text-gray-600 dark:text-slate-400">{RESUMEBLE_DISCLOSURE}</p>
    <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3">
      <ResumebleLink source={source} />
      <Link to="/resume-writing" className="inline-flex min-h-[48px] items-center font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
        Compare your options
      </Link>
    </div>
  </section>
);

export default ResumeblePartnerCard;
