import React from 'react';
import EnhancedAIGenerator from './EnhancedAIGenerator.jsx';

const AIResumeGenerator = () => (
  <div>
    <div className="mb-8 text-center">
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Tailor your resume. Review every change.
      </h1>
      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
        Use your saved career facts and a target job to get wording suggestions. Keep or edit each change, then save your reviewed resume.
      </p>
    </div>

    <EnhancedAIGenerator />
  </div>
);

export default AIResumeGenerator;
