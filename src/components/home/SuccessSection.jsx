import React, { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import PaperPlaneScene, { PaperPlaneFallback } from '../brand/PaperPlaneScene';
import Confetti from '../brand/Confetti';

const MILESTONES = [
  { label: 'Resume tailored for the role', detail: 'Product Designer · Northstar', tone: 'bg-blue-600' },
  { label: 'PDF and Word files ready', detail: 'Same design, real text', tone: 'bg-rose-500' },
  { label: 'Application sent and tracked', detail: 'Follow-up reminder in 5 days', tone: 'bg-emerald-500' },
];

const SuccessSection = () => {
  const ref = useRef(null);
  const planeRef = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const [sent, setSent] = useState(false);
  const [burst, setBurst] = useState(0);

  // The 3D plane loops and throws its own confetti; without it, use CSS confetti.
  const celebrate = () => {
    if (!planeRef.current?.celebrate()) setBurst((value) => value + 1);
    setSent(true);
  };

  return (
    <section ref={ref} className="relative overflow-hidden bg-gradient-to-b from-white to-blue-50/70 py-20 dark:from-[#070a10] dark:to-slate-900 md:py-28" aria-labelledby="success-heading">
      <div className="container mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 lg:grid-cols-2">
        <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
          <div className="absolute inset-[12%] rounded-full bg-gradient-to-br from-blue-200/70 via-indigo-100/50 to-sky-100/40 blur-2xl dark:from-blue-600/25 dark:via-indigo-500/15 dark:to-transparent" aria-hidden="true" />
          <div className="absolute inset-[22%] rounded-full border border-blue-200/70 dark:border-blue-400/15" aria-hidden="true" />
          <PaperPlaneScene
            ref={planeRef}
            variant="send"
            className="absolute inset-[-12%]"
            onLaunch={() => setSent(true)}
            fallback={<div className="absolute inset-[22%]"><PaperPlaneFallback /></div>}
          />
          <motion.div
            className="absolute right-[2%] top-[8%] rounded-2xl bg-white px-4 py-3 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10"
            initial={{ opacity: 0, scale: 0.6, rotate: 8 }}
            animate={sent ? { opacity: 1, scale: 1, rotate: 4 } : {}}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            aria-hidden="true"
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status</p>
            <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">Sent! 🎉</p>
          </motion.div>
          <Confetti key={burst} active={burst > 0} x="50%" y="40%" count={60} spread={300} seed={burst + 11} />
        </div>

        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">The best part</p>
          <h2 id="success-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            That feeling when you hit send
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            A resume you trust makes applying feel lighter. Tailor it, export it, send it, and keep moving.
          </p>

          <ol className="mt-8 space-y-3">
            {MILESTONES.map((milestone, index) => (
              <motion.li
                key={milestone.label}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                initial={{ opacity: 0, x: 24 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.2 + index * 0.18, type: 'spring', stiffness: 220, damping: 22 }}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${milestone.tone} text-white shadow-md`}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
                </span>
                <span>
                  <span className="block font-bold text-slate-900 dark:text-white">{milestone.label}</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">{milestone.detail}</span>
                </span>
              </motion.li>
            ))}
          </ol>

          <button
            type="button"
            onClick={celebrate}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <span aria-hidden="true">🎉</span> Celebrate again
          </button>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">Illustration only. Hiring decisions are up to each employer.</p>
        </div>
      </div>
    </section>
  );
};

export default SuccessSection;
