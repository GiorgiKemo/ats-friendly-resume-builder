import React from 'react';
import { motion } from 'framer-motion';
import Button from '../ui/Button';
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInUp } from '../../utils/animationVariants';
import { useAuth } from '../../context/AuthContext';
const CTASection = () => {
  const { user } = useAuth();
  return (
    <div className="py-16 bg-indigo-900 text-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Ready to build your next application?</h2>
            <p className="text-lg text-indigo-100 mb-8">
              Turn your experience into a clear, professional resume you can review and tailor for each role. Start for free, check common ATS issues, and export to PDF or Word. Premium AI can help draft wording from your background; you stay in control of every final detail.
            </p>
            <motion.div
              tabIndex={-1}
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Button
                size="lg"
                variant="ghost"
                as="link"
                to={user ? '/new' : '/signup'}
                className="!bg-white !text-blue-700 hover:!bg-indigo-50 hover:!text-indigo-900 dark:!bg-slate-100 dark:!text-blue-900 dark:hover:!bg-white font-bold px-8 py-3 text-lg border-2 border-blue-200 dark:border-blue-100"
              >
                {user ? 'Start Building Now' : 'Get Started For Free'}
              </Button>
            </motion.div>
            <p className="mt-4 text-white text-sm font-medium">
              No credit card required. Upgrade anytime.
            </p>
          </div>
        </AnimatedElement>
      </div>
    </div>
  );
};

export default CTASection;
