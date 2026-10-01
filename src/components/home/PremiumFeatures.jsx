import React from 'react';
import { motion } from 'framer-motion';
import { STRIPE_PLAN_CONFIG, formatStripePrice } from '../../config/stripePlans';
import AnimatedElement from '../ui/AnimatedElement';
import Button from '../ui/Button';
import { fadeInUp, scaleIn } from '../../utils/animationVariants';

const PREMIUM_FEATURES = [
  {
    title: 'AI-assisted drafts',
    description: 'Use your profile and a job description to draft relevant wording. Review every suggestion before applying. Up to 30 AI drafts or enhancements per month.',
  },
  {
    title: 'Unlimited saved resumes',
    description: 'Keep versions for different applications. Manual editing is unlimited; AI generations use your monthly quota.',
  },
  {
    title: 'ATS and keyword guidance',
    description: 'Review common formatting issues and compare your resume with the job description. Scores are guidance, not a guarantee.',
  },
  {
    title: 'Priority support',
    description: 'Get help with the product, your subscription, and billing through our published support channels.',
  },
];

const PremiumFeatures = () => {
  return (
    <div className="py-12 sm:py-16 bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="text-3xl font-bold text-center mb-3 sm:mb-4">Optional AI Tools for a More Targeted Resume</h2>
          <p className="text-center text-gray-600 dark:text-slate-400 mb-8 sm:mb-12 max-w-3xl mx-auto">
            Premium adds AI-assisted drafting and keyword guidance based on your profile and job description. Review suggestions, verify every fact, and decide what belongs in your resume.
          </p>
        </AnimatedElement>

        <AnimatedElement
          variants={scaleIn}
          viewportOptions={{ once: true, amount: 0.2 }}
        >
          <motion.div
            className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-lg dark:shadow-slate-700/30 overflow-hidden transition-shadow duration-200 ease-out hover:shadow-xl will-change-transform"
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-2xl font-bold">Premium AI Suite</h3>
                <motion.div
                  className="shrink-0 whitespace-nowrap rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800 transition-colors hover:bg-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 sm:text-sm sm:normal-case sm:tracking-normal sm:font-medium"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  Optional upgrade
                </motion.div>
              </div>

              <ul className="mb-8 space-y-5">
                {PREMIUM_FEATURES.map((feature) => (
                  <li key={feature.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <p className="min-w-0 leading-relaxed text-gray-600 dark:text-slate-300">
                      <strong className="block font-semibold text-gray-900 dark:text-slate-100">{feature.title}</strong>
                      {feature.description}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-4 border-t border-gray-100 pt-6 dark:border-slate-700 sm:flex-row sm:items-center">
                <div className="text-3xl font-bold">{formatStripePrice(STRIPE_PLAN_CONFIG.premium_monthly.amount)}<span className="text-lg font-normal text-gray-600 dark:text-slate-400">/month</span></div>
                <div className="sm:ml-auto">
                  <Button as="link" to="/pricing" size="lg" className="w-full justify-center sm:w-auto">View All Plans</Button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatedElement>
      </div>
    </div>
  );
};

export default PremiumFeatures;
