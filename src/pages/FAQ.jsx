import React, { useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import { PageHero } from '../components/ui';
import { filterFaqItems } from '../utils/faqSearch';

const FAQ_ITEMS = [
  {
    question: 'What exactly is an "ATS-friendly" resume?',
    answer:
      'An ATS-friendly resume is structured so Applicant Tracking Systems can parse it correctly. Clear headings, standard formatting, relevant keywords, and simple layouts make it easier for both software and recruiters to read.',
  },
  {
    question: 'How does ResumeATS help my resume get through ATS screeners?',
    answer:
      'ResumeATS focuses on clean templates, keyword-friendly editing, and export options that keep your resume readable. The platform is built to avoid the common formatting mistakes that often break parsing.',
  },
  {
    question: 'What does the AI Resume Generator do?',
    answer:
      'The Premium AI tools analyze your target role and job description to help draft stronger resume content. They are designed to accelerate tailoring and brainstorming, but you should still review and personalize the final result.',
  },
  {
    question: 'What are the limits of the Basic plan?',
    answer:
      'The Basic plan lets you create and store up to 3 resumes. It includes the core builder, simple resume templates, and export tools so you can get started before upgrading.',
  },
  {
    question: 'What file formats can I export my resume in?',
    answer:
      'You can export resumes in PDF and DOCX. Follow the file requirements in the job posting and review the downloaded document before submitting it. PDF currently uses a clean text layout rather than an exact copy of every on-screen template; if your writing system is unsupported in PDF, use DOCX.',
  },
  {
    question: 'How can ResumeATS help me tailor a resume for a specific job?',
    answer:
      'You can paste a job description or import one from the browser extension. ResumeATS then helps align your title, skills, wording, and AI-generated suggestions with that specific role.',
  },
  {
    question: 'How do you protect my personal information?',
    answer:
      'ResumeATS stores account and resume data in Supabase with authentication, access controls, and audit-friendly backend logic. Sensitive integrations should only expose the minimum data needed for the current feature.',
  },
  {
    question: 'How do I cancel a Premium subscription?',
    answer:
      'You can manage or cancel your subscription from the subscription management screen tied to your Stripe billing setup. Access continues until the end of the active billing cycle.',
  },
  {
    question: 'What support is available if I need help?',
    answer:
      'ResumeATS includes guides, in-product tips, email support, and the published support phone line for premium billing or account issues. The Contact page now submits requests directly into the app support queue.',
  },
  {
    question: 'When should I update my resume?',
    answer:
      'Update your resume whenever you gain new skills, finish meaningful work, change roles, or apply for a different target position. Tailoring for each serious application gives the best results.',
  },
  {
    question: 'Does ResumeATS work on mobile devices?',
    answer:
      'Yes. The website is responsive across desktop, tablet, and mobile so you can review, edit, and download resumes from any device.',
  },
  {
    question: 'What is your refund policy for Premium plans?',
    answer:
      'If you have an unexpected billing issue or need a refund review, contact support as soon as possible. Billing requests are reviewed case by case rather than through an automatic self-serve guarantee.',
  },
];

const FAQ = () => {
  const [openQuestion, setOpenQuestion] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = useMemo(() => filterFaqItems(FAQ_ITEMS, searchQuery), [searchQuery]);

  const toggleQuestion = (question) => {
    setOpenQuestion((current) => (current === question ? null : question));
  };

  return (
    <div>
      <PageHero
        eyebrow="Help center"
        align="center"
        title="Your questions, answered."
        lead="Quick answers about ATS-friendly resumes, exports, billing, support, and the AI tools built into ResumeATS."
        titleId="faq-page-title"
      >
        <div className="relative mx-auto max-w-2xl">
          <label htmlFor="faq-search" className="sr-only">
            Search frequently asked questions
          </label>
          <input
            id="faq-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder='Ask us anything... ("ATS", "billing", "AI", "cancel")'
            className="w-full rounded-xl border border-gray-300 bg-white/90 px-4 py-3 pr-11 text-base shadow-sm backdrop-blur-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
            aria-hidden="true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <p className="mt-3 text-center text-sm text-gray-600 dark:text-slate-400">
            {searchQuery.trim()
              ? `${filteredFaqs.length} result${filteredFaqs.length === 1 ? '' : 's'} for "${searchQuery.trim()}"`
              : `${FAQ_ITEMS.length} common questions answered`}
          </p>
        </div>
      </PageHero>

      <div className="app-page max-w-3xl space-y-10">
        <section className="space-y-3">
          {filteredFaqs.map((faq) => {
            const isOpen = openQuestion === faq.question;
            const questionId = FAQ_ITEMS.indexOf(faq);
            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow duration-200 ease-out hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40"
              >
                <button
                  id={`faq-question-${questionId}`}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-700/60 sm:px-6"
                  onClick={() => toggleQuestion(faq.question)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${questionId}`}
                >
                  <span className="font-medium text-gray-900 dark:text-slate-100">{faq.question}</span>
                  <svg
                    className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform duration-200 dark:text-slate-400 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <div
                  id={`faq-answer-${questionId}`}
                  role="region"
                  aria-labelledby={`faq-question-${questionId}`}
                  aria-hidden={!isOpen}
                  hidden={!isOpen}
                  className={`${isOpen ? 'block' : 'hidden'} bg-gray-50/80 dark:bg-slate-900/40`}
                >
                  <div className="min-h-0 px-5 py-4 sm:px-6">
                    <p className="text-gray-700 dark:text-slate-300">{faq.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredFaqs.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-slate-600">
              <p className="text-gray-700 dark:text-slate-300">No FAQ entries matched that search.</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                Try a shorter keyword like &quot;billing&quot;, &quot;resume&quot;, or &quot;ATS&quot;.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-50 p-8 text-center shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:via-blue-500/5 dark:to-indigo-500/10">
          <h2 className="text-2xl font-bold sm:text-3xl">Didn&apos;t find your answer?</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-700 dark:text-slate-300">
            If your question is not covered above, send us a message through the contact page and we will follow up directly.
          </p>
          <div className="mt-6 flex justify-center">
            <Button as="link" to="/contact" variant="primary">Contact support</Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FAQ;
