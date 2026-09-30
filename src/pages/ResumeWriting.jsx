import React from 'react';
import { Link } from 'react-router-dom';
import { PageHero } from '../components/ui';
import Button from '../components/ui/Button';
import ResumebleLink from '../components/partners/ResumebleLink';
import { RESUMEBLE_DISCLOSURE } from '../config/resumeblePartner';
import { useAuth } from '../context/AuthContext';

const cardClass = 'flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7 dark:border-slate-700 dark:bg-slate-800';

const ResumeWriting = () => {
  const { user } = useAuth();

  return (
    <div>
      <PageHero
        eyebrow="Resume help, your way"
        title="Find the right resume help for you."
        lead="Build it yourself, get help with one application, or work with a professional writer. Choose the support that fits your experience, budget, and next role."
        titleId="resume-writing-page-title"
        wide
      />
      <div className="app-page max-w-6xl space-y-10">
        <aside className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-relaxed text-gray-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-slate-300">
          <p>{RESUMEBLE_DISCLOSURE}</p>
          <p className="mt-1">This guide compares our own tools and concierge service with one affiliate partner. It is not an independent ranking of every resume-writing service.</p>
        </aside>

        <section aria-label="Compare resume help options" className="grid gap-6 lg:grid-cols-3">
          <article className={cardClass}>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">ResumeATS · Do it yourself</p>
            <h2 className="mt-3 text-2xl font-bold">Free resume builder</h2>
            <p className="mt-4 text-3xl font-bold">$0</p>
            <p className="mt-3 text-gray-700 dark:text-slate-300">A good fit when you can write your own content and want a clear layout, editing tools, and downloadable files.</p>
            <ul className="mb-6 mt-5 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-slate-300">
              <li>You write and review your resume.</li>
              <li>Five core templates and PDF/Word export.</li>
              <li>Save up to three resumes on the free plan.</li>
            </ul>
            <div className="mt-auto">
              <Button as="link" to={user ? '/builder' : '/signup?plan=free'} className="w-full" animate={false}>Build my resume free</Button>
            </div>
          </article>

          <article className={cardClass}>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">ResumeATS · One application</p>
            <h2 className="mt-3 text-2xl font-bold">Concierge resume help</h2>
            <p className="mt-4 text-3xl font-bold">$99 <span className="text-sm font-normal text-gray-600 dark:text-slate-400">one-time service</span></p>
            <p className="mt-3 text-gray-700 dark:text-slate-300">A good fit when you want help tailoring your existing experience to one specific job posting.</p>
            <ul className="mb-6 mt-5 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-slate-300">
              <li>One resume for one target job.</li>
              <li>You approve every factual and wording change.</li>
              <li>Availability, scope, and payment are confirmed before work starts.</li>
            </ul>
            <div className="mt-auto">
              <Button as="link" to="/contact?offer=concierge" variant="outline" className="w-full" animate={false}>Request a $99 slot</Button>
            </div>
          </article>

          <article className={`${cardClass} border-blue-200 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/5`}>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Resumeble · Affiliate partner</p>
            <h2 className="mt-3 text-2xl font-bold">Professional resume writing</h2>
            <p className="mt-4 text-xl font-semibold">Paid writing packages</p>
            <p className="mt-3 text-gray-700 dark:text-slate-300">A good fit when you want a fuller rewrite or help explaining a career change, working directly with a writer.</p>
            <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-slate-300">
              <li>A separate service provided by Resumeble.</li>
              <li>Resume, cover-letter, and LinkedIn options.</li>
              <li>Check current inclusions, revisions, and pricing on its site.</li>
            </ul>
            <p className="mb-4 mt-5 text-sm text-gray-600 dark:text-slate-400">{RESUMEBLE_DISCLOSURE}</p>
            <ResumebleLink source="guide" className="mt-auto w-full" />
          </article>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-2xl font-bold">When is paid resume help worth considering?</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold">Start with the free builder if...</h3>
              <p className="mt-2 text-gray-700 dark:text-slate-300">You know your target role, have examples of your work, and can explain your experience clearly. Start with a readable layout and tailor it using the employer&apos;s instructions.</p>
              <Link to="/learn" className="mt-3 inline-flex min-h-[48px] items-center font-semibold text-blue-700 underline dark:text-blue-300">Read our ATS resume guide</Link>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Consider a writer if...</h3>
              <p className="mt-2 text-gray-700 dark:text-slate-300">You struggle to describe your achievements, are changing careers, or need help choosing what to include. Before paying, ask about the writer&apos;s relevant experience, revision limits, delivery schedule, and refund terms.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="resume-help-questions">
          <h2 id="resume-help-questions" className="text-2xl font-bold">Before you choose</h2>
          <div>
            <h3 className="text-lg font-semibold">Who handles a Resumeble order?</h3>
            <p className="mt-2 text-gray-700 dark:text-slate-300">You order, pay, and work with Resumeble on its website. Its service, privacy, cancellation, and refund terms apply. ResumeATS does not transfer your saved resumes or account details as part of this referral.</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Do I have to use the partner service?</h3>
            <p className="mt-2 text-gray-700 dark:text-slate-300">No. The free ResumeATS builder remains available. Premium AI+ is also an option if you want drafting assistance and prefer to review and edit the resume yourself.</p>
            <Link to="/pricing" className="mt-2 inline-flex min-h-[48px] items-center font-semibold text-blue-700 underline dark:text-blue-300">Compare ResumeATS plans</Link>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Can a resume guarantee an interview?</h3>
            <p className="mt-2 text-gray-700 dark:text-slate-300">A resume, keyword score, or formatting choice cannot guarantee a hiring decision. If a writing package advertises a guarantee, read its exact eligibility and remedy terms before buying. Always approve the facts and review the final document yourself.</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ResumeWriting;
