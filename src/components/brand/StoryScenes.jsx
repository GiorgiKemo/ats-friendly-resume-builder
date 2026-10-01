import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import Typewriter from './Typewriter';
import useSceneTimeline from './useSceneTimeline';

const spring = { type: 'spring', stiffness: 260, damping: 22 };
const stage = 'relative aspect-[4/3] w-full overflow-hidden rounded-2xl text-[3.3cqw]';
const card = 'rounded-[0.9em] bg-white shadow-[0_1em_2.4em_-0.8em_rgba(15,23,42,0.28)] ring-1 ring-slate-900/5';

/* ───────── 1. Fill in your story ───────── */

const FILL_BEATS = [600, 1300, 1100, 900, 1300, 1800];

const Field = ({ label, value, active, done }) => (
  <div>
    <p className="mb-[0.25em] text-[0.55em] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <div className={`flex h-[2em] items-center rounded-[0.45em] border px-[0.6em] text-[0.72em] font-medium text-slate-800 transition-colors ${active ? 'border-blue-500 ring-[0.2em] ring-blue-500/15' : 'border-slate-200'}`}>
      <Typewriter text={value} active={active} done={done} speed={65} />
    </div>
  </div>
);

export const FillScene = () => {
  const ref = useRef(null);
  const step = useSceneTimeline(ref, FILL_BEATS);
  const progress = [8, 38, 66, 84, 100, 100][step];
  const circumference = 2 * Math.PI * 16;

  return (
    <div ref={ref} className="[container-type:inline-size]" aria-hidden="true">
      <div className={`${stage} bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/60`}>
        <div className={`absolute left-[8%] top-[10%] w-[84%] p-[1em] ${card}`}>
          <div className="mb-[0.8em] flex items-center justify-between">
            <span className="text-[0.8em] font-bold text-slate-900">Work history</span>
            <span className="relative flex h-[2.4em] w-[2.4em] items-center justify-center">
              <svg aria-hidden="true" viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <motion.circle
                  cx="20" cy="20" r="16" fill="none" stroke={progress === 100 ? '#10b981' : '#2563eb'} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={false}
                  animate={{ strokeDashoffset: circumference * (1 - progress / 100) }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </svg>
              <span className="text-[0.5em] font-bold text-slate-700">{progress}%</span>
            </span>
          </div>
          <div className="space-y-[0.6em]">
            <Field label="Job title" value="Product Designer" active={step === 1} done={step > 1} />
            <Field label="Company" value="Northstar" active={step === 2} done={step > 2} />
            <div className="grid grid-cols-2 gap-[0.6em]">
              <Field label="Start" value="Jan 2022" active={step === 3} done={step > 3} />
              <Field label="End" value="Present" active={step === 3} done={step > 3} />
            </div>
          </div>
        </div>
        <motion.div
          className="absolute bottom-[7%] right-[8%] flex items-center gap-[0.4em] rounded-full bg-emerald-500 px-[0.8em] py-[0.35em] text-[0.62em] font-bold text-white shadow-lg shadow-emerald-500/30"
          initial={false}
          animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 ? 0 : 10, scale: step >= 4 ? 1 : 0.8 }}
          transition={spring}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-[1.1em] w-[1.1em]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
          Saved automatically
        </motion.div>
      </div>
    </div>
  );
};

/* ───────── 2. Tailor it to the job ───────── */

const TAILOR_BEATS = [700, 1500, 1400, 1300, 1800];
const KEYWORDS = ['Figma', 'user research', 'accessibility'];

export const TailorScene = () => {
  const ref = useRef(null);
  const step = useSceneTimeline(ref, TAILOR_BEATS);

  return (
    <div ref={ref} className="[container-type:inline-size]" aria-hidden="true">
      <div className={`${stage} bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-800 dark:to-slate-800/60`}>
        {/* Job post */}
        <div className={`absolute left-[5%] top-[9%] w-[48%] p-[0.9em] ${card}`}>
          <p className="text-[0.55em] font-semibold uppercase tracking-wide text-slate-400">Job post</p>
          <p className="mb-[0.5em] text-[0.72em] font-bold text-slate-900">Product Designer</p>
          <div className="space-y-[0.45em] text-[0.55em] leading-[1.6] text-slate-500">
            <p>
              Design flows in{' '}
              <motion.mark className="rounded-[0.25em] px-[0.2em] text-slate-800" initial={false} animate={{ backgroundColor: step >= 1 ? 'rgba(250,204,21,0.55)' : 'rgba(250,204,21,0)' }} transition={{ delay: step >= 1 ? 0.1 : 0 }}>Figma</motion.mark>
              {' '}with a strong focus on{' '}
              <motion.mark className="rounded-[0.25em] px-[0.2em] text-slate-800" initial={false} animate={{ backgroundColor: step >= 1 ? 'rgba(250,204,21,0.55)' : 'rgba(250,204,21,0)' }} transition={{ delay: step >= 1 ? 0.5 : 0 }}>user research</motion.mark>
              {' '}and{' '}
              <motion.mark className="rounded-[0.25em] px-[0.2em] text-slate-800" initial={false} animate={{ backgroundColor: step >= 1 ? 'rgba(250,204,21,0.55)' : 'rgba(250,204,21,0)' }} transition={{ delay: step >= 1 ? 0.9 : 0 }}>accessibility</motion.mark>.
            </p>
            <span className="block h-[0.5em] w-[90%] rounded-full bg-slate-200" />
            <span className="block h-[0.5em] w-[70%] rounded-full bg-slate-200" />
          </div>
        </div>

        {/* Resume */}
        <div className={`absolute right-[5%] top-[20%] w-[40%] p-[0.9em] ${card}`}>
          <span className="block h-[0.7em] w-[70%] rounded-full bg-slate-800" />
          <span className="mt-[0.35em] block h-[0.45em] w-[45%] rounded-full bg-blue-500" />
          <p className="mb-[0.35em] mt-[0.8em] text-[0.5em] font-bold uppercase tracking-wide text-slate-700">Skills</p>
          <div className="flex min-h-[3.6em] flex-wrap content-start gap-[0.3em]">
            {KEYWORDS.map((keyword, index) => (
              <motion.span
                key={keyword}
                className="rounded-full bg-blue-50 px-[0.55em] py-[0.15em] text-[0.5em] font-semibold text-blue-700 ring-1 ring-blue-100"
                initial={false}
                animate={{ opacity: step >= 2 ? 1 : 0, scale: step >= 2 ? 1 : 0.4, x: step >= 2 ? 0 : -60 }}
                transition={{ ...spring, delay: step >= 2 ? index * 0.18 : 0 }}
              >
                {keyword}
              </motion.span>
            ))}
          </div>
          <motion.p
            className="mt-[0.4em] flex items-center gap-[0.3em] text-[0.48em] font-semibold text-emerald-600"
            initial={false}
            animate={{ opacity: step >= 3 ? 1 : 0 }}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-[1.2em] w-[1.2em]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
            You approved 3 changes
          </motion.p>
        </div>

        {/* AI sparkle */}
        <motion.span
          className="absolute left-[47%] top-[52%] flex h-[2.6em] w-[2.6em] items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/40"
          initial={false}
          animate={{ scale: step === 2 ? [1, 1.2, 1] : 1, rotate: step >= 2 ? 360 : 0 }}
          transition={{ duration: 0.9 }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.3em] w-[1.3em]" fill="currentColor"><path d="M12 2l2 5.5L19.5 9.5 14 11.5 12 17l-2-5.5L4.5 9.5 10 7.5z" /></svg>
        </motion.span>
      </div>
    </div>
  );
};

/* ───────── 3. Send and track ───────── */

const APPLY_BEATS = [700, 1100, 1300, 1200, 1300, 1800];

export const ApplyScene = () => {
  const ref = useRef(null);
  const step = useSceneTimeline(ref, APPLY_BEATS);

  return (
    <div ref={ref} className="[container-type:inline-size]" aria-hidden="true">
      <div className={`${stage} bg-gradient-to-br from-sky-50 to-blue-50 dark:from-slate-800 dark:to-slate-800/60`}>
        {/* Resume becomes a paper plane */}
        <motion.div
          className={`absolute left-[8%] top-[12%] w-[30%] p-[0.7em] ${card}`}
          initial={false}
          animate={step >= 1 && step < 2 ? { scale: 0.85, rotate: -4 } : step >= 2 ? { opacity: 0, scale: 0.3, x: 40, y: -20 } : { opacity: 1, scale: 1, rotate: 0, x: 0, y: 0 }}
          transition={spring}
        >
          <span className="block h-[0.6em] w-[75%] rounded-full bg-slate-800" />
          <span className="mt-[0.3em] block h-[0.4em] w-[50%] rounded-full bg-blue-500" />
          {['90%', '70%', '84%', '60%'].map((width) => <span key={width} className="mt-[0.45em] block h-[0.35em] rounded-full bg-slate-200" style={{ width }} />)}
          <div className="mt-[0.6em] flex gap-[0.3em]">
            <span className="rounded-[0.25em] bg-rose-500 px-[0.35em] text-[0.42em] font-bold text-white">PDF</span>
            <span className="rounded-[0.25em] bg-blue-600 px-[0.35em] text-[0.42em] font-bold text-white">DOCX</span>
          </div>
        </motion.div>
        <motion.svg aria-hidden="true"
          viewBox="0 0 24 24"
          className="absolute h-[3em] w-[3em] text-blue-600"
          fill="currentColor"
          initial={false}
          animate={step === 2
            ? { left: ['20%', '55%', '84%'], top: ['30%', '8%', '14%'], opacity: [0, 1, 0], rotate: [0, -10, 10] }
            : { left: '20%', top: '30%', opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        >
          <path d="M2 11l20-9-7 20-3-8z" />
          <path d="M12 14l10-12" stroke="#fff" strokeWidth="1" />
        </motion.svg>

        {/* Application tracker */}
        <div className={`absolute bottom-[10%] right-[6%] w-[56%] p-[0.8em] ${card}`}>
          <p className="mb-[0.5em] text-[0.62em] font-bold text-slate-900">Applications</p>
          {[
            { company: 'Northstar', role: 'Product Designer', status: step >= 4 ? 'Follow-up set' : 'Applied', tone: step >= 4 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700', show: step >= 3 },
            { company: 'Brightline', role: 'UX Designer', status: 'Saved', tone: 'bg-slate-100 text-slate-600', show: true },
          ].map((row) => (
            <motion.div
              key={row.company}
              className="flex items-center justify-between border-t border-slate-100 py-[0.45em] first:border-t-0"
              initial={false}
              animate={{ opacity: row.show ? 1 : 0, x: row.show ? 0 : 16 }}
              transition={spring}
            >
              <span className="min-w-0">
                <span className="block text-[0.55em] font-semibold text-slate-800">{row.company}</span>
                <span className="block text-[0.45em] text-slate-400">{row.role}</span>
              </span>
              <motion.span key={row.status} className={`rounded-full px-[0.6em] py-[0.15em] text-[0.45em] font-bold ${row.tone}`} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring}>
                {row.status}
              </motion.span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
