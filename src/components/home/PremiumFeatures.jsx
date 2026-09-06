import React from 'react';
import { motion } from 'framer-motion';
import { STRIPE_PLAN_CONFIG, formatStripePrice } from '../../config/stripePlans';
import AnimatedElement from '../ui/AnimatedElement';
import Button from '../ui/Button';
import { fadeInUp, scaleIn } from '../../utils/animationVariants';

const PremiumFeatures = () => {
  return (
    <div className="py-16 bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="text-3xl font-bold text-center mb-4">Supercharge Your Job Hunt with Premium AI Tools</h2>
          <p className="text-center text-gray-600 dark:text-slate-400 mb-12 max-w-3xl mx-auto">
            Go beyond basic resume building. Our Premium plan unlocks advanced AI capabilities to craft highly targeted resumes that impress employers and accelerate your job search.
          </p>
        </AnimatedElement>

        <AnimatedElement
          variants={scaleIn}
          viewportOptions={{ once: true, amount: 0.2 }}
        >
          <motion.div
            className="bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-slate-700/30 overflow-hidden transition-shadow duration-200 ease-out hover:shadow-xl will-change-transform"
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">Premium AI Suite</h3>
                <motion.div
                  className="bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium transition-colors hover:bg-blue-200 dark:hover:bg-blue-500/20"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  Optional upgrade
                </motion.div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span><strong>AI-assisted drafts:</strong> Use your profile and a job description to draft relevant wording. Review every suggestion before applying. Up to 30 AI drafts or enhancements per month.</span>
                </li>
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Unlimited saved resumes: Keep versions for different applications. Manual editing is unlimited; AI generations use your monthly quota.</span>
                </li>
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>ATS and keyword guidance: Review common formatting issues and compare your resume with the job description. Scores are guidance, not a guarantee.</span>
                </li>
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority support: Get help with the product, your subscription, and billing through our published support channels.</span>
                </li>
              </ul>

              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="text-3xl font-bold mb-2 sm:mb-0">{formatStripePrice(STRIPE_PLAN_CONFIG.premium_monthly.amount)}<span className="text-lg font-normal text-gray-600 dark:text-slate-400">/month</span></div>
                <div className="sm:ml-auto">
                  <Button as="link" to="/pricing" size="lg">View All Plans</Button>
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
