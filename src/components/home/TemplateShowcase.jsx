import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { TouchLink } from '../ui';
import { useAuth } from '../../context/AuthContext';
import ResumeDocument from '../templates/ResumeDocument';
import { RESUME_TEMPLATES, RESUME_TEMPLATE_IDS } from '../../../supabase/functions/_shared/resume/templates.js';
import { SAMPLE_RESUME } from '../../utils/sampleResume';

// Cards render a real US Letter page (816px wide) scaled down to the card width.
const CARD_WIDTH = 288;
const SCALE = CARD_WIDTH / 816;

const Page = ({ id }) => (
  <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5" style={{ width: CARD_WIDTH, height: CARD_WIDTH * (11 / 8.5) }}>
    <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: 816, transform: `scale(${SCALE})` }}>
      <ResumeDocument resume={SAMPLE_RESUME} templateId={id} />
    </div>
  </div>
);

const TemplateShowcase = () => {
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduceMotion = useReducedMotion();
  const ids = RESUME_TEMPLATE_IDS;

  useEffect(() => {
    if (paused || !inView || reduceMotion) return undefined;
    const timer = setInterval(() => setActive((index) => (index + 1) % ids.length), 3600);
    return () => clearInterval(timer);
  }, [paused, inView, reduceMotion, ids.length]);

  const activeTemplate = RESUME_TEMPLATES[ids[active]];

  return (
    <section ref={ref} className="relative overflow-hidden bg-slate-50 py-20 dark:bg-slate-900/60 md:py-28" aria-labelledby="templates-heading">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" aria-hidden="true" />
      <div className="container relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Designs</p>
          <h2 id="templates-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Five designs. One clear reading column.
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Every design uses real, selectable text and standard headings, and your PDF and Word files match the preview.
          </p>

          <div className="mt-8 space-y-2" role="tablist" aria-label="Resume designs">
            {ids.map((id, index) => {
              const template = RESUME_TEMPLATES[id];
              const selected = index === active;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(index)}
                  className={`relative flex w-full items-center gap-4 overflow-hidden rounded-2xl px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    selected ? 'bg-white shadow-md shadow-slate-900/5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700' : 'hover:bg-white/60 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-white dark:ring-slate-900" style={{ backgroundColor: template.accent }} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 dark:text-white">{template.name}</span>
                    <span className="block truncate text-sm text-slate-500 dark:text-slate-400">{template.tagline}</span>
                  </span>
                  {selected && !paused && !reduceMotion && (
                    <motion.span
                      key={`progress-${active}`}
                      className="absolute bottom-0 left-0 h-0.5 bg-blue-500"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 3.6, ease: 'linear' }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <TouchLink
            to={user ? '/new' : '/signup'}
            className="mt-8 rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700"
          >
            Start with {activeTemplate.name}
          </TouchLink>
        </div>

        {/* Fanned deck: the selected design comes to the front */}
        <div className="relative mx-auto h-[26rem] w-full max-w-[34rem] sm:h-[30rem]" aria-hidden="true">
          {ids.map((id, index) => {
            const offset = (index - active + ids.length) % ids.length;
            const position = offset > ids.length / 2 ? offset - ids.length : offset;
            const depth = Math.abs(position);
            return (
              <motion.div
                key={id}
                className="absolute left-1/2 top-1/2"
                style={{ zIndex: 10 - depth, marginLeft: -CARD_WIDTH / 2, marginTop: -(CARD_WIDTH * (11 / 8.5)) / 2 }}
                initial={false}
                animate={{
                  x: position * 92,
                  y: depth * 18,
                  rotate: position * 6,
                  scale: 1 - depth * 0.08,
                  opacity: depth > 2 ? 0 : 1 - depth * 0.18,
                }}
                transition={{ type: 'spring', stiffness: 170, damping: 24 }}
              >
                <div className="scale-[0.82] sm:scale-100">
                  <Page id={id} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TemplateShowcase;
