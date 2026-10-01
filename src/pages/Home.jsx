import React from 'react';
import HeroSection from '../components/home/HeroSection';
import FeaturesSection from '../components/home/FeaturesSection';
import PremiumFeatures from '../components/home/PremiumFeatures';
import HowItWorksSection from '../components/home/HowItWorksSection';
import CTASection from '../components/home/CTASection';
import Button from '../components/ui/Button';
import ResumeblePartnerCard from '../components/partners/ResumeblePartnerCard';

const Home = () => {
  return (
    <div className="bg-white dark:bg-slate-900">
      <HeroSection />
      <FeaturesSection />
      <PremiumFeatures />
      <section className="bg-slate-50 py-16 dark:bg-slate-800/60 md:py-20">
        <div className="container mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-900/[0.03] dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Human resume help</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Want help tailoring one resume?</h2>
            <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
              Ask about the $99 one-resume, one-target-job service. We confirm availability, scope, and payment details before work begins, and you approve every factual change. No interview or hiring outcome is promised.
            </p>
            <div className="mt-auto pt-6">
              <Button as="link" to="/contact?offer=concierge" animate={false}>
                Request a $99 slot
              </Button>
            </div>
          </div>
          <ResumeblePartnerCard source="home" />
        </div>
      </section>
      <HowItWorksSection />
      <CTASection />
    </div>
  );
};

export default Home;
