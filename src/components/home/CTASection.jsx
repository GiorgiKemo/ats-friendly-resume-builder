import React from 'react';
import Button from '../ui/Button';
import AnimatedElement from '../ui/AnimatedElement';
import { fadeInUp } from '../../utils/animationVariants';
import { useAuth } from '../../context/AuthContext';

const CTASection = () => {
  const { user } = useAuth();
  return (
    <div className="bg-white py-16 dark:bg-slate-900 md:py-20">
      <div className="container mx-auto max-w-6xl px-4">
        <AnimatedElement variants={fadeInUp}>
          <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 px-6 py-14 text-center text-white shadow-xl shadow-blue-900/20 md:px-16">
            <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" aria-hidden="true" />
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">Ready to build your next application?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-blue-100">
              Start for free, check common ATS issues, and export to PDF or Word. Premium AI can help draft wording from your background; you stay in control of every final detail.
            </p>
            <div className="mt-8 flex justify-center">
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
            </div>
            <p className="mt-4 text-sm font-medium text-blue-100">
              No credit card required. Upgrade anytime.
            </p>
          </div>
        </AnimatedElement>
      </div>
    </div>
  );
};

export default CTASection;
