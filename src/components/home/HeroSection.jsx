import React from 'react';
import { motion } from 'framer-motion';
import { TouchLink } from '../ui';
import { useAuth } from '../../context/AuthContext';
import HeroScene from '../brand/HeroScene';

const rise = (delay) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

const HIGHLIGHTS = ['5 ATS-friendly designs', 'PDF and Word export', 'You approve every AI edit'];

const HeroSection = () => {
  const { user } = useAuth();

  return (
    <section
      className="app-hero-viewport relative isolate overflow-hidden bg-gradient-to-b from-blue-50/80 via-white to-white dark:from-[#06080d] dark:via-[#070a10] dark:to-[#070a10]"
      aria-labelledby="home-hero-heading"
    >
      {/* Soft grid that fades out toward the edges */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(37,99,235,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.07)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)] dark:bg-[linear-gradient(to_right,rgba(96,165,250,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(96,165,250,0.06)_1px,transparent_1px)]"
        aria-hidden="true"
      />

      <div className="container relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="app-hero-grid grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
          <div className="lg:max-w-[36rem]">
            <motion.p
              {...rise(0)}
              className="app-hero-eyebrow mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 py-1 pl-1 pr-3 text-sm font-semibold text-blue-800 shadow-sm backdrop-blur dark:border-blue-500/30 dark:bg-slate-900/60 dark:text-blue-200"
            >
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">Free</span>
              ATS-friendly resume builder
            </motion.p>
            <motion.h1
              {...rise(0.08)}
              id="home-hero-heading"
              className="app-hero-title mb-5 font-extrabold tracking-tight text-slate-900 dark:text-white"
            >
              Build an <span className="whitespace-nowrap">ATS-friendly</span> resume{' '}
              <span className="relative whitespace-nowrap bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-300">
                you&apos;re proud of
                <svg className="absolute -bottom-2 left-0 h-3 w-full text-blue-400/70 dark:text-blue-400/50" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                  <motion.path
                    d="M2 9 C 50 2, 120 2, 198 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, delay: 0.7, ease: 'easeInOut' }}
                  />
                </svg>
              </span>
            </motion.h1>
            <motion.p {...rise(0.16)} className="app-hero-lead mb-8 max-w-xl text-slate-600 dark:text-slate-300">
              Turn your experience into a clear, focused resume. Build and edit for free, check common ATS issues, and export to PDF or Word. Optional AI helps tailor your wording to the role.
            </motion.p>
            <motion.div {...rise(0.24)} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <TouchLink
                to={user ? '/new' : '/signup'}
                className="app-hero-cta-primary group min-h-[3.25rem] w-full justify-center gap-2 px-7 text-base font-semibold shadow-lg shadow-blue-600/25 sm:w-auto"
              >
                {user ? 'Create a resume' : 'Start free — sign up'}
                <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.64l-4.22-4.22a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.22-4.22H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                </svg>
              </TouchLink>
              <TouchLink
                to="/learn"
                className="app-hero-cta-secondary min-h-[3.25rem] w-full justify-center border border-slate-300 bg-white/90 px-7 text-base font-semibold text-slate-800 shadow-sm backdrop-blur hover:border-slate-400 sm:w-auto dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
              >
                Resume tips
              </TouchLink>
            </motion.div>
            <motion.ul {...rise(0.32)} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div
            className="app-hero-visual mx-auto w-full max-w-[34rem] lg:max-w-none"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroScene />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
