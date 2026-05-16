import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import { filterFaqItems } from '../utils/faqSearch';

const FAQ_ITEMS = [
  {
    question: 'What exactly is an "ATS-friendly" resume?',
    answer: 'An ATS-friendly resume is structured so Applicant Tracking Systems can parse it correctly. Clear headings, standard formatting, relevant keywords, and simple layouts make it easier for both software and recruiters to read.',
  },
  {
    question: 'How does ResumeATS help my resume get through ATS screeners?',
    answer: 'ResumeATS focuses on clean templates, keyword-friendly editing, and export options that keep your resume readable. The platform is built to avoid the common formatting mistakes that often break parsing.',
  },
  {
    question: 'What does the AI Resume Generator do?',
    answer: 'The Premium AI tools analyze your target role and job description to help draft stronger resume content. They are designed to accelerate tailoring and brainstorming, but you should still review and personalize the final result.',
  },
  {
    question: 'What are the limits of the Basic plan?',
    answer: 'The Basic plan lets you create and store up to 3 resumes. It includes the core builder, ATS-safe templates, and export tools so you can get started before upgrading.',
  },
  {
    question: 'What file formats can I export my resume in?',
    answer: 'You can export resumes in PDF and DOCX. DOCX is the most reliable option when you need text-native parsing for ATS systems, while PDF is better when you want a visually fixed version.',
  },
  {
    question: 'How can ResumeATS help me tailor a resume for a specific job?',
    answer: 'You can paste a job description or import one from the browser extension. ResumeATS then helps align your title, skills, wording, and AI-generated suggestions with that specific role.',
  },
  {
    question: 'How do you protect my personal information?',
    answer: 'ResumeATS stores account and resume data in Supabase with authentication, access controls, and audit-friendly backend logic. Sensitive integrations should only expose the minimum data needed for the current feature.',
  },
  {
    question: 'How do I cancel a Premium subscription?',
    answer: 'You can manage or cancel your subscription from the subscription management screen tied to your Stripe billing setup. Access continues until the end of the active billing cycle.',
  },
  {
    question: 'What support is available if I need help?',
    answer: 'ResumeATS includes guides, in-product tips, email support, and the published support phone line for premium billing or account issues. The Contact page now submits requests directly into the app support queue.',
  },
  {
    question: 'When should I update my resume?',
    answer: 'Update your resume whenever you gain new skills, finish meaningful work, change roles, or apply for a different target position. Tailoring for each serious application gives the best results.',
  },
  {
    question: 'Does ResumeATS work on mobile devices?',
    answer: 'Yes. The website is responsive across desktop, tablet, and mobile so you can review, edit, and download resumes from any device.',
  },
  {
    question: 'What is your refund policy for Premium plans?',
    answer: 'If you have an unexpected billing issue or need a refund review, contact support as soon as possible. Billing requests are reviewed case by case rather than through an automatic self-serve guarantee.',
  },
];

const FAQ = () => {
  const [openQuestion, setOpenQuestion] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = useMemo(() => {
    return filterFaqItems(FAQ_ITEMS, searchQuery);
  }, [searchQuery]);

  const toggleQuestion = (index) => {
    setOpenQuestion((current) => (current === index ? null : index));
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Your Questions, Answered by ResumeATS</h1>
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-3xl mx-auto">
          Find quick answers about ATS-friendly resumes, exports, billing, support, and the AI tools built into ResumeATS.
        </p>
      </div>

      <div className="mb-12">
        <div className="relative max-w-2xl mx-auto">
          <label htmlFor="faq-search" className="sr-only">Search frequently asked questions</label>
          <input
            id="faq-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder='Ask us anything... (for example: "ATS", "billing", "AI", "cancel")'
            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <span className="pointer-events-none absolute right-3 top-3 text-gray-400 dark:text-slate-500" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>
        <p className="mt-3 text-center text-sm text-gray-500 dark:text-slate-400">
          {searchQuery.trim()
            ? `${filteredFaqs.length} result${filteredFaqs.length === 1 ? '' : 's'} for "${searchQuery.trim()}"`
            : `${FAQ_ITEMS.length} common questions answered`}
        </p>
      </div>

      <div className="space-y-4 mb-12">
        {filteredFaqs.map((faq, index) => (
          <div key={faq.question} className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
            <button
              id={`faq-question-${index}`}
              className="w-full px-6 py-4 text-left bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 flex justify-between items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              onClick={() => toggleQuestion(index)}
              aria-expanded={openQuestion === index}
              aria-controls={`faq-answer-${index}`}
            >
              <span className="font-medium text-gray-900 dark:text-slate-100">{faq.question}</span>
              <svg
                className={`h-5 w-5 text-gray-500 dark:text-slate-500 transform ${openQuestion === index ? 'rotate-180' : ''} transition-transform duration-200`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div
              id={`faq-answer-${index}`}
              role="region"
              aria-labelledby={`faq-question-${index}`}
              aria-hidden={openQuestion !== index}
              className={`grid overflow-hidden bg-gray-50 dark:bg-slate-900 transition-[grid-template-rows,opacity] duration-200 ease-in-out ${openQuestion === index ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="min-h-0 px-6 py-4">
                <p className="text-gray-700 dark:text-slate-300">{faq.answer}</p>
              </div>
            </div>
          </div>
        ))}

        {filteredFaqs.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-600 px-6 py-10 text-center">
            <p className="text-gray-700 dark:text-slate-300">No FAQ entries matched that search.</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Try a shorter keyword like "billing", "resume", or "ATS".</p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Didn&apos;t Find Your Answer?</h2>
        <p className="text-lg text-gray-700 dark:text-slate-300 mb-6">
          If your question is not covered above, send us a message through the contact page and we will follow up directly.
        </p>
        <Link to="/contact">
          <Button variant="primary">Contact Support</Button>
        </Link>
      </div>
    </div>
  );
};

export default FAQ;
