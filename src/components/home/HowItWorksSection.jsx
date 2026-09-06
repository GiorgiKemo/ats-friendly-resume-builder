import React from 'react';

const steps = [
  { title: 'Start with your experience', description: 'Add your work, education, projects, and skills in the guided editor. Save a base resume you can return to.' },
  { title: 'Make it relevant', description: 'Choose a target role and highlight the experience that fits. Premium AI can help draft wording from your real background.' },
  { title: 'Review, export, apply', description: 'Check the suggestions, verify every fact, and download your resume as PDF or Word. Track your applications in one place.' },
];

export default function HowItWorksSection() {
  return (
    <section className="py-16 bg-blue-50 dark:bg-blue-900/20" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto px-4 max-w-6xl">
        <h2 id="how-it-works-heading" className="text-3xl font-bold text-center mb-4">From your experience to your next application</h2>
        <p className="text-center text-gray-600 dark:text-slate-400 mb-10 max-w-3xl mx-auto">
          A clear workflow, with you in control of the final resume.
        </p>
        <ol className="grid md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-blue-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">Step {index + 1}</p>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-gray-600 dark:text-slate-300 leading-relaxed">{step.description}</p>
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
