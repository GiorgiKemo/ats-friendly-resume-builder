import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import AnimatedElement from '../ui/AnimatedElement';
import Button from '../ui/Button';
import { fadeInUp, scaleIn } from '../../utils/animationVariants';

const PremiumFeatures = () => {
  return (
    <div className="py-16 bg-gray-50">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <h2 className="text-3xl font-bold text-center mb-4">Supercharge Your Job Hunt with Premium AI Tools</h2>
          <p className="text-center text-gray-600 mb-12 max-w-3xl mx-auto">
            Go beyond basic resume building. Our Premium plan unlocks advanced AI capabilities to craft highly targeted resumes that impress employers and accelerate your job search.
          </p>
        </AnimatedElement>

        <AnimatedElement
          variants={scaleIn}
          viewportOptions={{ once: true, amount: 0.2 }}
        >
          <motion.div
            className="bg-white rounded-lg shadow-lg overflow-hidden"
            whileHover={{ boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">Premium AI Suite</h3>
                <motion.div
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
                  whileHover={{ scale: 1.05, backgroundColor: "#bfdbfe" }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  Most Popular
                </motion.div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span><strong>AI That Writes Your Full Resume Draft:</strong> Provide a job description, your target industry, and location details. Our advanced AI then crafts a complete, highly-tailored resume draft—from summary to experience—specifically for that role. (Up to 30 AI drafts/enhancements per month).</span>
                </li>
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Unlimited Tailored Resumes: Generate countless versions of your resume, perfectly customized for each job application.</span>
                </li>
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Deep ATS Analysis & Optimization: Get detailed reports and actionable insights to ensure your resume beats the screening bots every time.</span>
                </li>
                <li className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Expert Priority Support: Get faster assistance and personalized advice from our dedicated resume specialists.</span>
                </li>
              </ul>

              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="text-3xl font-bold mb-2 sm:mb-0">$9.99<span className="text-lg font-normal text-gray-600">/month</span></div>
                <Link to="/pricing" className="sm:ml-auto">
                  <Button size="lg">View All Plans</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </AnimatedElement>
      </div>
    </div>
  );
};

export default PremiumFeatures;
