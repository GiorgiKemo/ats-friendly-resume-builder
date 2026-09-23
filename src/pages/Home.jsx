import React from 'react';
import HeroSection from '../components/home/HeroSection';
import FeaturesSection from '../components/home/FeaturesSection';
import PremiumFeatures from '../components/home/PremiumFeatures';
import HowItWorksSection from '../components/home/HowItWorksSection';
import CTASection from '../components/home/CTASection';
import Button from '../components/ui/Button';

const Home = () => {
  return (
    <div className="bg-white dark:bg-slate-900">
      <HeroSection />
      <FeaturesSection />
      <PremiumFeatures />
      <section className="py-16 bg-blue-50 dark:bg-slate-800/60">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mx-auto max-w-3xl rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Human resume help</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Want help tailoring one resume?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-700 dark:text-slate-300">
              Ask about the $99 one-resume, one-target-job service. We confirm availability, scope, and payment details before work begins, and you approve every factual change. No interview or hiring outcome is promised.
            </p>
            <div className="mt-5">
              <Button as="link" to="/contact?offer=concierge" size="lg" animate={false}>
                Request a $99 slot
              </Button>
            </div>
          </div>
        </div>
      </section>
      <HowItWorksSection />
      <CTASection />
    </div>
  );
};

export default Home;
