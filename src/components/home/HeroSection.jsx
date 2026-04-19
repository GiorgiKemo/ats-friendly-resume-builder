import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { TouchLink } from '../ui'; // Removed TouchButton
import { useAuth } from '../../context/AuthContext';
import { useResume, initialResumeState } from '../../context/ResumeContext.tsx'; // Import useResume and initialResumeState
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInLeft, fadeInRight } from '../../utils/animationVariants';

const HeroSection = () => {
  const { user } = useAuth();
  const { updateCurrentResume } = useResume(); // Get updateCurrentResume instead
  const navigate = useNavigate();

  const handleStartBuilding = (e) => {
    if (!user) {
      e.preventDefault();
      toast('Please sign in or create an account to start building your resume.', {
        icon: '📝',
      });
      navigate('/signin');
    } else {
      // User is logged in, reset resume state before navigating
      updateCurrentResume(initialResumeState, false); // Call updateCurrentResume, autosave false
      // Navigation will proceed via the TouchLink's `to` prop
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 py-20 lg:py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid items-start gap-12 md:gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <AnimatedElement
            className="max-w-2xl"
            variants={fadeInLeft}
          >
            <motion.h1
              className="text-4xl md:text-[3.15rem] lg:text-[3.65rem] font-bold text-gray-900 dark:text-slate-100 mb-5 leading-[1.02]"
              initial={{ opacity: 0.8, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                willChange: 'transform',
                contentVisibility: 'auto',
                contain: 'layout'
              }}
            >
              Build an ATS-Optimized Resume That Gets You Noticed.
            </motion.h1>
            <motion.p
              className="text-xl md:text-[1.55rem] text-gray-700 dark:text-slate-300 mb-9 max-w-[42rem] leading-9"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              Craft a professional, recruiter-approved resume with our easy-to-use builder and expert-designed templates. Start for free and land more interviews.
            </motion.p>
            <motion.div
              className="flex flex-col sm:flex-row gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <TouchLink
                to="/builder"
                onClick={handleStartBuilding}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-lg font-medium"
                ariaLabel="Start building your resume for free"
              >
                Start Building Free
              </TouchLink>
              <TouchLink
                to="/pricing"
                className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg text-lg font-medium"
                ariaLabel="Explore Premium AI resume tools"
              >
                Explore Premium AI Tools
              </TouchLink>
            </motion.div>
          </AnimatedElement>
          <AnimatedElement
            className="w-full lg:-mt-3 lg:justify-self-end"
            variants={fadeInRight}
          >
            <motion.div
              className="mx-auto w-full max-w-[18rem] sm:max-w-[20rem] md:max-w-[22rem] lg:max-w-[24.5rem]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.3,
                delay: 0.1,
                ease: "easeOut",
                type: "tween"
              }}
            >
              {/* Optimized Image Loading for LCP */}
              <picture>
                <source
                  media="(max-width: 768px)"
                  srcSet="/resume-illustration-mobile.svg"
                  width="320"
                  height="378"
                />
                <img
                  src="/resume-illustration-desktop.svg"
                  alt="ResumeATS"
                  width="440"
                  height="520"
                  loading="eager"
                  fetchpriority="high"
                  decoding="async"
                  className="block w-full drop-shadow-[0_24px_48px_rgba(79,70,229,0.14)]"
                  style={{
                    contentVisibility: 'auto',
                    aspectRatio: '440/520'
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/448x336?text=Resume+Builder';
                  }}
                />
              </picture>
            </motion.div>
          </AnimatedElement>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
