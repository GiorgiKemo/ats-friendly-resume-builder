import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { STRIPE_PLAN_CONFIG, formatStripePrice } from '../../config/stripePlans';
import Button from '../ui/Button';
import AnimatedIcon from '../brand/AnimatedIcon';
import useSceneTimeline from '../brand/useSceneTimeline';

const FEATURES = [
  { icon: 'sparkles', title: 'AI-assisted drafts', text: 'Use your profile and a job description to draft relevant wording. Review every suggestion before applying. Up to 30 AI drafts or enhancements per month.' },
  { icon: 'layers', title: 'Unlimited saved resumes', text: 'Keep versions for different applications. Manual editing is unlimited; AI generations use your monthly quota.' },
  { icon: 'target', title: 'ATS and keyword guidance', text: 'Review common formatting issues and compare your resume with the job description. Scores are guidance, not a guarantee.' },
  { icon: 'heart', title: 'Priority support', text: 'Get help with the product, your subscription, and billing through our published support channels.' },
];

// Suggestion demo beats: original, thinking, suggestion, accepted, hold.
const BEATS = [1400, 1100, 1700, 1600, 1400];

const SuggestionDemo = () => {
  const ref = useRef(null);
  const step = useSceneTimeline(ref, BEATS);

  return (
    <div ref={ref} className="relative rounded-3xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-sm" aria-hidden="true">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">Experience · bullet 1</p>
      <div className="mt-3 rounded-2xl bg-white p-4 text-slate-800 shadow-xl">
        <p className="text-xs font-semibold text-slate-400">Your words</p>
        <p className={`mt-1 text-sm transition-colors ${step >= 3 ? 'text-slate-400 line-through' : ''}`}>Worked on the new onboarding flow.</p>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M12 2l2 5.5L19.5 9.5 14 11.5 12 17l-2-5.5L4.5 9.5 10 7.5z" /></svg>
            Suggested wording
          </p>
          {step === 1 ? (
            <div className="mt-2 space-y-1.5">
              <span className="shimmer block h-3 w-11/12 rounded-full bg-gradient-to-r from-slate-100 via-indigo-100 to-slate-100" />
              <span className="shimmer block h-3 w-8/12 rounded-full bg-gradient-to-r from-slate-100 via-indigo-100 to-slate-100" />
            </div>
          ) : (
            <motion.p
              className="mt-1 text-sm font-medium"
              initial={false}
              animate={{ opacity: step >= 2 ? 1 : 0.25 }}
            >
              Led the onboarding redesign from research through launch.
            </motion.p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <motion.span
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${step >= 3 ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}
            initial={false}
            animate={{ scale: step === 2 ? [1, 1.08, 1] : 1 }}
            transition={{ duration: 0.8, repeat: step === 2 ? Infinity : 0 }}
          >
            {step >= 3 ? '✓ Accepted' : 'Accept'}
          </motion.span>
          <span className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Keep mine</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-blue-100">Nothing changes until you choose.</p>
    </div>
  );
};

const PremiumFeatures = () => (
  <section className="bg-white py-20 dark:bg-[#070a10] md:py-24" aria-labelledby="premium-heading">
    <div className="container mx-auto max-w-6xl px-4">
      <motion.div
        className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 p-8 text-white shadow-2xl shadow-blue-900/25 md:p-12"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="float-slow pointer-events-none absolute -right-20 -top-20 -z-10 h-80 w-80 rounded-full bg-sky-400/25 blur-3xl" aria-hidden="true" />
        <div className="float-slower pointer-events-none absolute -bottom-24 left-10 -z-10 h-72 w-72 rounded-full bg-indigo-400/30 blur-3xl" aria-hidden="true" />

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold ring-1 ring-white/20">
              Premium AI Suite · Optional upgrade
            </span>
            <h2 id="premium-heading" className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
              Optional AI tools for a more targeted resume
            </h2>
            <p className="mt-3 max-w-xl text-lg text-blue-100">
              Premium adds AI-assisted drafting and keyword guidance based on your profile and job description. Review suggestions, verify every fact, and decide what belongs in your resume.
            </p>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="group flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <AnimatedIcon name={feature.icon} className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span>
                    <span className="block font-bold">{feature.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-blue-100">{feature.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <p className="text-3xl font-extrabold">
                {formatStripePrice(STRIPE_PLAN_CONFIG.premium_monthly.amount)}
                <span className="text-lg font-medium text-blue-100">/month</span>
              </p>
              <Button as="link" to="/pricing" size="lg" variant="ghost" animate={false} className="!bg-white !text-blue-700 shadow-lg hover:!bg-blue-50 sm:ml-4">
                View All Plans
              </Button>
            </div>
          </div>

          <SuggestionDemo />
        </div>
      </motion.div>
    </div>
  </section>
);

export default PremiumFeatures;
