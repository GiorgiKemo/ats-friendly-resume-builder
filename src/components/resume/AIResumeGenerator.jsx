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
        <h1 className="text-3xl font-bold text-gray-800 mb-3">
          Craft Your Next Career Move with AI Precision
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Leverage our intelligent AI to generate compelling, ATS-optimized resume content tailored to your target job. Simply provide the details, and let our AI assist you in highlighting your strengths and experiences effectively.
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

      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <h3 className="font-medium text-blue-800 mb-2">Maximize Your AI Resume: Key Tips</h3>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-2">
          <li>Tailor to the Target: Always incorporate keywords directly from the job description you're applying for.</li>
          <li>Clarity is Key: Opt for a clean, straightforward layout that's easy for both ATS and human eyes to scan.</li>
          <li>Quantify Your Impact: Use numbers and data to showcase your accomplishments (e.g., "Increased sales by 15%").</li>
          <li>Make It Yours: While our AI provides a strong foundation, always review, personalize, and add your unique voice to the content.</li>
          <li>Professional Presentation: Choose one of our ATS-friendly templates for a polished, modern look.</li>
        </ul>
      </div>
    </div>
  );
};

export default AIResumeGenerator;
