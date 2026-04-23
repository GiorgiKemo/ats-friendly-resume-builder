import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { TouchLink } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { useResume, initialResumeState } from '../../context/ResumeContext.tsx';
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInLeft, fadeInRight } from '../../utils/animationVariants';

const HeroSection = () => {
  const { user } = useAuth();
  const { updateCurrentResume } = useResume();
  const navigate = useNavigate();
  const [showIllustrationFallback, setShowIllustrationFallback] = useState(false);

  const handleStartBuilding = (e) => {
    if (!user) {
      e.preventDefault();
      toast('Please sign in or create an account to start building your resume.');
      navigate('/signin');
    } else {
      updateCurrentResume(initialResumeState, false);
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
                ease: 'easeOut',
                type: 'tween'
              }}
            >
              {showIllustrationFallback ? (
                <div className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-white/90 p-8 shadow-[0_24px_48px_rgba(79,70,229,0.14)] dark:border-slate-700 dark:bg-slate-900/90">
                  <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400" />
                  <div className="mb-6 mt-4 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-500/15" />
                    <div className="flex-1 space-y-3">
                      <div className="h-3 w-2/3 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-1/3 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 w-24 rounded-full bg-blue-500/70" />
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-11/12 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-10/12 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="h-4 w-20 rounded-full bg-indigo-500/70" />
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-4/5 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-4">
                      <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800" />
                      <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    </div>
                  </div>
                </div>
              ) : (
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
                    onError={() => {
                      setShowIllustrationFallback(true);
                    }}
                  />
                </picture>
              )}
            </motion.div>
          </AnimatedElement>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
