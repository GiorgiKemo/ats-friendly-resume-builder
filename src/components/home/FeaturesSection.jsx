import React from 'react';
import { motion } from 'framer-motion';
import AnimatedIcon from '../brand/AnimatedIcon';

const CHECKS = ['One reading column', 'Standard section headings', 'Real, selectable text', 'Contact details in the body'];

const tiles = [
  {
    icon: 'check',
    title: 'Clear for people and software',
    description: "Readable layouts and familiar section headings help recruiters and parsing software understand your experience. Always follow the employer's file-format requirements.",
    tone: 'from-blue-500 to-indigo-600',
    wide: true,
  },
  {
    icon: 'sparkles',
    title: 'AI that keeps you in charge',
    description: 'Optional AI suggests wording from your real background. Compare every change and keep only what is true.',
    tone: 'from-violet-500 to-indigo-600',
  },
  {
    icon: 'download',
    title: 'PDF and Word that match',
    description: 'Download either format from the same design, with real text you can select and edit.',
    tone: 'from-rose-500 to-pink-600',
  },
  {
    icon: 'save',
    title: 'Saves as you type',
    description: 'Autosave keeps your progress, so you can stop and pick up again on any device.',
    tone: 'from-emerald-500 to-teal-600',
  },
  {
    icon: 'briefcase',
    title: 'Track every application',
    description: 'See where each application stands and what to follow up on next, all in one list.',
    tone: 'from-amber-500 to-orange-600',
  },
];

const IconBadge = ({ icon, tone }) => (
  <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-lg shadow-slate-900/10`}>
    <AnimatedIcon name={icon} className="h-[22px] w-[22px]" strokeWidth={2} />
  </span>
);

const FeaturesSection = () => (
  <section className="bg-white py-20 dark:bg-[#070a10] md:py-28" aria-labelledby="features-heading">
    <div className="container mx-auto max-w-6xl px-4">
      <motion.div
        className="mx-auto mb-14 max-w-2xl text-center"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Why ResumeATS</p>
        <h2 id="features-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">
          Everything you need for a clear, ATS-friendly resume
        </h2>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-3">
        {tiles.map((tile, index) => (
          <motion.article
            key={tile.title}
            className={`group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-900/[0.03] transition-[border-color,box-shadow] duration-300 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/[0.06] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40 ${tile.wide ? 'md:col-span-2' : ''}`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: (index % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={tile.wide ? 'grid items-center gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]' : ''}>
              <div>
                <IconBadge icon={tile.icon} tone={tile.tone} />
                <h3 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">{tile.title}</h3>
                <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">{tile.description}</p>
              </div>
              {tile.wide && (
                <ul className="space-y-2.5 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800/60" aria-label="What every design checks">
                  {CHECKS.map((check, checkIndex) => (
                    <motion.li
                      key={check}
                      className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200"
                      initial={{ opacity: 0, x: 16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + checkIndex * 0.15, type: 'spring', stiffness: 260, damping: 22 }}
                    >
                      <motion.span
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.45 + checkIndex * 0.15, type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
                      </motion.span>
                      {check}
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  </section>
);

export default FeaturesSection;
