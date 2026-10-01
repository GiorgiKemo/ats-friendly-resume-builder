import React from 'react';
import { motion } from 'framer-motion';
import Button from '../ui/Button';
import Mascot from '../brand/Mascot';
import { useAuth } from '../../context/AuthContext';

const CTASection = () => {
  const { user } = useAuth();
  return (
    <section className="bg-white py-20 dark:bg-[#070a10] md:py-24">
      <div className="container mx-auto max-w-6xl px-4">
        <motion.div
          className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 px-6 pt-14 text-white shadow-2xl shadow-blue-900/25 md:px-14 md:pt-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="float-slow pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="float-slower pointer-events-none absolute -bottom-32 -left-20 -z-10 h-80 w-80 rounded-full bg-sky-400/25 blur-3xl" aria-hidden="true" />

          <div className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="pb-14 text-center md:pb-16 md:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Ready to build your next application?</h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-blue-100">
                Start for free, check common ATS issues, and export to PDF or Word. Premium AI can help draft wording from your background; you stay in control of every final detail.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:items-start">
                <Button
                  size="lg"
                  variant="ghost"
                  as="link"
                  to={user ? '/new' : '/signup'}
                  animate={false}
                  className="!bg-white px-8 !text-blue-700 shadow-lg shadow-blue-950/20 hover:!bg-blue-50"
                >
                  {user ? 'Start Building Now' : 'Get Started For Free'}
                </Button>
                <p className="text-sm font-medium text-blue-100 sm:ml-2 sm:self-center">
                  No credit card required. Upgrade anytime.
                </p>
              </div>
            </div>
            <div className="mx-auto w-40 md:w-full">
              <Mascot mood="idle" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
