import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import EnhancedAIGenerator from './EnhancedAIGenerator.jsx';
import Tooltip from '../ui/Tooltip';

const AIResumeGenerator = () => {
  const { isPremium, getRemainingAIGenerations, subscriptionData } = useSubscription();
  const remainingGenerations = getRemainingAIGenerations();
  const generationsLimit = subscriptionData?.aiGenerationsLimit || 0;

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-slate-100 mb-3">
          Tailor your resume. Review every change.
        </h1>
        <p className="text-lg text-gray-600 dark:text-slate-300 max-w-2xl mx-auto">
          Use your saved career facts and a target job to get wording suggestions. Compare them with the source, keep or edit each change, then save your reviewed resume.
        </p>
      </div>
      <div className="flex justify-between items-center mb-6">
        {isPremium && (
          <div className="flex justify-between items-center w-full">
            <h2 className="text-lg font-medium">AI Resume Generator</h2>
            <Tooltip content={`You have ${remainingGenerations} out of ${generationsLimit} AI generations remaining this month.`}>
              <div className="flex items-center">
                <span className="text-sm font-medium mr-2">
                  AI Generations:
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${remainingGenerations === 0 ? 'bg-red-100 text-red-800' :
                  remainingGenerations < 5 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                  {remainingGenerations} remaining
                </span>
              </div>
            </Tooltip>
          </div>
        )}
      </div>

      <EnhancedAIGenerator />

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-md">
        <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Maximize Your AI Resume: Key Tips</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-100/90 space-y-2">
          <li>Match the role: Use job-description keywords only when they accurately describe your experience.</li>
          <li>Clarity is Key: Opt for a clean, straightforward layout that's easy for both ATS and human eyes to scan.</li>
          <li>Describe your impact: Include numbers only when your own records support both the value and what it measures.</li>
          <li>Review every change: AI suggestions can be wrong. Keep the source wording or confirm the exact wording you want to use.</li>
          <li>Professional Presentation: Choose one of our ATS-friendly templates for a polished, modern look.</li>
        </ul>
      </div>
    </div>
  );
};

export default AIResumeGenerator;
