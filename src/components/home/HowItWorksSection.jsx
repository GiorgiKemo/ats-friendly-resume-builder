import React from 'react';

const steps = [
  { title: 'Start with your experience', description: 'Add your work, education, projects, and skills in the guided editor. Save a base resume you can return to.' },
  { title: 'Make it relevant', description: 'Choose a target role and highlight the experience that fits. Premium AI can help draft wording from your real background.' },
  { title: 'Review, export, apply', description: 'Check the suggestions, verify every fact, and download your resume as PDF or Word. Track your applications in one place.' },
];

export default function HowItWorksSection() {
  return (
    <section className="py-12 sm:py-16 bg-blue-50 dark:bg-blue-900/20" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto px-4 max-w-6xl">
        <h2 id="how-it-works-heading" className="text-3xl font-bold text-center mb-4">From your experience to your next application</h2>
        <p className="text-center text-gray-600 dark:text-slate-400 mb-8 sm:mb-10 max-w-3xl mx-auto">
          A clear workflow, with you in control of the final resume.
        </p>
        <ol className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:block sm:p-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white sm:mb-4" aria-hidden="true">{index + 1}</span>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600 dark:text-slate-300 leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center text-sm text-gray-600 dark:text-slate-400">
          ATS checks are guidance, not a hiring prediction. No builder can guarantee interviews or acceptance by every system.
        </p>
      </div>
    </section>
  );
}
