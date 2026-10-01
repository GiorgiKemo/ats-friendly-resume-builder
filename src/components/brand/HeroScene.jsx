import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Mascot from './Mascot';
import Confetti from './Confetti';
import Typewriter from './Typewriter';
import useSceneTimeline from './useSceneTimeline';

// Scene beats (ms): blank page, type name, header, sections, skills,
// ATS check, export files, message + celebration, hold.
const BEATS = [700, 1500, 800, 2000, 900, 1900, 1200, 3200, 1200];
const STEP = { page: 0, name: 1, header: 2, sections: 3, skills: 4, check: 5, files: 6, success: 7, hold: 8 };

const spring = { type: 'spring', stiffness: 260, damping: 22 };

const Bar = ({ show, width, delay = 0, tone = 'bg-slate-200 dark:bg-slate-200' }) => (
  <motion.span
    className={`block h-[0.42em] origin-left rounded-full ${tone}`}
    style={{ width }}
    initial={false}
    animate={{ scaleX: show ? 1 : 0, opacity: show ? 1 : 0 }}
    transition={{ duration: 0.55, delay: show ? delay : 0, ease: [0.65, 0, 0.35, 1] }}
  />
);

const Heading = ({ show, label, delay = 0 }) => (
  <motion.div
    className="mb-[0.45em] mt-[0.9em] flex items-center gap-[0.4em]"
    initial={false}
    animate={{ opacity: show ? 1 : 0, x: show ? 0 : -6 }}
    transition={{ duration: 0.35, delay: show ? delay : 0 }}
  >
    <span className="h-[0.75em] w-[0.18em] rounded-full bg-blue-600" />
    <span className="text-[0.56em] font-bold uppercase tracking-[0.12em] text-slate-800">{label}</span>
    <span className="h-px flex-1 bg-slate-200" />
  </motion.div>
);

const CheckRow = ({ show, label, delay }) => (
  <motion.li
    className="flex items-center gap-[0.5em] text-[0.62em] font-medium text-slate-700"
    initial={false}
    animate={{ opacity: show ? 1 : 0.35 }}
    transition={{ duration: 0.3, delay: show ? delay : 0 }}
  >
    <motion.span
      className="flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-full"
      initial={false}
      animate={{ backgroundColor: show ? '#10b981' : '#e2e8f0', scale: show ? [1, 1.25, 1] : 1 }}
      transition={{ duration: 0.45, delay: show ? delay : 0 }}
    >
      <svg viewBox="0 0 16 16" className="h-[0.9em] w-[0.9em]" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path d="M3.5 8.5l3 3 6-6.5" initial={false} animate={{ pathLength: show ? 1 : 0 }} transition={{ duration: 0.35, delay: show ? delay + 0.12 : 0 }} />
      </svg>
    </motion.span>
    {label}
  </motion.li>
);

/**
 * Animated hero: a resume fills itself in, passes a readability check, exports
 * to PDF and Word, and a reply arrives while the character celebrates.
 * Decorative; the hero copy carries the message for assistive technology.
 */
const HeroScene = () => {
  const ref = useRef(null);
  const step = useSceneTimeline(ref, BEATS);
  const [cycle, setCycle] = useState(0);
  const at = (name) => step >= STEP[name];

  useEffect(() => {
    if (step === STEP.success) setCycle((value) => value + 1);
  }, [step]);

  const mood = at('success') ? 'celebrate' : at('check') ? 'wave' : 'idle';

  return (
    <div ref={ref} className="relative w-full select-none [container-type:inline-size]" aria-hidden="true">
      <div className="relative aspect-[1/1.02] text-[2.95cqw]">
        {/* Ambient shapes */}
        <div className="float-slow absolute left-[4%] top-[8%] h-[46%] w-[58%] rounded-full bg-blue-400/25 blur-3xl dark:bg-blue-500/20" />
        <div className="float-slower absolute bottom-[4%] right-[2%] h-[40%] w-[50%] rounded-full bg-indigo-400/25 blur-3xl dark:bg-indigo-500/20" />
        <svg aria-hidden="true" className="spin-slow absolute right-[6%] top-[4%] h-[13%] w-[13%] text-blue-300/70 dark:text-blue-400/40" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="2" strokeDasharray="4 9" />
        </svg>

        {/* Resume page */}
        <motion.div
          className="absolute left-[6%] top-[12%] h-[82%] w-[62%] overflow-hidden rounded-[1.1em] bg-white shadow-[0_2em_4em_-1em_rgba(30,58,138,0.35)] ring-1 ring-slate-900/5"
          initial={false}
          animate={{ opacity: 1, y: at('files') && !at('success') ? -6 : 0, rotate: at('success') ? -2 : 0 }}
          transition={spring}
        >
          <div className="relative bg-slate-100 px-[1.4em] pb-[0.9em] pt-[1.3em]">
            <div className="text-[1.45em] font-extrabold leading-tight tracking-tight text-slate-900">
              <Typewriter text="Alex Morgan" active={step === STEP.name} done={at('header')} speed={95} />
              {step < STEP.name && <span className="typing-cursor inline-block h-[0.9em] w-[0.08em] translate-y-[0.1em] bg-slate-900" />}
            </div>
            <motion.div initial={false} animate={{ opacity: at('header') ? 1 : 0, y: at('header') ? 0 : 4 }} transition={{ duration: 0.35 }}>
              <p className="mt-[0.15em] text-[0.78em] font-semibold text-blue-600">Product Designer</p>
              <div className="mt-[0.5em] flex gap-[0.4em]">
                {['18%', '26%', '20%'].map((width) => <span key={width} className="h-[0.38em] rounded-full bg-slate-300" style={{ width }} />)}
              </div>
            </motion.div>
            <motion.span
              className="absolute inset-x-0 bottom-0 h-[0.2em] origin-left bg-blue-600"
              initial={false}
              animate={{ scaleX: at('header') ? 1 : 0 }}
              transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
            />
          </div>

          <div className="px-[1.4em] pb-[1.2em]">
            <Heading show={at('sections')} label="Summary" />
            <div className="space-y-[0.4em]">
              <Bar show={at('sections')} width="96%" delay={0.1} />
              <Bar show={at('sections')} width="82%" delay={0.18} />
            </div>

            <Heading show={at('sections')} label="Experience" delay={0.35} />
            <div className="flex items-center justify-between">
              <Bar show={at('sections')} width="46%" delay={0.45} tone="bg-slate-800" />
              <Bar show={at('sections')} width="18%" delay={0.5} tone="bg-slate-300" />
            </div>
            <div className="mt-[0.45em] space-y-[0.4em] pl-[0.2em]">
              {[['88%', 0.6], ['76%', 0.7], ['84%', 0.8]].map(([width, delay]) => (
                <div key={width} className="flex items-center gap-[0.4em]">
                  <motion.span className="h-[0.32em] w-[0.32em] shrink-0 rounded-full bg-blue-600" initial={false} animate={{ scale: at('sections') ? 1 : 0 }} transition={{ delay: at('sections') ? delay : 0 }} />
                  <Bar show={at('sections')} width={width} delay={delay} />
                </div>
              ))}
            </div>

            <Heading show={at('sections')} label="Education" delay={0.9} />
            <div className="flex items-center justify-between">
              <Bar show={at('sections')} width="52%" delay={1} tone="bg-slate-800" />
              <Bar show={at('sections')} width="14%" delay={1.05} tone="bg-slate-300" />
            </div>
            <div className="mt-[0.4em]"><Bar show={at('sections')} width="38%" delay={1.1} /></div>

            <Heading show={at('skills')} label="Skills" />
            <div className="flex flex-wrap gap-[0.35em]">
              {['Figma', 'Research', 'Prototyping', 'A11y'].map((skill, index) => (
                <motion.span
                  key={skill}
                  className="rounded-full bg-blue-50 px-[0.6em] py-[0.2em] text-[0.55em] font-semibold text-blue-700 ring-1 ring-blue-100"
                  initial={false}
                  animate={{ scale: at('skills') ? 1 : 0, opacity: at('skills') ? 1 : 0 }}
                  transition={{ ...spring, delay: at('skills') ? index * 0.1 : 0 }}
                >
                  {skill}
                </motion.span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Readability check */}
        <motion.div
          className="absolute right-[3%] top-[30%] w-[38%] rounded-[0.9em] bg-white p-[0.9em] shadow-[0_1.4em_3em_-1em_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5"
          initial={false}
          animate={{ opacity: at('check') ? 1 : 0, x: at('check') ? 0 : 24, scale: at('check') ? 1 : 0.92 }}
          transition={spring}
        >
          <div className="mb-[0.6em] flex items-center gap-[0.45em]">
            <span className="flex h-[1.8em] w-[1.8em] items-center justify-center rounded-[0.5em] bg-emerald-50 text-emerald-600">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <span className="text-[0.7em] font-bold text-slate-900">ATS check</span>
          </div>
          <ul className="space-y-[0.5em]">
            <CheckRow show={at('check')} label="One reading column" delay={0.25} />
            <CheckRow show={at('check')} label="Standard headings" delay={0.6} />
            <CheckRow show={at('check')} label="Real, selectable text" delay={0.95} />
          </ul>
        </motion.div>

        {/* Export files */}
        {[
          { label: 'PDF', x: '-10%', y: '72%', color: 'bg-rose-500', delay: 0 },
          { label: 'DOCX', x: '6%', y: '84%', color: 'bg-blue-600', delay: 0.15 },
        ].map((file) => (
          <motion.div
            key={file.label}
            className="absolute left-[30%] top-[50%] flex items-center gap-[0.4em] rounded-[0.7em] bg-white px-[0.7em] py-[0.5em] shadow-[0_1em_2em_-0.6em_rgba(15,23,42,0.4)] ring-1 ring-slate-900/5"
            initial={false}
            animate={at('files')
              ? { opacity: 1, left: file.x, top: file.y, scale: 1, rotate: file.label === 'PDF' ? -6 : 5 }
              : { opacity: 0, left: '30%', top: '50%', scale: 0.4, rotate: 0 }}
            transition={{ ...spring, delay: at('files') ? file.delay : 0 }}
          >
            <span className={`flex h-[1.7em] w-[1.4em] items-center justify-center rounded-[0.3em] ${file.color} text-[0.42em] font-extrabold text-white`}>{file.label === 'PDF' ? 'PDF' : 'W'}</span>
            <span className="text-[0.6em] font-bold text-slate-800">{file.label} ready</span>
          </motion.div>
        ))}

        {/* Reply notification */}
        <motion.div
          className="absolute left-[2%] top-[0%] flex w-[64%] items-center gap-[0.7em] rounded-[1em] bg-white p-[0.8em] shadow-[0_1.4em_3em_-1em_rgba(15,23,42,0.4)] ring-1 ring-slate-900/5"
          initial={false}
          animate={{ opacity: at('success') ? 1 : 0, y: at('success') ? 0 : -18, scale: at('success') ? 1 : 0.9 }}
          transition={spring}
        >
          <span className="relative flex h-[2.4em] w-[2.4em] shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            <span className="pulse-ring absolute inset-0 rounded-full bg-blue-500" />
            <svg aria-hidden="true" viewBox="0 0 24 24" className="relative h-[1.2em] w-[1.2em]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              <path d="M22 6l-10 7L2 6" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-[0.4em]">
              <span className="text-[0.7em] font-bold text-slate-900">New reply</span>
              <span className="text-[0.55em] text-slate-400">just now</span>
            </span>
            <span className="block text-[0.6em] leading-snug text-slate-600">&ldquo;Thanks for applying! Are you free for a call this week?&rdquo;</span>
          </span>
        </motion.div>

        <div className="absolute bottom-[-1%] right-[-1%] w-[33%]">
          <Mascot mood={mood} />
        </div>

        <Confetti key={cycle} active={at('success')} x="70%" y="62%" count={42} spread={240} seed={cycle + 3} />
      </div>
    </div>
  );
};

export default HeroScene;
