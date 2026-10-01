import React from 'react';
import { motion } from 'framer-motion';
import { ApplyScene, FillScene, TailorScene } from '../brand/StoryScenes';

const steps = [
  {
    title: 'Fill in your story',
    description: 'Add your work, education, projects, and skills in the guided editor. Everything saves as you type.',
    Scene: FillScene,
  },
  {
    title: 'Tailor it to the job',
    description: 'Paste a job post and highlight what fits. Premium AI can suggest wording from your real background; you approve every change.',
    Scene: TailorScene,
  },
  {
    title: 'Send it and keep track',
    description: 'Download a PDF or Word file, apply, and track every application and follow-up in one place.',
    Scene: ApplyScene,
  },
];

export default function HowItWorksSection() {
  return (
    <section className="relative bg-white py-20 dark:bg-[#070a10] md:py-28" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto max-w-6xl px-4">
        <motion.div
          className="mx-auto mb-14 max-w-2xl text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">How it works</p>
          <h2 id="how-it-works-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            From blank page to sent application
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Three simple steps, with you in control of every word.
          </p>
        </motion.div>

        <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
          {/* Dashed connector that draws across the steps on desktop */}
          <svg className="pointer-events-none absolute left-[16%] right-[16%] top-[-1.75rem] hidden h-6 w-[68%] md:block" viewBox="0 0 600 24" preserveAspectRatio="none" aria-hidden="true">
            <motion.path
              d="M0 12 C 150 -6, 450 30, 600 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="6 8"
              className="text-blue-300 dark:text-blue-500/50"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
            />
          </svg>
          {steps.map(({ title, description, Scene }, index) => (
            <motion.li
              key={title}
              className="group relative flex flex-col rounded-3xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/[0.03] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/[0.06] dark:border-slate-800 dark:bg-slate-900"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="absolute -top-4 left-6 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/30 ring-4 ring-white dark:ring-[#070a10]">
                {index + 1}
              </span>
              <Scene />
              <div className="px-3 pb-3 pt-5">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
              </div>
            </motion.li>
          ))}
        </ol>

        <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
          ATS checks are guidance, not a hiring prediction. No builder can guarantee interviews or acceptance by every system.
        </p>
      </div>
    </section>
  );
}
