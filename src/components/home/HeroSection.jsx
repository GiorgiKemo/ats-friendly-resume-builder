import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from '@phosphor-icons/react';
import { TouchLink } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { HeroCanvas, HeroStage, useHeroScene } from '../brand/HeroScene';
import useHeroReducedMotion from '../../hooks/useHeroReducedMotion';
import '../../styles/home-hero.css';

const rise = (delay) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

const HIGHLIGHTS = ['5 designs', 'PDF & Word', 'You approve every AI edit'];

const HeroSection = () => {
  const { user } = useAuth();
  const reducedMotion = useHeroReducedMotion();
  const hero = useHeroScene(reducedMotion);
  const entrance = (delay) => reducedMotion ? {} : rise(delay);

  return (
    <section
      className="home-hero app-hero-viewport relative isolate overflow-hidden bg-gradient-to-b from-blue-50/80 via-white to-white dark:from-[#06080d] dark:via-[#070a10] dark:to-[#070a10]"
      aria-labelledby="home-hero-heading"
    >
      {/* Soft grid that fades out toward the edges */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(37,99,235,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.07)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)] dark:bg-[linear-gradient(to_right,rgba(96,165,250,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(96,165,250,0.06)_1px,transparent_1px)]"
        aria-hidden="true"
      />
      <HeroCanvas hero={hero} />

      <div className="home-hero-container relative mx-auto flex h-full w-full flex-1 flex-col justify-center">
        <div className="app-hero-grid grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
          <div className="home-hero-copy">
            <motion.p
              {...entrance(0)}
              className="app-hero-eyebrow mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 py-1 pl-1 pr-3 text-sm font-semibold text-blue-800 shadow-sm backdrop-blur dark:border-blue-500/30 dark:bg-slate-900/60 dark:text-blue-200"
            >
              Free ATS-friendly resume builder
            </motion.p>
            <motion.h1
              {...entrance(0.08)}
              id="home-hero-heading"
              className="app-hero-title mb-5 font-extrabold tracking-tight text-slate-900 dark:text-white"
            >
              <span className="home-hero-title-line">Build an <span className="whitespace-nowrap">ATS-friendly</span></span>{' '}
              <span className="home-hero-title-line">resume you&apos;re</span>{' '}
              <span className="home-hero-title-line text-blue-600 dark:text-blue-400">proud of.</span>
            </motion.h1>
            <motion.p {...entrance(0.16)} className="app-hero-lead mb-8 max-w-xl text-slate-600 dark:text-slate-300">
              Build and edit for free, check common ATS issues, and export to PDF or Word.
            </motion.p>
            <motion.div {...entrance(0.24)} className="home-hero-actions flex flex-col gap-3 sm:flex-row sm:items-center">
              <TouchLink
                to={user ? '/new' : '/signup'}
                animate={false}
                className="app-hero-cta-primary group min-h-[3.25rem] w-full justify-center gap-2 px-7 text-base font-semibold shadow-lg shadow-blue-600/25 sm:w-auto"
              >
                {user ? 'Create a resume' : 'Start free — sign up'}
                <ArrowRight size={20} weight="bold" aria-hidden="true" />
              </TouchLink>
              <TouchLink
                to="/learn"
                animate={false}
                className="app-hero-cta-secondary min-h-[3.25rem] w-full justify-center border border-slate-300 bg-white/90 px-7 text-base font-semibold text-slate-800 shadow-sm backdrop-blur hover:border-slate-400 sm:w-auto dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100"
              >
                Resume tips
              </TouchLink>
            </motion.div>
            <motion.ul {...entrance(0.32)} className="home-hero-highlights mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check size={15} weight="bold" className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </motion.ul>
          </div>

          <div className="app-hero-visual mx-auto w-full max-w-[34rem] lg:max-w-none">
            <HeroStage hero={hero} reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
