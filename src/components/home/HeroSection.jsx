import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TouchLink } from '../ui';
import { useAuth } from '../../context/AuthContext';
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInLeft, fadeInRight } from '../../utils/animationVariants';

const HeroSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showIllustrationFallback, setShowIllustrationFallback] = useState(false);

  const handleStartBuilding = (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/signup');
      return;
    }
    navigate('/new');
  };

  return (
    <section
      className="app-hero-viewport relative isolate overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/90 to-indigo-100/80 dark:from-[#050607] dark:via-[#070a10] dark:to-[#0c1220]"
      aria-labelledby="home-hero-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,rgba(99,102,241,0.14),transparent_55%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,rgba(59,130,246,0.12),transparent_55%)]"
        aria-hidden="true"
      />

      <div className="container relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col justify-center px-4 sm:px-6 lg:px-8">
        <div className="app-hero-grid grid w-full items-center gap-10 md:gap-12 lg:grid-cols-2 lg:gap-14 xl:gap-16">
          <AnimatedElement className="lg:max-w-[38rem]" variants={fadeInLeft}>
            <p className="app-hero-eyebrow mb-4 inline-flex rounded-full border border-blue-200/80 bg-white/70 px-3 py-1 text-sm font-semibold text-blue-800 shadow-sm backdrop-blur-sm dark:border-blue-500/30 dark:bg-slate-900/60 dark:text-blue-200">
              Free ATS-friendly resume builder
            </p>
            <motion.h1
              id="home-hero-heading"
              className="app-hero-title mb-5 font-bold text-gray-900 dark:text-slate-50"
              initial={{ opacity: 0.8, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              Build an ATS-Optimized Resume That Gets You Noticed.
            </motion.h1>
            <motion.p
              className="app-hero-lead mb-8 max-w-xl text-gray-700 dark:text-slate-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              Craft a professional, recruiter-approved resume with our easy-to-use builder and expert-designed templates. Start for free and land more interviews.
            </motion.p>
            <motion.div
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <TouchLink
                to={user ? '/new' : '/signup'}
                onClick={handleStartBuilding}
                className="app-hero-cta-primary min-h-[3.25rem] justify-center px-8 text-lg font-semibold shadow-md shadow-blue-600/25"
                ariaLabel={user ? 'Create a new resume' : 'Sign up and start your resume for free'}
              >
                {user ? 'Create a resume' : 'Start free — sign up'}
              </TouchLink>
              <TouchLink
                to="/learn"
                className="app-hero-cta-secondary min-h-[3.25rem] justify-center border-2 border-slate-300/90 bg-white/90 px-8 text-lg font-semibold text-gray-800 backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
                ariaLabel="Read simple resume tips"
              >
                Resume tips
              </TouchLink>
            </motion.div>
          </AnimatedElement>

          <AnimatedElement className="app-hero-visual flex w-full items-center justify-center lg:justify-end" variants={fadeInRight}>
            <motion.div
              className="w-full max-w-sm sm:max-w-md lg:max-w-none"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.35,
                delay: 0.1,
                ease: 'easeOut',
              }}
            >
              {showIllustrationFallback ? (
                <div className="app-hero-illustration-card relative overflow-hidden rounded-[2rem] border border-blue-100/80 bg-white/95 p-8 shadow-2xl shadow-indigo-500/10 dark:border-slate-600 dark:bg-slate-900/95">
                  <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400" />
                  <div className="mb-6 mt-3 flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-blue-100 dark:bg-blue-500/10" />
                    <div className="flex-1 space-y-3">
                      <div className="h-3.5 w-2/3 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3.5 w-1/3 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 w-28 rounded-full bg-blue-500/70" />
                    <div className="space-y-2.5">
                      <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-11/12 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-10/12 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                </div>
              ) : (
                <picture className="block w-full">
                  <source
                    media="(max-width: 768px)"
                    srcSet="/resume-illustration-mobile.svg"
                    width="320"
                    height="378"
                  />
                  <img
                    src="/resume-illustration-desktop.svg"
                    alt="Example of an ATS-friendly resume layout"
                    width="440"
                    height="520"
                    loading="eager"
                    fetchpriority="high"
                    decoding="async"
                    className="app-hero-illustration mx-auto block w-full"
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
    </section>
  );
};

export default HeroSection;
