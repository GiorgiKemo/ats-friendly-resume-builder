import React from 'react';
import { useNavigate } from 'react-router-dom'; // Removed Link
import { motion } from 'framer-motion';
import Button from '../ui/Button';
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInUp } from '../../utils/animationVariants';
import { useAuth } from '../../context/AuthContext';
import { useResume, initialResumeState } from '../../context/ResumeContext.tsx'; // Import useResume and initialResumeState

const CTASection = () => {
  const { user } = useAuth();
  const { updateCurrentResume } = useResume(); // Get updateCurrentResume instead
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (user) {
      // If user is logged in, reset resume state and go to builder
      updateCurrentResume(initialResumeState, false); // Call updateCurrentResume, autosave false
      navigate('/builder');
    } else {
      // If user is not logged in, go to signup
      navigate('/signup');
    }
  };

  return (
    <div className="py-16 bg-indigo-900 text-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <AnimatedElement variants={fadeInUp}>
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Ready to Land More Interviews?</h2>
            <p className="text-lg text-indigo-100 mb-8">
              Stop letting opportunities slip away. Our smart resume builder helps you craft a professional, ATS-optimized resume that gets you noticed by hiring managers. Start for free and see the difference! Unlock advanced AI tools with our Premium plan to supercharge your results.
            </p>
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Button
                size="lg"
                variant="ghost"
                onClick={handleGetStarted}
                className="!bg-white !text-blue-700 hover:!bg-indigo-50 hover:!text-indigo-900 font-bold px-8 py-3 text-lg border-2 border-blue-200"
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
